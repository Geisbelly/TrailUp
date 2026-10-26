/**
 * Ordenação de preferências da adaptação exploratória TrailUp.
 * Não reproduz nem herda validade do instrumento BrainHex original.
 * Fundamentação e limites: docs/analises/issue-1-adaptacao-evidencias.md.
 */
import type { BrainHexProfileKey } from "./brainhex";

export const PERFIS_EM_ORDEM: BrainHexProfileKey[] = [
  "seeker",
  "survivor",
  "daredevil",
  "mastermind",
  "conqueror",
  "socializer",
  "achiever",
];

/** Afirmações autorais: compreensão e desejabilidade social não foram avaliadas localmente. */
export const AFIRMACOES_DE_ORDENACAO: Record<BrainHexProfileKey, string> = {
  seeker: "Descobrir algo que não estava no caminho principal.",
  survivor: "Encarar algo que parecia difícil demais e continuar até vencer.",
  daredevil: "A adrenalina de arriscar e agir rápido.",
  mastermind: "Entender como as peças se encaixam e montar a estratégia.",
  conqueror: "Vencer uma disputa difícil contra outras pessoas.",
  socializer: "Construir algo junto com outras pessoas.",
  achiever: "Concluir tudo e ver o 100% marcado.",
};

export type OrdenacaoRespondida = BrainHexProfileKey[];

export class OrdenacaoInvalida extends Error {}

/**
 * Valida a ordenacao: os sete perfis, uma vez cada. Ordenacao parcial ou com
 * repeticao nao vira "meio escore" — vira erro, porque pontuar uma lista
 * incompleta daria vantagem silenciosa a quem nao terminou.
 */
export function validarOrdenacao(ordem: readonly string[]): OrdenacaoRespondida {
  if (ordem.length !== PERFIS_EM_ORDEM.length) {
    throw new OrdenacaoInvalida(
      `ordenação precisa ter ${PERFIS_EM_ORDEM.length} itens, recebeu ${ordem.length}`,
    );
  }
  const vistos = new Set(ordem);
  if (vistos.size !== ordem.length) {
    throw new OrdenacaoInvalida("ordenação tem item repetido");
  }
  for (const perfil of ordem) {
    if (!PERFIS_EM_ORDEM.includes(perfil as BrainHexProfileKey)) {
      throw new OrdenacaoInvalida(`perfil desconhecido na ordenação: ${perfil}`);
    }
  }
  return ordem as OrdenacaoRespondida;
}

/** Posição -> escore -3..3. Centragem não torna escalas comensuráveis. */
export function pontuarOrdenacao(
  ordem: OrdenacaoRespondida,
): Record<BrainHexProfileKey, number> {
  const meio = (ordem.length + 1) / 2;
  const saida = {} as Record<BrainHexProfileKey, number>;
  ordem.forEach((perfil, indice) => {
    saida[perfil] = meio - (indice + 1);
  });
  return saida;
}

/**
 * Spearman = Pearson dos postos médios; empates não recebem ordens artificiais.
 * Sem variância, incompleto ou não finito: null (não estimável), nunca zero.
 * Referências: scipy.stats.spearmanr / rankdata; ver o parecer de adaptação.
 * É descrição de associação entre sete escores, não confiança psicométrica.
 */
