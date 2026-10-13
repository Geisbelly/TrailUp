import { beforeEach, describe, expect, it, vi } from "vitest";

const sb = vi.hoisted(() => ({
  inserts: [] as { tabela: string; payload: unknown }[],
  erroMateria: null as unknown,
  erroClasse: null as unknown,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (tabela: string) => {
      const q: Record<string, unknown> = {};
      q.insert = (payload: unknown) => (sb.inserts.push({ tabela, payload }), q);
      q.select = () => q;
      q.single = async () =>
        tabela === "materia"
          ? { data: { id: 50 }, error: sb.erroMateria }
          : { data: { id: 8, descricao: "Física I" }, error: sb.erroClasse };
      return q;
    },
  },
}));

import { createClassWithMateria } from "./topicsApi";

beforeEach(() => {
  sb.inserts = [];
  sb.erroMateria = null;
  sb.erroClasse = null;
});

describe("createClassWithMateria", () => {
  it("com matéria existente, usa o id (que vem como texto do select) e não cria matéria", async () => {
    const classe = await createClassWithMateria({ descricao: "Física I", materia_id: "12", professorId: "prof-1" });
    expect(classe).toEqual({ id: 8, descricao: "Física I" });
    expect(sb.inserts).toEqual([{ tabela: "classe", payload: { descricao: "Física I", materia_id: 12, professor_id: "prof-1" } }]);
  });

  it("com matéria nova, cria a matéria primeiro e usa o id dela na classe", async () => {
    await createClassWithMateria({ descricao: "Física I", newMateria: { nome: "Física", descricao: "Mecânica" }, professorId: "prof-1" });
    expect(sb.inserts.map((i) => i.tabela)).toEqual(["materia", "classe"]);
    expect(sb.inserts[0].payload).toEqual({ nome: "Física", descricao: "Mecânica" });
    expect(sb.inserts[1].payload).toMatchObject({ materia_id: 50 });
  });

  it("matéria existente tem prioridade sobre a nova", async () => {
    await createClassWithMateria({ descricao: "x", materia_id: "3", newMateria: { nome: "Outra", descricao: "" } });
    expect(sb.inserts.map((i) => i.tabela)).toEqual(["classe"]);
  });

  it("sem matéria nenhuma, a classe nasce com materia_id null", async () => {
    await createClassWithMateria({ descricao: "x" });
    expect(sb.inserts[0].payload).toMatchObject({ materia_id: null });
  });

  it("nome de matéria vazio não cria matéria", async () => {
    await createClassWithMateria({ descricao: "x", newMateria: { nome: "", descricao: "d" } });
    expect(sb.inserts.map((i) => i.tabela)).toEqual(["classe"]);
  });

  it("se a matéria falha, a classe nem é criada", async () => {
    sb.erroMateria = new Error("duplicada");
    await expect(createClassWithMateria({ descricao: "x", newMateria: { nome: "F", descricao: "" } })).rejects.toThrow("duplicada");
    expect(sb.inserts.map((i) => i.tabela)).toEqual(["materia"]);
  });

  it("propaga o erro da classe", async () => {
    sb.erroClasse = new Error("rls");
    await expect(createClassWithMateria({ descricao: "x" })).rejects.toThrow("rls");
  });
});
