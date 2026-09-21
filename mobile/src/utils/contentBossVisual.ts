type BossTopic = { id: number; conteudos?: { id: number; metadata?: unknown }[] };

export function resolveContentBossVisual(
  topics: BossTopic[], topicId?: number | null, itemKey?: string | null, contentId?: number | null,
): string | null {
  const keyMatch = /^content:(\d+)$/.exec(itemKey ?? '');
  const id = keyMatch ? Number(keyMatch[1]) : contentId;
  if (!id || !topicId) return null;
  const metadata = topics.find((topic) => topic.id === topicId)?.conteudos?.find((content) => content.id === id)?.metadata;
  if (!metadata || typeof metadata !== 'object') return null;
  const value = (metadata as Record<string, unknown>).boss_visual;
  return typeof value === 'string' && /^boss-(0[1-9]|[12]\d|3[01])$/.test(value) ? value : null;
}
