/**
 * O pipeline inteiro do prior, numa funcao pura: respostas + ordem declarada
 * viram afinidade por perfil, confianca e concordancia.
 *
 * Mora aqui, e nao no componente, por dois motivos: da' para testar sem React,
 * e a conta e' a mesma que a fase 4 vai precisar reusar quando o comportamento
 * entrar como evidencia.
 *
 * Ordem das etapas (cada uma com seu porque em brainhexScoring.ts):
 *   itens -> reverso corrigido -> media por eixo -> perfis -> centragem
 *   intrapessoal -> combinacao com a ordenacao -> confianca
 */

import {
  BRAINHEX_QUESTIONS,
  PROFILE_LABEL,
  SCALE_MAX,
  calculateAxisScores,
  mapAxisToProfiles,
  type BrainHexAnswers,
  type BrainHexProfileKey,
} from "./brainhex";
import { combinarPrior, pontuarOrdenacao, validarOrdenacao } from "./brainhexOrdenacao";
import {
  centrarPorRespondente,
  pontuarItem,
  qualidadeDaResposta,
  type QualidadeDaResposta,
} from "./brainhexScoring";

export type PriorDoPerfil = {
  afinidade: Record<BrainHexProfileKey, number>;
  confianca: number;
  concordancia: number;
  qualidade: QualidadeDaResposta;
};

/** Pares (item direto, item reverso) declarados no instrumento. */
function paresReversos(answers: BrainHexAnswers) {
  const pares: { direto: number; reverso: number }[] = [];
  for (const q of BRAINHEX_QUESTIONS) {
    if (!q.reverse || !q.reversoDe) continue;
    const direto = answers[q.reversoDe];
    const reverso = answers[q.id];
    if (typeof direto !== "number" || typeof reverso !== "number") continue;
    pares.push({ direto, reverso });
  }
  return pares;
}

/**
 * Soma dos pesos de cada perfil em `mapAxisToProfiles`.
 *
 * ISTO CORRIGE UM VIES ESTRUTURAL, nao e' cosmetica. O mapeamento e' uma soma
 * PONDERADA com pesos desiguais: `seeker` recebe `curiosity*1.0 +
 * immersion*0.25` (soma 1.25) e `survivor` recebe `challenge*1.0` (soma 1.0).
 * Resultado: um respondente que marca exatamente o MESMO valor em todos os
 * itens sai com `seeker` acima de `survivor` — a preferencia vem dos pesos que
 * alguem escolheu a mao, nao da pessoa.
 *
 * A centragem intrapessoal nao resolve isso: ela remove o estilo do
 * respondente, nao o desequilibrio do mapeamento. Dividir pela soma dos pesos
 * transforma a soma ponderada em MEDIA ponderada, e ai' respondente plano sai
 * plano. A ordem entre perfis de quem de fato diferencia nao muda.
 *
 * Descoberto por um teste ("com a escala sem informacao, o dominante vem da
 * ordem declarada"), que falhou apontando `daredevil` — o perfil de maior soma
 * de pesos (1.5).
 */
const SOMA_DOS_PESOS: Record<BrainHexProfileKey, number> = {
  seeker: 1.25,      // curiosity 1.0 + immersion 0.25
  survivor: 1.0,     // challenge 1.0
  daredevil: 1.5,    // risk 1.0 + challenge 0.35 + immersion 0.15
  mastermind: 1.25,  // mastery 1.0 + curiosity 0.25
  conqueror: 1.25,   // competition 1.0 + challenge 0.25
  socializer: 1.15,  // social 1.0 + immersion 0.15
  achiever: 1.2,     // completion 1.0 + mastery 0.2
};

function normalizarPorPesoDoMapeamento(
  porPerfil: Record<string, number>,
): Record<string, number> {
  const saida: Record<string, number> = {};
  for (const [perfil, valor] of Object.entries(porPerfil)) {
    const peso = SOMA_DOS_PESOS[perfil as BrainHexProfileKey] ?? 1;
    saida[perfil] = valor / peso;
  }
  return saida;
}

export function calcularPrior(params: {
  answers: BrainHexAnswers;
  ordenacao: readonly string[];
  segundosPorItem?: number | null;
}): PriorDoPerfil {
  const { answers } = params;
  const ordenacao = validarOrdenacao(params.ordenacao);

  // Perfis a partir dos eixos, como o sistema ja' fazia — o mapeamento nao
  // muda. O que muda e' que o resultado passa a ser CENTRADO antes de competir
  // com a ordenacao, para os dois ficarem na mesma unidade.
  const porPerfil = mapAxisToProfiles(calculateAxisScores(answers)) as Record<string, number>;
  // Media ponderada, nao soma ponderada: sem isto, quem marca tudo igual sai
  // com o perfil de maior soma de pesos. Ver SOMA_DOS_PESOS.
  const escalaCentrada = centrarPorRespondente(normalizarPorPesoDoMapeamento(porPerfil));

  // A qualidade olha a resposta BRUTA: inverter os reversos antes esconderia
  // exatamente a aquiescencia que se quer medir.
  const brutas = BRAINHEX_QUESTIONS.map((q) => answers[q.id]).filter(
    (v): v is number => typeof v === "number",
  );
  const qualidade = qualidadeDaResposta({
    respostasBrutas: brutas,
    paresReversos: paresReversos(answers),
    escalaMax: SCALE_MAX,
    segundosPorItem: params.segundosPorItem ?? null,
  });

  const combinado = combinarPrior({
    escalaCentrada,
    ordenacao: pontuarOrdenacao(ordenacao),
    confiancaDaEscala: qualidade.indice,
  });

  return {
    afinidade: combinado.afinidade,
    confianca: combinado.confianca,
    concordancia: combinado.concordancia,
    qualidade,
  };
}

