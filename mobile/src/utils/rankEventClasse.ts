type RankEvent = {
  tipo?: unknown;
  referencia?: unknown;
  classe_id?: unknown;
};

function positiveInteger(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

/** Resolves the class used by the ranking for an event. */
export function resolveRankEventClasseId(event: RankEvent): number | null {
  const directClass = positiveInteger(event.classe_id);
  if (directClass != null) return directClass;

  const reference = String(event.referencia ?? "").trim();
  const classReference = reference.match(/^classe:(\d+)(?::|$)/i);
  return classReference?.[1] ? positiveInteger(classReference[1]) : null;
}
