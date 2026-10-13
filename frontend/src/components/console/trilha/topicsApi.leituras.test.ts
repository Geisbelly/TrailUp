import { beforeEach, describe, expect, it, vi } from "vitest";

const sb = vi.hoisted(() => ({
  chamadas: [] as unknown[][],
  respostas: {} as Record<string, { data: unknown; error: unknown }>,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (tabela: string) => {
      sb.chamadas.push(["from", tabela]);
      const q: Record<string, unknown> = {};
      for (const m of ["select", "eq", "or", "order"]) {
        q[m] = (...args: unknown[]) => (sb.chamadas.push([tabela, m, ...args]), q);
      }
      q.then = (resolve: (v: unknown) => unknown) =>
        Promise.resolve(sb.respostas[tabela] ?? { data: [], error: null }).then(resolve);
      return q;
    },
  },
}));

import { fetchActivities, fetchActivityLinks, fetchCards, fetchQuestions } from "./topicsApi";

beforeEach(() => {
  sb.chamadas = [];
  sb.respostas = {};
});

describe("fetchCards", () => {
  it("tópico sem conteúdo não consulta os cards", async () => {
    sb.respostas.conteudos = { data: [], error: null };
    await expect(fetchCards(1)).resolves.toEqual([]);
    expect(sb.chamadas.some((c) => c[0] === "cards")).toBe(false);
  });

  it("traz cards cujo conteúdo OU cuja origem está no tópico", async () => {
    sb.respostas.conteudos = { data: [{ id: 10 }, { id: 11 }], error: null };
    sb.respostas.cards = { data: [], error: null };
    await fetchCards(1);
    expect(sb.chamadas).toContainEqual(["cards", "or", "conteudo_id.in.(10,11),conteudo_origem_id.in.(10,11)"]);
  });

  it("um card que casa pelos dois lados aparece uma vez só", async () => {
    sb.respostas.conteudos = { data: [{ id: 10 }], error: null };
    sb.respostas.cards = { data: [{ id: 1, titulo: "a" }, { id: 2, titulo: "b" }, { id: 1, titulo: "a" }], error: null };
    const cards = await fetchCards(1);
    expect(cards.map((c) => c.id)).toEqual([1, 2]);
  });

  it("propaga erro de qualquer das duas leituras", async () => {
    sb.respostas.conteudos = { data: null, error: new Error("a") };
    await expect(fetchCards(1)).rejects.toThrow("a");
    sb.respostas.conteudos = { data: [{ id: 10 }], error: null };
    sb.respostas.cards = { data: null, error: new Error("b") };
    await expect(fetchCards(1)).rejects.toThrow("b");
  });
});

describe("fetchActivities / fetchQuestions / fetchActivityLinks", () => {
  it("atividades do tópico, em ordem de criação", async () => {
    sb.respostas.atividades = { data: [{ id: 1 }], error: null };
    await expect(fetchActivities(4)).resolves.toEqual([{ id: 1 }]);
    expect(sb.chamadas).toContainEqual(["atividades", "eq", "topico_id", 4]);
    expect(sb.chamadas).toContainEqual(["atividades", "order", "created_at", { ascending: true }]);
  });

  it("questões da atividade, em ordem de criação", async () => {
    sb.respostas.questoes = { data: [{ id: 5 }], error: null };
    await expect(fetchQuestions(2)).resolves.toEqual([{ id: 5 }]);
    expect(sb.chamadas).toContainEqual(["questoes", "eq", "atividade_id", 2]);
  });

  it("vínculos filtram pelo tópico da atividade e sem dados viram lista vazia", async () => {
    sb.respostas.atividade_conteudos = { data: null, error: null };
    await expect(fetchActivityLinks(4)).resolves.toEqual([]);
    expect(sb.chamadas).toContainEqual(["atividade_conteudos", "eq", "atividades.topico_id", 4]);
  });

  it("todas propagam o erro do banco", async () => {
    const erro = new Error("rls");
    sb.respostas.atividades = { data: null, error: erro };
    sb.respostas.questoes = { data: null, error: erro };
    sb.respostas.atividade_conteudos = { data: null, error: erro };
    await expect(fetchActivities(1)).rejects.toBe(erro);
    await expect(fetchQuestions(1)).rejects.toBe(erro);
    await expect(fetchActivityLinks(1)).rejects.toBe(erro);
  });
});
