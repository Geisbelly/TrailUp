/**
 * Escore do quiz BrainHex com estilo de resposta controlado e confianca
 * declarada. Ver docs/superpowers/specs/2026-10-02-perfil-brainhex-probabilistico-design.md
 *
 * O escore antigo somava itens positivos por eixo e normalizava para
 * percentual. Isso mede duas coisas misturadas: a preferencia da pessoa e o
 * quanto ela concorda com afirmacoes em geral. Quem marca 5 em tudo recebia um
 * perfil decidido pelos PESOS do mapeamento, nao pela propria preferencia.
 *
 * Aqui sao tres contas separadas:
 *
 * 1. `pontuarItensReversos` — item reverso vale `SCALE_MAX - resposta`. Quem
 *    concorda com o item E com o reverso esta aquiescendo, nao preferindo.
 * 2. `centrarPorRespondente` — subtrai a media do PROPRIO respondente de cada
 *    eixo (ipsatizacao). Depois disso o escore responde "o que esta pessoa
 *    prefere MAIS", nao "o quanto ela concorda".
 * 3. `qualidadeDaResposta` — variancia, concordancia com reversos e tempo por
 *    item viram um indice 0..1 que se torna a CONFIANCA inicial do perfil.
 *
 * A confianca existe porque o perfil alimenta cor, voz, tom editorial e midia
 * gerada. Entregar rotulo sem incerteza faz o sistema tratar palpite como fato.
 */

export type RespostaBruta = Record<string, number>;

export type ItemPontuado = {
  id: string;
  axis: string;
  /** Valor ja' corrigido para a direcao do item (reverso invertido). */
  valor: number;
  reverso: boolean;
};

export type QualidadeDaResposta = {
  /** 0..1. Entra como confianca inicial do perfil. */
  indice: number;
  /** Desvio-padrao das respostas. ~0 = marcou tudo igual. */
  desvio: number;
  /** 0..1 — quanto a pessoa concordou com o item E com o reverso dele. */
  aquiescencia: number;
  motivos: string[];
};

/** Item reverso: concordar com ele significa o oposto do eixo. */
export function pontuarItem(
  resposta: number | undefined,
  reverso: boolean,
  escalaMax: number,
): number {
  const bruto = Number.isFinite(resposta) ? Math.min(Math.max(Number(resposta), 0), escalaMax) : 0;
  return reverso ? escalaMax - bruto : bruto;
}

function media(valores: readonly number[]): number {
  if (valores.length === 0) return 0;
  return valores.reduce((s, v) => s + v, 0) / valores.length;
}

function desvioPadrao(valores: readonly number[]): number {
  if (valores.length < 2) return 0;
  const m = media(valores);
  return Math.sqrt(media(valores.map((v) => (v - m) ** 2)));
}

/**
 * Media por eixo (nao soma): eixos com numero diferente de itens passam a ser
 * comparaveis. No instrumento antigo `immersion` tinha 3 itens e os outros 4,
 * entao a soma dele era estruturalmente menor — e ele entrava com peso em tres
 * perfis.
 */
export function mediaPorEixo(itens: readonly ItemPontuado[]): Record<string, number> {
  const porEixo = new Map<string, number[]>();
  for (const item of itens) {
    const lista = porEixo.get(item.axis) ?? [];
    lista.push(item.valor);
    porEixo.set(item.axis, lista);
  }
  const saida: Record<string, number> = {};
  for (const [eixo, valores] of porEixo) saida[eixo] = media(valores);
  return saida;
}

/**
 * Ipsatizacao: subtrai a media do proprio respondente. O resultado e' relativo
 * — positivo = acima do que ESTA pessoa marca em geral.
 */
export function centrarPorRespondente(
  porEixo: Record<string, number>,
): Record<string, number> {
  const valores = Object.values(porEixo);
  const centro = media(valores);
  const saida: Record<string, number> = {};
  for (const [eixo, valor] of Object.entries(porEixo)) saida[eixo] = valor - centro;
  return saida;
}

/**
 * Indice de qualidade da resposta -> confianca inicial.
 *
 * Tres sinais, cada um com motivo escrito para a decisao ser auditavel:
 * - variancia proxima de zero (marcou tudo igual);
 * - aquiescencia alta (concordou com o item e com o reverso);
 * - tempo por item implausivel, quando medido.
 *
 * Nunca devolve 0: resposta ruim reduz a confianca, nao apaga o perfil — o
 * cadastro precisa entregar alguma coisa.
 */
export function qualidadeDaResposta(params: {
  respostasBrutas: readonly number[];
  paresReversos: readonly { direto: number; reverso: number }[];
  escalaMax: number;
  segundosPorItem?: number | null;
}): QualidadeDaResposta {
  const { respostasBrutas, paresReversos, escalaMax, segundosPorItem } = params;
  const motivos: string[] = [];
  let indice = 1;

  const desvio = desvioPadrao(respostasBrutas);
  // Abaixo de 0.5 numa escala 0..5 a pessoa praticamente nao diferenciou.
  if (desvio < 0.5) {
    indice -= 0.4;
    motivos.push("respostas quase todas iguais");
  } else if (desvio < 1) {
    indice -= 0.15;
    motivos.push("pouca variacao entre respostas");
  }

  // Par coerente: direto alto + reverso baixo (ou o contrario). Incoerente:
  // os dois altos. A soma de um par coerente fica perto de `escalaMax`.
  const incoerencias = paresReversos.map(({ direto, reverso }) =>
    Math.abs(direto + reverso - escalaMax) / escalaMax,
  );
  const aquiescencia = paresReversos.length > 0 ? media(incoerencias) : 0;
  if (aquiescencia > 0.4) {
    indice -= 0.35;
    motivos.push("concordou com afirmacoes opostas");
  } else if (aquiescencia > 0.25) {
    indice -= 0.15;
    motivos.push("alguma inconsistencia entre item e reverso");
  }

  if (typeof segundosPorItem === "number" && segundosPorItem > 0 && segundosPorItem < 1.5) {
    indice -= 0.25;
    motivos.push("tempo de resposta implausivel");
  }

  return {
    indice: Math.min(1, Math.max(0.15, indice)),
    desvio,
    aquiescencia,
    motivos,
  };
}
