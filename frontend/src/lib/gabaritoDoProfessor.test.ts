import { describe, expect, it, vi } from "vitest";

// Só a junção é testada aqui; a leitura está em `topicsApi.leituras.test.ts`.
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import { juntarGabaritos } from "./gabaritoDoProfessor";

describe("juntarGabaritos", () => {
  it("põe o gabarito de cada questão e deixa null a que não tem linha no espelho", () => {
    const questoes = [{ id: 1, enunciado: "a" }, { id: 2, enunciado: "b" }];
    expect(juntarGabaritos(questoes, [{ questao_id: 2, resposta_correta: "C" }])).toEqual([
      { id: 1, enunciado: "a", resposta_correta: null },
      { id: 2, enunciado: "b", resposta_correta: "C" },
    ]);
  });

  it("o id que vem como texto do PostgREST ainda casa", () => {
    const linhas = [{ questao_id: "7" as unknown as number, resposta_correta: "x" }];
    expect(juntarGabaritos([{ id: 7 }], linhas)).toEqual([{ id: 7, resposta_correta: "x" }]);
  });
});