export function concordanciaEntreMetodos(
  escala: Record<string, number>,
  ordenacao: Record<string, number>,
): number | null {
  const perfis = PERFIS_EM_ORDEM;
  if (perfis.some(p => !Number.isFinite(escala[p]) || !Number.isFinite(ordenacao[p]))) return null;
  const postos = (valores: Record<string, number>) => {
    const ordenado = [...perfis].sort((a, b) => valores[b] - valores[a]);
    const mapa = new Map<string, number>();
    for (let inicio = 0; inicio < ordenado.length;) {
      let fim = inicio + 1;
      // As médias ponderadas podem diferir só por erro de ponto flutuante.
      // Esta tolerância cobre arredondamento numérico, não empates substantivos.
      const primeiro = valores[ordenado[inicio]];
      while (fim < ordenado.length && Math.abs(valores[ordenado[fim]] - primeiro) <=
        16 * Number.EPSILON * Math.max(1, Math.abs(primeiro), Math.abs(valores[ordenado[fim]]))) fim++;
      const postoMedio = (inicio + 1 + fim) / 2;
      for (let i = inicio; i < fim; i++) mapa.set(ordenado[i], postoMedio);
      inicio = fim;
    }
    return perfis.map(p => mapa.get(p)!);
  };
  const a = postos(escala), b = postos(ordenacao);
  const centro = (perfis.length + 1) / 2;
  let produto = 0, variacaoA = 0, variacaoB = 0;
  for (let i = 0; i < perfis.length; i++) {
    const da = a[i] - centro, db = b[i] - centro;
    produto += da * db;
    variacaoA += da * da;
    variacaoB += db * db;
  }
  if (variacaoA === 0 || variacaoB === 0) return null;
  return Math.max(-1, Math.min(1, produto / Math.sqrt(variacaoA * variacaoB)));
}

/**
 * Regra de recomendação LEGADA: não é estimador probabilístico validado.
 * Conservamos a mistura numérica para não inventar pesos substitutos sem dados.
 * 0.5 não significa fontes igualmente informativas; ver análise de sensibilidade
 * e limites em docs/analises/issue-1-adaptacao-evidencias.md.
 * Concordância não é convertida em confiança: não existe calibração própria.
 */
export function combinarPrior(params: {
  escalaCentrada: Record<string, number>;
  ordenacao: Record<BrainHexProfileKey, number>;
  pesoOrdenacao?: number;
}): { afinidade: Record<BrainHexProfileKey, number>; confianca: null; concordancia: number | null } {
  const { escalaCentrada, ordenacao } = params;
  const peso = Math.min(1, Math.max(0, params.pesoOrdenacao ?? 0.5));
  const afinidade = {} as Record<BrainHexProfileKey, number>;
  for (const perfil of PERFIS_EM_ORDEM) {
    afinidade[perfil] = (1 - peso) * Number(escalaCentrada[perfil] ?? 0) + peso * ordenacao[perfil];
  }
  return { afinidade, confianca: null, concordancia: concordanciaEntreMetodos(escalaCentrada, ordenacao) };
}

/**
 * Move um item da ordenacao uma posicao para cima ou para baixo.
 *
 * Fora dos limites devolve a MESMA lista (identidade preservada), para o React
 * nao re-renderizar a toa e para o teste poder afirmar que nada mudou.
 *
 * Setas em vez de arrastar e' decisao de acessibilidade: drag-and-drop e' ruim
 * no teclado, ruim com leitor de tela e exige precisao motora. A ordenacao e'
 * justamente a parte do instrumento que nao pode sair enviesada por
 * dificuldade de manipulacao -- um aluno que nao consegue arrastar entregaria
 * uma ordem que nao e' a dele.
 */
export function moverNaOrdenacao(
  ordem: readonly BrainHexProfileKey[],
  indice: number,
  direcao: -1 | 1,
): BrainHexProfileKey[] {
  const destino = indice + direcao;
  if (indice < 0 || indice >= ordem.length) return ordem as BrainHexProfileKey[];
  if (destino < 0 || destino >= ordem.length) return ordem as BrainHexProfileKey[];
  const copia = [...ordem];
  [copia[indice], copia[destino]] = [copia[destino], copia[indice]];
  return copia;
}

/**
 * Apresentação inicial determinística por semente, não preferência inferida.
 * O wizard exige confirmação explícita; embaralhar não comprova ausência de viés.
 */
export function ordemInicial(semente: number): BrainHexProfileKey[] {
  const copia = [...PERFIS_EM_ORDEM];
  let estado = Math.abs(Math.trunc(semente)) || 1;
  for (let i = copia.length - 1; i > 0; i -= 1) {
    // LCG simples: previsivel de proposito, nao e' criptografia.
    estado = (estado * 1103515245 + 12345) % 2147483648;
    const j = estado % (i + 1);
    [copia[i], copia[j]] = [copia[j], copia[i]];
  }
  return copia;
}
