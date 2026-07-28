import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {},
}));
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: null, session: null }),
}));
vi.mock("./classDeletion", () => ({
  deleteContentCascade: vi.fn(),
}));
vi.mock("./personalizacaoJobsApi", () => ({
  enqueueClassDeltaJob: vi.fn(),
}));

import { buildContentDeltaPayload } from "./ContentsManager";

describe("buildContentDeltaPayload", () => {
  it("mantem o ID retornado ao criar ou editar um conteudo", () => {
    expect(
      buildContentDeltaPayload({
        classeId: 32,
        topicoId: 121,
        conteudoId: 126,
        reason: "edicao_conteudo_console",
      })
    ).toEqual({
      classe_id: 32,
      topico_ids: [121],
      conteudo_ids: [126],
      reason: "edicao_conteudo_console",
    });
  });

  it("enfileira somente o topico depois que o conteudo foi excluido", () => {
    expect(
      buildContentDeltaPayload({
        classeId: 32,
        topicoId: 121,
        reason: "remocao_conteudo_console",
      })
    ).toEqual({
      classe_id: 32,
      topico_ids: [121],
      reason: "remocao_conteudo_console",
    });
  });
});
