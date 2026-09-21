import type { NodeId, NodeItem } from '../hooks/use-grafo-trilha';
import { isTopicoConcluido, type TopicoProgress } from './topicoProgress';

type GraphTopic = TopicoProgress & {
  id: number;
  nome?: string | null;
  ordem?: number | null;
  depende?: unknown;
  next?: unknown;
};

function references(value: unknown): number[] {
  const values = Array.isArray(value) ? value :
    value && typeof value === 'object' ? Object.values(value) : [];
  return values.map(Number).filter((id) => Number.isFinite(id) && id > 0);
}

/** Ligações de layout não criam pré-requisitos que o professor não cadastrou. */
export function buildGraphFromTopicos(classe: { topicos: GraphTopic[] }, pendentes?: Set<number>): {
  nodes: NodeItem[];
  unlocked: NodeId[];
} {
  const topics = [...classe.topicos].sort((a, b) => (a.ordem ?? 0) - (b.ordem ?? 0));
  const nodes: NodeItem[] = topics.map((topic, index) => ({
    id: String(topic.id), titulo: topic.nome ?? `Tópico ${index + 1}`,
    sequence: index + 1, next: [], locked: true,
    completed: isTopicoConcluido(topic, pendentes),
  }));
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const parents = new Map<string, Set<string>>();
  const connect = (from: string, to: string) => {
    const parent = byId.get(from);
    if (parent && !parent.next?.includes(to)) parent.next!.push(to);
    const required = parents.get(to) ?? new Set<string>();
    required.add(from);
    parents.set(to, required);
  };
  topics.forEach((topic) => {
    references(topic.depende).forEach((id) => connect(String(id), String(topic.id)));
    references(topic.next).forEach((id) => connect(String(topic.id), String(id)));
  });
  if (!nodes.some((node) => node.next?.length)) {
    for (let i = 0; i < nodes.length - 1; i++) nodes[i].next = [nodes[i + 1].id];
  }
  nodes.forEach((node) => {
    const required = parents.get(node.id) ?? new Set<string>();
    node.locked = !node.completed && ![...required].every((id) => byId.get(id)?.completed === true);
  });
  return { nodes, unlocked: nodes.filter((node) => !node.locked).map((node) => node.id) };
}

export function isTopicoUnlockedLocal(topic: GraphTopic, topics: GraphTopic[], pendentes?: Set<number>) {
  return buildGraphFromTopicos({ topicos: topics }, pendentes).unlocked.includes(String(topic.id));
}
