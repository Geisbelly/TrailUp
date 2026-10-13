import { beforeEach, describe, expect, it, vi } from "vitest";

const sb = vi.hoisted(() => ({
  chamadas: [] as unknown[][],
  resposta: { data: null as unknown, error: null as unknown },
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (tabela: string) => {
      sb.chamadas.push(["from", tabela]);
      const q: Record<string, unknown> = {};
      for (const m of ["select", "eq", "not", "limit"]) {
        q[m] = (...args: unknown[]) => (sb.chamadas.push([m, ...args]), q);
      }
      q.then = (resolve: (v: unknown) => unknown) => Promise.resolve(sb.resposta).then(resolve);
      return q;
    },
  },
}));

import { fetchRegistrosPorAluno } from "./statusPorAlunoApi";

beforeEach(() => {
  sb.chamadas = [];
  sb.resposta = { data: null, error: null };
});

describe("fetchRegistrosPorAluno", () => {
  it("lê só a camada por aluno (aluno_id não nulo) da classe e do conteúdo, com teto de 1000", async () => {
    await fetchRegistrosPorAluno(5, 9);
    expect(sb.chamadas).toEqual([
      ["from", "conteudo_personalizado"],
      ["select", "aluno_id, status, gerado_em, updated_at"],
      ["eq", "classe_id", 5],
      ["eq", "conteudo_id", 9],
      ["not", "aluno_id", "is", null],
      ["limit", 1000],
    ]);
  });

  it("devolve as linhas", async () => {
    sb.resposta = { data: [{ aluno_id: "a", status: "completed", gerado_em: null, updated_at: null }], error: null };
    await expect(fetchRegistrosPorAluno(5, 9)).resolves.toHaveLength(1);
  });

  it("sem dados vira lista vazia, não null", async () => {
    await expect(fetchRegistrosPorAluno(5, 9)).resolves.toEqual([]);
  });

  it("propaga o erro do banco (a tela decide mostrar a lista vazia)", async () => {
    sb.resposta = { data: null, error: new Error("rls") };
    await expect(fetchRegistrosPorAluno(5, 9)).rejects.toThrow("rls");
  });
});
