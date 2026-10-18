import type { Topico } from "./types";

// Regras do grafo de tópicos (sequência `next` e pré-requisito `depende`) como
// funções puras. Estavam dentro de useTopicGraph, misturadas com estado e com
// window.confirm; aqui ficam testáveis e sem efeito colateral.

export type TipoDeLigacao = "next" | "depende";

export type AvaliacaoDaLigacao =
  | { resultado: "ignorar" }
  | { resultado: "turmas_diferentes"; from: Topico; to: Topico }
  | { resultado: "conflito"; mensagem: string }
  | { resultado: "ok" };

export const MENSAGEM_CONFLITO_DEPENDE = "Conflito: já depende do alvo. Remover dependência inversa?";
export const MENSAGEM_CONFLITO_NEXT = "Conflito: alvo já marcado como próximo do atual. Remover vínculo inverso?";

/** Decide o que fazer com um pedido de ligação `from → to`, sem alterar nada. */
export function avaliarLigacao(topicos: Topico[], fromId: number, toId: number, type: TipoDeLigacao): AvaliacaoDaLigacao {
  if (fromId === toId) return { resultado: "ignorar" };
  const from = topicos.find((t) => t.id === fromId);
  const to = topicos.find((t) => t.id === toId);
  if (!from || !to) return { resultado: "ignorar" };
  if (from.classe_id !== to.classe_id) return { resultado: "turmas_diferentes", from, to };
  if (type === "depende" && from.depende.includes(toId)) return { resultado: "conflito", mensagem: MENSAGEM_CONFLITO_DEPENDE };
  if (type === "next" && to.next.includes(fromId)) return { resultado: "conflito", mensagem: MENSAGEM_CONFLITO_NEXT };
  return { resultado: "ok" };
}

/**
 * Aplica a ligação. A relação inversa sai junto: ligar A→B como `next` tira B→A
 * e tira B de `depende` de A; ligar como `depende` faz o espelho. É o que resolve
 * o "conflito" quando o professor confirma.
 */
export function aplicarLigacao(topicos: Topico[], fromId: number, toId: number, type: TipoDeLigacao): Topico[] {
  return topicos.map((t) => {
    if (type === "next" && t.id === fromId) {
      return { ...t, next: t.next.includes(toId) ? t.next : [...t.next, toId], depende: t.depende.filter((d) => d !== toId) };
    }
    if (type === "next" && t.id === toId) return { ...t, next: t.next.filter((n) => n !== fromId) };
    if (type === "depende" && t.id === toId) {
      return { ...t, depende: t.depende.includes(fromId) ? t.depende : [...t.depende, fromId], next: t.next.filter((n) => n !== fromId) };
    }
    if (type === "depende" && t.id === fromId) return { ...t, depende: t.depende.filter((d) => d !== toId) };
    return t;
  });
}

export function removerLigacao(topicos: Topico[], fromId: number, toId: number, type: TipoDeLigacao): Topico[] {
  return topicos.map((t) => {
    if (type === "next" && t.id === fromId) return { ...t, next: t.next.filter((n) => n !== toId) };
    if (type === "depende" && t.id === toId) return { ...t, depende: t.depende.filter((n) => n !== fromId) };
    return t;
  });
}
