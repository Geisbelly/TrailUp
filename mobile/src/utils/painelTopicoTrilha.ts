// Painel do tópico selecionado na Trilha da web em tela larga (#346, protótipo
// v4, `03-trilha.html`). Função pura: recebe o nó do grafo (já com o estado de
// bloqueio calculado) e o tópico da classe, e devolve o que o painel mostra.

import type { Href } from "expo-router";

type No = { id: string; titulo: string; locked: boolean; completed: boolean; sequence: number };
type Topico = {
  id: number;
  percentual_concluido?: number | null;
  conteudos?: readonly unknown[];
  atividades?: readonly unknown[];
};
type Aresta = { from: string; to: string };

export type EstadoTopico = "current" | "done" | "open" | "locked";

export type PainelTopico = {
  id: string;
  titulo: string;
  estado: EstadoTopico;
  eyebrow: string;
  percentual: number;
  conteudos: number;
  atividades: number;
  /** Títulos dos tópicos que liberam este (só quando bloqueado). */
  prerequisitos: { id: string; titulo: string }[];
  /** Rótulo do botão do pé do painel; null quando bloqueado. */
  acao: string | null;
};

const EYEBROW: Record<EstadoTopico, string> = {
  current: "Você parou aqui",
  done: "Concluído",
  open: "Próximo disponível",
  locked: "Conteúdo selado",
};
const ACAO: Record<EstadoTopico, string | null> = {
  current: "Continuar",
  done: "Revisar tópico",
  open: "Iniciar tópico",
  locked: null,
};

export function estadoDoTopico(no: Pick<No, "id" | "locked" | "completed">, atualId: string | null | undefined): EstadoTopico {
  if (no.locked) return "locked";
  if (no.completed) return "done";
  if (atualId != null && String(atualId) === String(no.id)) return "current";
  return "open";
}

export function montarPainelTopico(
  no: No,
  topico: Topico | undefined,
  atualId: string | null | undefined,
  nos: readonly No[],
  arestas: readonly Aresta[],
): PainelTopico {
  const estado = estadoDoTopico(no, atualId);
  const pct = Number(topico?.percentual_concluido ?? 0);
  const prerequisitos =
    estado === "locked"
      ? arestas
          .filter((a) => String(a.to) === String(no.id))
          .map((a) => nos.find((n) => String(n.id) === String(a.from)))
          .filter((n): n is No => Boolean(n))
          .map((n) => ({ id: String(n.id), titulo: n.titulo }))
      : [];
  return {
    id: String(no.id),
    titulo: no.titulo,
    estado,
    eyebrow: EYEBROW[estado],
    percentual: estado === "done" ? 100 : Math.max(0, Math.min(100, Math.round(Number.isFinite(pct) ? pct : 0))),
    conteudos: topico?.conteudos?.length ?? 0,
    atividades: topico?.atividades?.length ?? 0,
    prerequisitos,
    acao: ACAO[estado],
  };
}

/** Tópico que o painel abre sozinho: onde o aluno parou; senão o primeiro liberado e não concluído; senão o primeiro. */
export function topicoInicial(nos: readonly No[], atualId: string | null | undefined): string | null {
  const ordenados = [...nos].sort((a, b) => a.sequence - b.sequence);
  if (atualId != null && ordenados.some((n) => String(n.id) === String(atualId))) return String(atualId);
  const proximo = ordenados.find((n) => !n.locked && !n.completed);
  return proximo ? String(proximo.id) : ordenados[0] ? String(ordenados[0].id) : null;
}

/** Rota do tópico: a mesma do botão do painel e das vistas do celular. */
export function rotaDoTopico(id: string): Href {
  return `/(tabs)/trilha/${encodeURIComponent(id)}` as Href;
}

/**
 * Clique num nó do tabuleiro (mapa, árvore ou lista) na tela larga. O nó
 * liberado abre o tópico, como no celular; o bloqueado só fica selecionado, e o
 * painel ao lado explica o que falta. Antes todo clique só trocava a seleção do
 * painel, e para o aluno parecia que o nó não abria.
 */
export function aoClicarNo(no: Pick<No, "locked"> | undefined): "abrir" | "selecionar" {
  return no && !no.locked ? "abrir" : "selecionar";
}