/** Perfil dominante do prior. Empate resolve pelo nome, para ser deterministico. */
export function perfilDominante(afinidade: Record<string, number>): BrainHexProfileKey {
  const entradas = Object.entries(afinidade).sort(
    (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]),
  );
  return (entradas[0]?.[0] ?? "mastermind") as BrainHexProfileKey;
}

/** Reexportado para quem so' precisa pontuar um item avulso. */
export { pontuarItem };

/**
 * Afinidade centrada -> percentual 0..100 somando 100, que e' o contrato de
 * `aluno_perfil.afinidade` (e do `fn_cadastrar_aluno_com_perfis`).
 *
 * Softmax, e nao "desloca e normaliza". Tres razoes:
 *
 * 1. O escore centrado tem valores negativos; dividir pela soma (o que
 *    `normalizeToPercent` fazia) com negativos produz percentual negativo ou
 *    explode quando a soma passa perto de zero — e a soma de um vetor centrado
 *    passa perto de zero POR CONSTRUCAO.
 * 2. "Desloca pelo minimo" zeraria sempre o ultimo colocado, afirmando
 *    afinidade nula com um perfil que a pessoa so' colocou em setimo.
 * 3. Afinidade como DISTRIBUICAO e' o que o perfil probabilistico quer dizer:
 *    "o quanto cada perfil explica esta pessoa", somando 1.
 *
 * `TEMPERATURA` controla o quao concentrado fica. Alta demais achata tudo em
 * ~14% e o dominante perde sentido; baixa demais manda quase 100% para o
 * primeiro e descarta o vetor, que o CLAUDE.md diz ser usado inteiro. 1.2 e'
 * um ponto de partida declarado, nao calibrado — nao ha' dado proprio ainda.
 */
export const TEMPERATURA_DA_AFINIDADE = 1.2;

export function afinidadeEmPercentual(
  centrado: Record<string, number>,
  temperatura: number = TEMPERATURA_DA_AFINIDADE,
): Record<BrainHexProfileKey, number> {
  const chaves = Object.keys(centrado);
  const t = temperatura > 0 ? temperatura : 1;
  const valores = chaves.map((k) => Number(centrado[k]) || 0);
  const maximo = Math.max(...valores);
  const exps = valores.map((v) => Math.exp((v - maximo) / t));
  const soma = exps.reduce((a, b) => a + b, 0) || 1;

  // Maior resto: distribui a sobra do arredondamento para quem mais perdeu, em
  // vez de empurrar tudo para o primeiro. Sem isso a soma pode nao dar 100, e
  // o banco guarda sete inteiros que precisam fechar.
  const exatos = exps.map((e) => (e / soma) * 100);
  const base = exatos.map(Math.floor);
  let sobra = 100 - base.reduce((a, b) => a + b, 0);
  const ordemDoResto = exatos
    .map((v, i) => ({ i, resto: v - Math.floor(v) }))
    .sort((a, b) => b.resto - a.resto || a.i - b.i);
  for (const { i } of ordemDoResto) {
    if (sobra <= 0) break;
    base[i] += 1;
    sobra -= 1;
  }

  // Piso de 1: zero afirmaria afinidade NULA com um perfil, e o CLAUDE.md diz
  // que o vetor inteiro e' usado, nao so' o dominante. Com dispersao ampla o
  // softmax manda o ultimo para <0.5% e o arredondamento zerava. Tira do maior,
  // que e' quem menos sente, e a soma segue 100.
  const PISO = 1;
  for (let i = 0; i < base.length; i += 1) {
    if (base[i] >= PISO) continue;
    const falta = PISO - base[i];
    let maior = 0;
    for (let j = 1; j < base.length; j += 1) if (base[j] > base[maior]) maior = j;
    if (base[maior] - falta < PISO) break; // nao ha' de onde tirar
    base[maior] -= falta;
    base[i] = PISO;
  }

  const saida = {} as Record<BrainHexProfileKey, number>;
  chaves.forEach((k, i) => {
    saida[k as BrainHexProfileKey] = base[i];
  });
  return saida;
}

export type PerfilComputado = PriorDoPerfil & {
  /** 0..100 somando 100 — o que `aluno_perfil` guarda. */
  percentual: Record<BrainHexProfileKey, number>;
  dominante: BrainHexProfileKey;
  ordenado: { key: BrainHexProfileKey; label: string; percent: number; afinidade: number }[];
};

/**
 * O resultado do cadastro, do jeito corrigido.
 *
 * Substitui `computeBrainHexResult` nos dois lugares que importam: o que a tela
 * MOSTRA e o que o banco GUARDA passam a vir da mesma conta — com reversos
 * pontuados, pesos do mapeamento normalizados, centragem intrapessoal e a
 * ordenacao forcada entrando no resultado.
 */
export function computarPerfil(params: {
  answers: BrainHexAnswers;
  ordenacao: readonly string[];
  segundosPorItem?: number | null;
}): PerfilComputado {
  const prior = calcularPrior(params);
  const percentual = afinidadeEmPercentual(prior.afinidade);
  const dominante = perfilDominante(prior.afinidade);
  const ordenado = (Object.keys(percentual) as BrainHexProfileKey[])
    .map((key) => ({
      key,
      label: PROFILE_LABEL[key],
      percent: percentual[key],
      afinidade: prior.afinidade[key],
    }))
    .sort((a, b) => b.afinidade - a.afinidade || a.key.localeCompare(b.key));

  return { ...prior, percentual, dominante, ordenado };
}
