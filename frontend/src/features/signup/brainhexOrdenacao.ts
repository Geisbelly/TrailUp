/**
 * Bloco de ordenacao forcada — a parte ipsativa do BrainHex original.
 *
 * O instrumento validado (Nacke, Bateman & Mandryk, 2014) tem DUAS partes: a
 * escala de afinidade e a ordenacao de sete afirmacoes de preferencia forte,
 * que e' o que define classe primaria e subclasse. O TrailUp implementou so' a
 * primeira. Esta e' a segunda.
 *
 * POR QUE ELA IMPORTA. A escala Likert mede preferencia E estilo de resposta
 * misturados; a ordenacao e' imune ao estilo por construcao — concordar com
 * tudo nao ajuda quando e' preciso dizer o que vem primeiro. Em compensacao
 * ela e' grosseira: uma observacao ordinal por perfil, sem intensidade.
 *
 * As duas se corrigem. E a CONCORDANCIA entre elas e' informacao por si: quando
 * o que a pessoa diz preferir (ordenacao) bate com o que ela marcou na escala,
 * ha' convergencia entre dois metodos e a confianca sobe; quando diverge, o
 * prior e' fraco e isso tem de aparecer em vez de sumir numa media.
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

/**
 * Uma afirmacao de preferencia forte por perfil, no espirito das do
 * instrumento original: descrevem o MOMENTO que a pessoa busca, nao uma virtude
 * que ela deveria ter. Isso reduz desejabilidade social — nenhuma das sete e'
 * "a resposta certa" numa escola.
 */
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

/**
 * Posicao -> escore ja' centrado em zero.
 *
 * Com 7 perfis: 1o lugar = +3 … 4o = 0 … 7o = -3. A media e' zero por
 * construcao, igual ao escore centrado da escala — os dois ficam na mesma
 * unidade e podem ser combinados sem reescalar.
 */
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
 * Concordancia entre os dois metodos: correlacao de postos (Spearman) entre a
 * ordem que a escala sugere e a ordem que a pessoa declarou.
 *
 * +1 = os dois dizem a mesma coisa; 0 = nao se falam; -1 = opostos. Alimenta a
 * confianca do prior, nao o escore: metodos que divergem nao se anulam, eles
 * avisam que ha' menos certeza.
 */
export function concordanciaEntreMetodos(
  escala: Record<string, number>,
  ordenacao: Record<string, number>,
): number {
  const perfis = PERFIS_EM_ORDEM.filter((p) => p in escala && p in ordenacao);
  if (perfis.length < 3) return 0;

  const postos = (valores: Record<string, number>) => {
    const ordenado = [...perfis].sort((a, b) => valores[b] - valores[a]);
    const mapa = new Map<string, number>();
    ordenado.forEach((p, i) => mapa.set(p, i + 1));
    return mapa;
  };

  const pa = postos(escala);
  const pb = postos(ordenacao);
  const n = perfis.length;
  // Spearman por diferenca de postos. Sem empates (a ordenacao e' forcada e a
  // escala e' desempatada pela ordem de `sort`), entao a forma simples vale.
  const somaD2 = perfis.reduce((soma, p) => soma + (pa.get(p)! - pb.get(p)!) ** 2, 0);
  const rho = 1 - (6 * somaD2) / (n * (n * n - 1));
  return Math.max(-1, Math.min(1, rho));
}

/**
 * Prior final: escala centrada + ordenacao, com a concordancia virando ajuste
 * de confianca.
 *
 * `pesoOrdenacao` controla quanto a parte ipsativa pesa. O default 0.5 trata as
 * duas como igualmente informativas — a escala tem mais resolucao, a ordenacao
 * tem menos vies. Nao ha' dado proprio para calibrar isso ainda; quando a fase
 * 3 trouxer comportamento, ele vira parametro ajustavel contra evidencia, nao
 * contra gosto.
 */
export function combinarPrior(params: {
  escalaCentrada: Record<string, number>;
  ordenacao: Record<BrainHexProfileKey, number>;
  confiancaDaEscala: number;
  pesoOrdenacao?: number;
}): { afinidade: Record<BrainHexProfileKey, number>; confianca: number; concordancia: number } {
  const { escalaCentrada, ordenacao, confiancaDaEscala } = params;
  const peso = Math.min(1, Math.max(0, params.pesoOrdenacao ?? 0.5));

  const afinidade = {} as Record<BrainHexProfileKey, number>;
  for (const perfil of PERFIS_EM_ORDEM) {
    const daEscala = Number(escalaCentrada[perfil] ?? 0);
    const daOrdem = Number(ordenacao[perfil] ?? 0);
    afinidade[perfil] = (1 - peso) * daEscala + peso * daOrdem;
  }

  const concordancia = concordanciaEntreMetodos(escalaCentrada, ordenacao);
  // Concordancia negativa nao derruba a confianca a zero: ela e' um sinal entre
  // outros, e o cadastro precisa entregar um perfil de qualquer jeito.
  const ajuste = 0.6 + 0.4 * ((concordancia + 1) / 2);
  return {
    afinidade,
    confianca: Math.min(1, Math.max(0.15, confiancaDaEscala * ajuste)),
    concordancia,
  };
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
 * Ordem inicial embaralhada de forma DETERMINISTICA por semente.
 *
 * Embaralhar importa: comecar sempre na mesma ordem cria vies de ancoragem --
 * quem nao mexe entrega a ordem que o sistema sugeriu, nao a sua. Deterministico
 * importa para o teste, e para a ordem nao mudar se o componente re-renderizar.
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
