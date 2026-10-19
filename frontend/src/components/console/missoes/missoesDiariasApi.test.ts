import { describe, expect, it, vi } from "vitest";

// O cliente real lê localStorage ao importar; aqui só as funções puras importam.
vi.mock("@/integrations/supabase/client", () => ({ supabase: { rpc: vi.fn() } }));

import { mapearMissaoDiaria, percentualCumprido } from "./missoesDiariasApi";

describe("missoesDiariasApi", () => {
  it("mapeia e descarta lixo", () => {
    expect(
      mapearMissaoDiaria({
        id: "12",
        titulo: "Dez minutos",
        descricao: null,
        perfil_alvo: "achiever",
        slot: 2,
        cumpriram: "3",
        alunos_do_perfil: "10",
      }),
    ).toEqual({
      id: 12,
      titulo: "Dez minutos",
      descricao: "",
      perfilAlvo: "achiever",
      slot: 2,
      cumpriram: 3,
      alunosDoPerfil: 10,
    });
  });

  it("percentual não divide por zero", () => {
    expect(percentualCumprido(0, 0)).toBe(0);
    expect(percentualCumprido(3, 10)).toBe(30);
    expect(percentualCumprido(12, 10)).toBe(100);
  });
});
