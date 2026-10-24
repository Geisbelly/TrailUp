/**
 * Operações descritivas da adaptação TrailUp, sem estimativa de confiança.
 * Reversos não demonstram aquiescência individual: van Sonderen et al. (2013).
 * Ver docs/analises/issue-1-adaptacao-evidencias.md.
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
  /** Não calibrado. null é ausência de estimativa, não confiança zero. */
  indice: null;
  /** Desvio-padrao das respostas. ~0 = marcou tudo igual. */
  desvio: number;
  /** Nome legado: divergência média entre pares, não diagnóstico de aquiescência. */
  aquiescencia: number;
  motivos: string[];
};

/** Item reverso: concordar com ele significa o oposto do eixo. */
export function pontuarItem(
  resposta: number | undefined,
  reverso: boolean,
  escalaMax: number,
): number {
  // Ausência não é discordância: o cálculo parcial serve somente à prévia.
  if (!Number.isFinite(resposta)) return 0;
  const bruto = Math.min(Math.max(Number(resposta), 0), escalaMax);
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
 * Descritores para auditoria, sem penalidades por rapidez, uniformidade ou
 * divergência de itens. Não há limiares validados no público-alvo. A função
 * mantém o nome/campos históricos; seus números não classificam a pessoa.
 */
export function qualidadeDaResposta(params: {
  respostasBrutas: readonly number[];
  paresReversos: readonly { direto: number; reverso: number }[];
  escalaMax: number;
  segundosPorItem?: number | null;
}): QualidadeDaResposta {
  const respostas = params.respostasBrutas.filter(Number.isFinite);
  const pares = params.paresReversos.filter(p => Number.isFinite(p.direto) && Number.isFinite(p.reverso));
  return {
    indice: null,
    desvio: desvioPadrao(respostas),
    aquiescencia: params.escalaMax > 0 ? media(pares.map(p =>
      Math.abs(p.direto + p.reverso - params.escalaMax) / params.escalaMax)) : 0,
    motivos: ["instrumento exploratorio; confianca nao estimada"],
  };
}
