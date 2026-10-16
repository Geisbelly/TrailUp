import { beforeEach, describe, expect, it, vi } from "vitest";

const sb = vi.hoisted(() => ({
  chamadas: [] as { tabela: string; op: string; payload?: unknown; id?: unknown }[],
  erro: null as unknown,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (tabela: string) => {
      const c: { tabela: string; op: string; payload?: unknown; id?: unknown } = { tabela, op: "?" };
      const q: Record<string, unknown> = {};
      q.insert = (p: unknown) => ((c.op = "insert"), (c.payload = p), sb.chamadas.push(c), q);
      q.update = (p: unknown) => ((c.op = "update"), (c.payload = p), sb.chamadas.push(c), q);
      q.select = () => q;
      q.eq = (_col: string, v: unknown) => ((c.id = v), q);
      q.single = async () => ({ data: { id: 77 }, error: sb.erro });
      q.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ error: sb.erro }).then(resolve);
      return q;
    },
  },
}));

import { saveQuestion } from "./topicsApi";

beforeEach(() => {
  sb.chamadas = [];
  sb.erro = null;
});

describe("saveQuestion", () => {
  it("sem id, insere na atividade e devolve o id novo", async () => {
    const id = await saveQuestion({ atividade_id: 4, enunciado: "2+2?", tipo: "multipla", alternativas: ["3", "4"], resposta_correta: "4" });
    expect(id).toBe(77);
    expect(sb.chamadas[0]).toMatchObject({
      tabela: "questoes",
      op: "insert",
      payload: { atividade_id: 4, enunciado: "2+2?", tipo: "multipla", alternativas: ["3", "4"], resposta_correta: "4", midia_url: null },
    });
  });

  it("campos opcionais ausentes viram null", async () => {
    await saveQuestion({ atividade_id: 4, enunciado: "Explique.", tipo: "dissertativa" });
    expect(sb.chamadas[0].payload).toMatchObject({ alternativas: null, resposta_correta: null, nota_estabelecida: null, midia_url: null });
  });

  it("a nota estabelecida passa pela mesma validação do formulário (vírgula, arredondamento)", async () => {
    await saveQuestion({ atividade_id: 4, enunciado: "x", tipo: "dissertativa", nota_estabelecida: "2,567" as unknown as number });
    expect((sb.chamadas[0].payload as { nota_estabelecida: number }).nota_estabelecida).toBe(2.57);
  });

  it.each([0, -1, Number.NaN])("nota inválida (%s) é gravada como null, não como número ruim", async (nota) => {
    await saveQuestion({ atividade_id: 4, enunciado: "x", tipo: "dissertativa", nota_estabelecida: nota });
    expect((sb.chamadas[0].payload as { nota_estabelecida: unknown }).nota_estabelecida).toBeNull();
  });

  it("com id, atualiza só aquela questão e não manda atividade_id", async () => {
    const id = await saveQuestion({ id: 12, atividade_id: 4, enunciado: "novo", tipo: "multipla" });
    expect(id).toBe(12);
    expect(sb.chamadas[0]).toMatchObject({ op: "update", id: 12 });
    expect(sb.chamadas[0].payload).not.toHaveProperty("atividade_id");
  });

  it("propaga o erro do banco", async () => {
    sb.erro = new Error("check");
    await expect(saveQuestion({ atividade_id: 4, enunciado: "x", tipo: "multipla" })).rejects.toThrow("check");
    await expect(saveQuestion({ id: 1, atividade_id: 4, enunciado: "x", tipo: "multipla" })).rejects.toThrow("check");
  });
});
