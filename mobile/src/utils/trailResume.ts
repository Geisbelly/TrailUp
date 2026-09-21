type Node = { id: string; locked?: boolean; completed?: boolean; sequence?: number };
type Topic = { id: number; ultima_visualizacao?: string | null; percentual_concluido?: number | null };
export type TrailVisit = { topicId: number; visitedAt: string };

function visitTime(value: string) {
  // ultima_visualizacao é timestamp UTC sem timezone no schema legado.
  return Date.parse(value && !/(Z|[+-]\d{2}:?\d{2})$/i.test(value) ? `${value}Z` : value);
}

export function selectResumeTopic(nodes: Node[], topics: Topic[], visits: TrailVisit[] = []): string | null {
  const available = [...nodes].filter((n) => !n.locked).sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0));
  const allowed = new Set(available.map((n) => String(n.id)));
  const mostRecent = (candidates: TrailVisit[]) => candidates
    .filter((v) => allowed.has(String(v.topicId)) && Number.isFinite(visitTime(v.visitedAt)))
    .sort((a, b) => visitTime(b.visitedAt) - visitTime(a.visitedAt))[0];
  // Checkpoint/visita explícita ganha do timestamp de progresso, que também
  // pode mudar em um flush tardio do tópico anterior.
  const recent = mostRecent(visits) ?? mostRecent(topics.map((t) => ({ topicId: t.id, visitedAt: t.ultima_visualizacao ?? '' })));
  if (recent) return String(recent.topicId);
  return available.find((n) => !n.completed && topics.some((t) => String(t.id) === String(n.id) && Number(t.percentual_concluido) > 0))?.id
    ?? available.find((n) => !n.completed)?.id ?? available.at(-1)?.id ?? null;
}

export function trailResumeKey(userId: string, classId: number) {
  return `trailup:resume-topic:${userId}:${classId}`;
}
