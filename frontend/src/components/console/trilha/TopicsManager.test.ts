import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {},
}));
vi.mock("@/hooks/useAuth", () => ({
  useAuth: () => ({ user: null, session: null }),
}));
vi.mock("./personalizacaoJobsApi", () => ({
  enqueueClassDeltaJob: vi.fn(),
  enqueueManualRetryJob: vi.fn(),
  isPersonalizacaoJobActive: vi.fn(),
  listPersonalizacaoJobs: vi.fn(),
  selectFailedJobTopicoIds: vi.fn(),
  summarizePersonalizacaoJobs: vi.fn(),
}));

import { buildTopicoDeltaPayload } from "./TopicsManager";

describe("buildTopicoDeltaPayload", () => {
  it("escopa somente o topico recem-criado, nao a classe inteira", () => {
    expect(
      buildTopicoDeltaPayload({
        classeId: 32,
        topicoIds: [999],
        conteudoIds: [],
        reason: "novo_topico_console",
      })
    ).toEqual({
      classe_id: 32,
      topico_ids: [999],
      reason: "novo_topico_console",
    });
  });

  it("inclui conteudo_ids quando o topico ja tem conteudos", () => {
    expect(
      buildTopicoDeltaPayload({
        classeId: 32,
        topicoIds: [121],
        conteudoIds: [501, 502],
        reason: "edicao_topico_console",
      })
    ).toEqual({
      classe_id: 32,
      topico_ids: [121],
      conteudo_ids: [501, 502],
      reason: "edicao_topico_console",
    });
  });

  it("remocao de topico nao envia conteudo_ids (topico ja foi apagado)", () => {
    expect(
      buildTopicoDeltaPayload({
        classeId: 32,
        topicoIds: [121],
        reason: "remocao_topico_console",
      })
    ).toEqual({
      classe_id: 32,
      topico_ids: [121],
      reason: "remocao_topico_console",
    });
  });

  it("reordenacao escopa apenas os topicos reordenados, nao a classe inteira", () => {
    expect(
      buildTopicoDeltaPayload({
        classeId: 32,
        topicoIds: [121, 122, 123],
        conteudoIds: [501],
        reason: "reordenacao_topicos_console",
      })
    ).toEqual({
      classe_id: 32,
      topico_ids: [121, 122, 123],
      conteudo_ids: [501],
      reason: "reordenacao_topicos_console",
    });
  });
});
