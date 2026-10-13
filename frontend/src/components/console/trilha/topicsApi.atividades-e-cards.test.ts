import { beforeEach, describe, expect, it, vi } from "vitest";

type Chamada = { tabela: string; op: "insert" | "update" | "delete"; payload?: unknown; filtros: [string, unknown][] };

const sb = vi.hoisted(() => ({
  chamadas: [] as Chamada[],
  erro: null as unknown,
  erroPorId: {} as Record<number, unknown>,
  idNovo: 123,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (tabela: string) => {
      const chamada: Chamada = { tabela, op: "insert", filtros: [] };
      const q: Record<string, unknown> = {};
      const registra = (op: Chamada["op"], payload?: unknown) => {
        chamada.op = op;
        chamada.payload = payload;
        sb.chamadas.push(chamada);
        return q;
      };
      q.insert = (p: unknown) => registra("insert", p);
      q.update = (p: unknown) => registra("update", p);
      q.delete = () => registra("delete");
      q.select = () => q;
      q.eq = (coluna: string, valor: unknown) => {
        chamada.filtros.push([coluna, valor]);
        return q;
      };
      const resultado = () => {
        const id = chamada.filtros.find(([c]) => c === "id")?.[1] as number | undefined;
        return { data: { id: sb.idNovo }, error: (id !== undefined && sb.erroPorId[id]) || sb.erro };
      };
      q.single = async () => resultado();
      q.then = (resolve: (v: unknown) => unknown) => Promise.resolve(resultado()).then(resolve);
      return q;
    },
  },
}));

import { deleteActivity, deleteCard, saveActivity, saveCard, updateContentOrder } from "./topicsApi";

beforeEach(() => {
  sb.chamadas = [];
  sb.erro = null;
  sb.erroPorId = {};
  sb.idNovo = 123;
});

describe("saveActivity", () => {
  it("sem id, insere no tópico e devolve o id novo", async () => {
    const id = await saveActivity({ topico_id: 4, titulo: "Quiz", descricao: "d", tipo: "quiz", data_entrega: "2026-10-20" });
    expect(id).toBe(123);
    expect(sb.chamadas[0]).toMatchObject({
      tabela: "atividades",
      op: "insert",
      payload: { topico_id: 4, titulo: "Quiz", descricao: "d", tipo: "quiz", data_entrega: "2026-10-20" },
    });
  });

  it("tipo e prazo vazios viram null, nunca string vazia", async () => {
    await saveActivity({ topico_id: 4, titulo: "Quiz", descricao: "", tipo: "", data_entrega: "" });
    expect(sb.chamadas[0].payload).toMatchObject({ tipo: null, data_entrega: null });
  });

  it("com id, atualiza só aquela atividade (e não troca o tópico)", async () => {
    const id = await saveActivity({ id: 9, topico_id: 4, titulo: "Novo", descricao: "d", tipo: "essay" });
    expect(id).toBe(9);
    expect(sb.chamadas[0]).toMatchObject({ op: "update", filtros: [["id", 9]] });
    expect(sb.chamadas[0].payload).not.toHaveProperty("topico_id");
  });

  it("propaga o erro do banco", async () => {
    sb.erro = new Error("rls");
    await expect(saveActivity({ topico_id: 4, titulo: "x", descricao: "" })).rejects.toThrow("rls");
  });
});

describe("saveCard", () => {
  it("converte ids de texto (vindos do formulário) em número", async () => {
    await saveCard({ conteudo_id: "5", conteudo_origem_id: "2", titulo: "T", descricao: "D" });
    expect(sb.chamadas[0]).toMatchObject({
      op: "insert",
      payload: { conteudo_id: 5, conteudo_origem_id: 2, titulo: "T", descricao: "D", imagem_url: null },
    });
  });

  it("ids vazios viram null (card reaproveitável do tópico)", async () => {
    await saveCard({ conteudo_id: "", conteudo_origem_id: null, titulo: "T" });
    expect(sb.chamadas[0].payload).toMatchObject({ conteudo_id: null, conteudo_origem_id: null, descricao: null });
  });

  it("com id, atualiza só aquele card e devolve o id", async () => {
    const id = await saveCard({ id: 7, conteudo_id: 5, titulo: "T" });
    expect(id).toBe(7);
    expect(sb.chamadas[0]).toMatchObject({ op: "update", filtros: [["id", 7]] });
  });

  it("propaga o erro do banco", async () => {
    sb.erro = new Error("fk");
    await expect(saveCard({ titulo: "T" })).rejects.toThrow("fk");
  });
});

describe("deleteActivity e deleteCard", () => {
  it("apagam pelo id", async () => {
    await deleteActivity(3);
    await deleteCard(8);
    expect(sb.chamadas.map((c) => [c.tabela, c.op, c.filtros])).toEqual([
      ["atividades", "delete", [["id", 3]]],
      ["cards", "delete", [["id", 8]]],
    ]);
  });

  it("propagam o erro", async () => {
    sb.erro = new Error("negado");
    await expect(deleteActivity(3)).rejects.toThrow("negado");
    await expect(deleteCard(8)).rejects.toThrow("negado");
  });
});

describe("updateContentOrder", () => {
  it("grava a ordem de cada conteúdo", async () => {
    await updateContentOrder([{ id: 1, ordem: 2 }, { id: 2, ordem: 1 }]);
    expect(sb.chamadas.map((c) => [c.filtros[0][1], (c.payload as { ordem: number }).ordem])).toEqual([[1, 2], [2, 1]]);
  });

  it("se um falha, lança o erro (não engole)", async () => {
    sb.erroPorId = { 2: new Error("conflito") };
    await expect(updateContentOrder([{ id: 1, ordem: 2 }, { id: 2, ordem: 1 }])).rejects.toThrow("conflito");
  });

  it("lista vazia não escreve nada", async () => {
    await updateContentOrder([]);
    expect(sb.chamadas).toHaveLength(0);
  });
});
