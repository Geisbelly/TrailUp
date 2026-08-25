import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {},
}));

import {
  buildManualGenerateAllPayload,
  buildManualGeneratePayload,
  buildPersonalizacaoPorPerfilPath,
} from "./personalizacoesApi";

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

describe("buildManualGeneratePayload", () => {
  it("monta o payload do botao individual com conteudo escolhido", () => {
    expect(
      buildManualGeneratePayload({
        classeId: 32,
        topicoId: 121,
        conteudoId: 126,
        perfil: "achiever",
      })
    ).toEqual({
      classe_id: 32,
      topico_id: 121,
      conteudo_id: 126,
      brainhex_profile_key: "achiever",
    });
  });

  it("omite conteudo_id quando nao ha conteudo selecionado", () => {
    expect(
      buildManualGeneratePayload({
        classeId: 32,
        topicoId: 121,
        perfil: "achiever",
      })
    ).toEqual({
      classe_id: 32,
      topico_id: 121,
      brainhex_profile_key: "achiever",
    });
  });
});

describe("buildManualGenerateAllPayload", () => {
  it("monta o payload do botao 'gerar tudo'", () => {
    expect(buildManualGenerateAllPayload({ classeId: 32, perfil: "seeker" })).toEqual({
      classe_id: 32,
      brainhex_profile_key: "seeker",
    });
  });
});
