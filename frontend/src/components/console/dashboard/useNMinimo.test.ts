import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import { N_MINIMO_PADRAO } from "./graficos";
import { nMinimoDoCatalogo } from "./useNMinimo";

describe("nMinimoDoCatalogo", () => {
  it("usa o valor do catálogo", () => {
    expect(nMinimoDoCatalogo([{ n_minimo: 8 }])).toBe(8);
  });

  it("cai no padrão sem linha ou com leitura falha", () => {
    expect(nMinimoDoCatalogo([])).toBe(N_MINIMO_PADRAO);
    expect(nMinimoDoCatalogo(null)).toBe(N_MINIMO_PADRAO);
  });

  it("não aceita valor que desligaria a supressão", () => {
    expect(nMinimoDoCatalogo([{ n_minimo: 0 }])).toBe(N_MINIMO_PADRAO);
    expect(nMinimoDoCatalogo([{ n_minimo: -1 }])).toBe(N_MINIMO_PADRAO);
    expect(nMinimoDoCatalogo([{ n_minimo: null }])).toBe(N_MINIMO_PADRAO);
  });
});
