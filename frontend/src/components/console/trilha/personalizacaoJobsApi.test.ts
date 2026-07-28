import { describe, expect, it, vi } from "vitest";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {},
}));

import {
  getPersonalizacaoJobContentIds,
  isPersonalizacaoJobActive,
  summarizePersonalizacaoJobs,
  type PersonalizacaoJobStatus,
} from "./personalizacaoJobsApi";

function buildJob(
  overrides: Partial<PersonalizacaoJobStatus> = {}
): PersonalizacaoJobStatus {
  return {
    id: "job-1",
    kind: "class-delta",
    status: "pending",
    classe_id: 32,
    payload: {},
    total_targets: 14,
    processed_targets: 0,
    error_count: 0,
    created_at: "2026-07-28T10:00:00.000Z",
    updated_at: "2026-07-28T10:00:00.000Z",
    ...overrides,
  };
}

describe("status dos jobs de personalização", () => {
  it.each(["pending", "processing", "partial", " PROCESSING "])(
    "considera %s um status ativo",
    (status) => {
      expect(isPersonalizacaoJobActive(buildJob({ status }))).toBe(true);
    }
  );

  it("normaliza e deduplica os conteúdos do campo direto e do payload novo", () => {
    expect(
      getPersonalizacaoJobContentIds(
        buildJob({
          conteudo_id: 125,
          payload: { conteudo_ids: [126, "125", 126, 0, "invalido"] },
        })
      )
    ).toEqual([125, 126]);
  });

  it("agrega progresso, conteúdos e erros somente dos jobs ativos", () => {
    const summary = summarizePersonalizacaoJobs([
      buildJob({
        id: "processing",
        status: "processing",
        processed_targets: 7,
        payload: { conteudo_ids: [125] },
      }),
      buildJob({
        id: "partial",
        status: "partial",
        total_targets: 7,
        processed_targets: 3,
        error_count: 1,
        last_error: "Falha ao gerar os slides",
        payload: { conteudo_ids: [126] },
      }),
      buildJob({
        id: "completed",
        status: "completed",
        processed_targets: 14,
        payload: { conteudo_ids: [999] },
      }),
    ]);

    expect(summary).toEqual({
      activeCount: 2,
      processedTargets: 10,
      totalTargets: 21,
      errorCount: 1,
      contentIds: [125, 126],
      lastError: "Falha ao gerar os slides",
    });
  });

  it("mantém o progresso do job mais recente quando não há geração ativa", () => {
    const summary = summarizePersonalizacaoJobs([
      buildJob({
        status: "completed",
        processed_targets: 14,
        payload: { conteudo_ids: [125, 126] },
      }),
      buildJob({
        id: "older-failure",
        status: "failed",
        error_count: 2,
      }),
    ]);

    expect(summary).toMatchObject({
      activeCount: 0,
      processedTargets: 14,
      totalTargets: 14,
      errorCount: 0,
      contentIds: [125, 126],
    });
  });
});
