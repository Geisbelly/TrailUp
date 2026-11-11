import { beforeEach, describe, expect, it, vi } from "vitest";

const chamadas: Array<[string, unknown]> = [];
let resposta: { data: unknown; error: unknown } = { data: null, error: null };

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (nome: string, args: unknown) => {
      chamadas.push([nome, args]);
      return Promise.resolve(resposta);
    },
  },
}));

import { lerDiversidadeDaTurma } from "./diversidadeApi";

beforeEach(() => {
  chamadas.length = 0;
  resposta = { data: null, error: null };
});

describe("lerDiversidadeDaTurma", () => {
  it("chama a função do banco direto, sem a API", async () => {
    resposta = { data: { classe_id: 7, margem_misto: 10, alunos: 4 }, error: null };
    const d = await lerDiversidadeDaTurma(7);
    expect(chamadas).toEqual([["classe_diversidade_perfis", { p_classe: 7 }]]);
    expect(d?.alunos).toBe(4);
  });

  it("turma que não é do professor = null", async () => {
    expect(await lerDiversidadeDaTurma(7)).toBeNull();
  });

  it("erro do banco sobe para quem chamou decidir", async () => {
    resposta = { data: null, error: { message: "function does not exist" } };
    await expect(lerDiversidadeDaTurma(7)).rejects.toBeTruthy();
  });
});
