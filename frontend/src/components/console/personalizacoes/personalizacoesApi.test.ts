import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {},
}));

import { buildPersonalizacaoPorPerfilPath } from "./personalizacoesApi";

describe("buildPersonalizacaoPorPerfilPath", () => {
  it("filtra os sete perfis pelo conteudo selecionado", () => {
    expect(
      buildPersonalizacaoPorPerfilPath({
        classeId: 32,
        topicoId: 121,
        conteudoId: 126,
      })
    ).toBe("/api/v1/personalizar/perfis/32/121?conteudo_id=126");
  });

  it("preserva a rota legada quando nao ha conteudo no topico", () => {
    expect(
      buildPersonalizacaoPorPerfilPath({
        classeId: 32,
        topicoId: 121,
      })
    ).toBe("/api/v1/personalizar/perfis/32/121");
  });
});
