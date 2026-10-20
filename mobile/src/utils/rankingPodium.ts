type PositionedStudent = { id_aluno: string; posicao: number | null };

export function selectPodium<T extends PositionedStudent>(
  rows: readonly T[],
): T[] {
  const seen = new Set<string>();
  return [...rows]
    .filter(
      (row) =>
        row.posicao !== null &&
        Number.isInteger(row.posicao) &&
        row.posicao >= 1 &&
        row.posicao <= 3,
    )
    .sort((a, b) => a.posicao! - b.posicao!)
    .filter((row) => {
      if (seen.has(row.id_aluno)) return false;
      seen.add(row.id_aluno);
      return true;
    });
}

/**
 * Critérios que `vw_rank_posicoes_por_classe` devolve em PORCENTAGEM. `acertos` é um deles e
 * ficava de fora: a view passou a calculá-lo em `20261021_06` (antes caía no `ELSE 0` e todo
 * ranking de acertos mostrava zero), e sem esta lista o 77% do aluno apareceria como "77".
 */
const CRITERIOS_EM_PORCENTAGEM = new Set(["percentual", "acertos"]);

/** Rótulo da coluna de pontuação. `ranqueada` é pontuação de verdade, então cai no padrão. */
export function rotuloDoCriterio(criterion: string | null | undefined): string {
  if (criterion === "tempo") return "Tempo";
  if (criterion === "percentual") return "Progresso";
  if (criterion === "acertos") return "Acertos";
  if (criterion === "missoes") return "Missões";
  if (criterion === "elo") return "Elo";
  return "Pontos";
}

export function formatRankScore(
  value: number | null | undefined,
  criterion: string | null,
): string {
  if (value == null || !Number.isFinite(value)) return "--";
  if (CRITERIOS_EM_PORCENTAGEM.has(criterion ?? "")) return `${Math.round(value)}%`;
  if (criterion === "tempo") {
    const minutes = Math.max(0, Math.round(value));
    return minutes < 60
      ? `${minutes}min`
      : `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}min`;
  }
  return String(Math.round(value));
}
