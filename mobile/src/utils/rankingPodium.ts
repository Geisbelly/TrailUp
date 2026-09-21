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

export function formatRankScore(
  value: number | null | undefined,
  criterion: string | null,
): string {
  if (value == null || !Number.isFinite(value)) return "--";
  if (criterion === "percentual") return `${Math.round(value)}%`;
  if (criterion === "tempo") {
    const minutes = Math.max(0, Math.round(value));
    return minutes < 60
      ? `${minutes}min`
      : `${Math.floor(minutes / 60)}h ${String(minutes % 60).padStart(2, "0")}min`;
  }
  return String(Math.round(value));
}
