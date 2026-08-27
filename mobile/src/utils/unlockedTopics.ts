export function mergeUnlockedTopicIds(
  previous: readonly string[],
  incoming: readonly string[],
) {
  return Array.from(
    new Set(
      [...previous, ...incoming]
        .map((id) => String(id).trim())
        .filter(Boolean),
    ),
  );
}

export function buildUnlockedTopicsStorageKey(alunoId: string, classeId: number) {
  // v2 descarta o cache produzido pela regra permissiva antiga, que podia
  // interpretar simples visualização como desbloqueio.
  return `@trailup/topicos-desbloqueados-v3/${alunoId}/${classeId}`;
}

export function normalizeRemoteTopicLocked(
  locked: unknown,
  unlocked?: unknown,
  status?: unknown,
): boolean {
  if (unlocked === true || unlocked === 1) return false;

  const unlockedText = String(unlocked ?? "").trim().toLowerCase();
  if (["true", "1", "unlocked", "open", "available", "desbloqueado", "disponivel"].includes(unlockedText)) {
    return false;
  }

  if (typeof locked === "boolean") return locked;
  if (typeof locked === "number") return locked !== 0;

  const lockedText = String(locked ?? "").trim().toLowerCase();
  if (["false", "0", "unlocked", "open", "available", "desbloqueado", "disponivel"].includes(lockedText)) {
    return false;
  }
  if (["true", "1", "locked", "blocked", "bloqueado"].includes(lockedText)) {
    return true;
  }

  const statusText = String(status ?? "").trim().toLowerCase();
  if (["unlocked", "open", "available", "desbloqueado", "disponivel"].includes(statusText)) {
    return false;
  }

  // Campo ausente ou desconhecido nunca libera um tópico sozinho.
  return true;
}
