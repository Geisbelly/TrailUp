import { formatRankScore } from "./rankingPodium";

// Card "Sua posição" do Ranking na web em tela larga (#346, protótipo v4):
// a minha linha, o colega logo acima e quanto falta para passá-lo. Função pura.
type Linha = { id_aluno: string; nome_aluno: string; posicao: number | null; pontuacao: number | null };

export type ResumoMinhaPosicao<T extends Linha> = {
  minha: T | null;
  /** Colega com a maior posição ainda acima da minha (empatados não contam). */
  acima: T | null;
  /** Diferença de pontuação até o colega acima, já formatada; null quando não há colega acima. */
  falta: string | null;
};

export function formatarFalta(diferenca: number, criterio: string | null): string {
  const valor = Math.max(0, diferenca);
  if (criterio === "tempo") return formatRankScore(valor, "tempo");
  const n = Math.round(valor);
  if (criterio === "percentual") return `${n} ${n === 1 ? "ponto percentual" : "pontos percentuais"}`;
  if (criterio === "elo") return `${n} ${n === 1 ? "ponto" : "pontos"} de Elo`;
  return `${n} ${n === 1 ? "ponto" : "pontos"}`;
}

export function resumirMinhaPosicao<T extends Linha>(
  linhas: readonly T[],
  meuId: string | null | undefined,
  criterio: string | null,
): ResumoMinhaPosicao<T> {
  const minha = meuId ? linhas.find((l) => l.id_aluno === meuId) ?? null : null;
  if (!minha || typeof minha.posicao !== "number") return { minha, acima: null, falta: null };
  const minhaPosicao = minha.posicao;
  const acima = linhas.reduce<T | null>((melhor, l) => {
    if (typeof l.posicao !== "number" || l.posicao >= minhaPosicao) return melhor;
    return melhor === null || (melhor.posicao ?? 0) < l.posicao ? l : melhor;
  }, null);
  const falta = acima ? formatarFalta((acima.pontuacao ?? 0) - (minha.pontuacao ?? 0), criterio) : null;
  return { minha, acima, falta };
}
