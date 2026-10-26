/**
 * Recomendação exploratória do TrailUp: regra legada, não teste validado.
 * Soma por eixo -> mapeamento ponderado -> centragem -> mistura com ranking.
 * Mantemos pesos/temperatura históricos sem lhes atribuir apoio empírico.
 * Ver docs/analises/issue-1-adaptacao-evidencias.md antes de mudar a fórmula.
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
  confianca: null;
  concordancia: number | null;
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

/** Divisor da soma ponderada legada. Os coeficientes não foram calibrados. */
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

  // A soma por eixo e a ordenação têm amplitudes diferentes. Centragem não
  // corrige isso; conservar a regra não equivale a validar essa combinação.
  const porPerfil = mapAxisToProfiles(calculateAxisScores(answers)) as Record<string, number>;
  // Media ponderada, nao soma ponderada: sem isto, quem marca tudo igual sai
  // com o perfil de maior soma de pesos. Ver SOMA_DOS_PESOS.
  const escalaCentrada = centrarPorRespondente(normalizarPorPesoDoMapeamento(porPerfil));

  // Descritores brutos; divergência entre pares não identifica sua causa.
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

/** Parâmetro legado de exibição, sem calibração como probabilidade. */
export const TEMPERATURA_DA_AFINIDADE = 1.2;

/**
 * Composição relativa para o contrato de sete inteiros somando 100.
 * Reserva o piso ANTES de repartir o restante por maior resto. Retirar depois
 * do líder podia inverter perfis próximos (#1, caso 843). Isso é apuração
 * numérica, não evidência de sete classes exclusivas ou chance de acerto.
 */
export function afinidadeEmPercentual(
  centrado: Record<string, number>,
  temperatura: number = TEMPERATURA_DA_AFINIDADE,
): Record<BrainHexProfileKey, number> {
  const chaves = Object.keys(centrado).sort();
  if (chaves.length !== 7 || chaves.some(k => !Number.isFinite(centrado[k]))) {
    throw new Error("Afinidade requer sete escores finitos");
  }
  if (!Number.isFinite(temperatura) || temperatura <= 0) throw new Error("Temperatura inválida");
  const maximo = Math.max(...chaves.map(k => centrado[k]));
  const exps = chaves.map(k => Math.exp((centrado[k] - maximo) / temperatura));
  const soma = exps.reduce((a, b) => a + b, 0);
  const exatos = exps.map(e => (e / soma) * (100 - chaves.length));
  const base = exatos.map(v => 1 + Math.floor(v));
  const sobra = 100 - base.reduce((a, b) => a + b, 0);
  const restos = chaves.map((key, i) => ({ key, i, resto: exatos[i] - Math.floor(exatos[i]) }))
    .sort((a, b) => b.resto - a.resto || a.key.localeCompare(b.key));
  for (const { i } of restos.slice(0, sobra)) base[i]++;
  return Object.fromEntries(chaves.map((k, i) => [k, base[i]])) as Record<BrainHexProfileKey, number>;
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
  // Mesmo contrato consumido por missões/SQL: percentual DESC, nome ASC.
  const dominante = perfilDominante(percentual);
  const ordenado = (Object.keys(percentual) as BrainHexProfileKey[])
    .map((key) => ({
      key,
      label: PROFILE_LABEL[key],
      percent: percentual[key],
      afinidade: prior.afinidade[key],
    }))
    .sort((a, b) => b.percent - a.percent || a.key.localeCompare(b.key));

  return { ...prior, percentual, dominante, ordenado };
}
