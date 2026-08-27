import { beforeEach, describe, expect, it, vi } from "vitest";

// Stub do supabase-js que grava a cadeia de chamadas: listPersonalizacaoJobs
// agora le a fila direto do Postgres, entao o que precisa ser verificado e' a
// consulta montada (tabela, filtros, ordem, limite), nao uma URL de API.
const sb = vi.hoisted(() => ({
  calls: [] as Array<{ table: string; ops: Array<[string, unknown[]]> }>,
  result: { data: [] as unknown, error: null as unknown },
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (table: string) => {
      const record = { table, ops: [] as Array<[string, unknown[]]> };
      sb.calls.push(record);
      const builder: Record<string, unknown> = {};
      for (const op of ["select", "order", "limit", "eq", "in"]) {
        builder[op] = (...args: unknown[]) => {
          record.ops.push([op, args]);
          return builder;
        };
      }
      builder.then = (resolve: (value: unknown) => unknown) =>
        Promise.resolve(sb.result).then(resolve);
      return builder;
    },
  },
}));

import {
  getPersonalizacaoJobContentIds,
  isPersonalizacaoJobActive,
  listPersonalizacaoJobs,
  selectFailedJobTopicoIds,
  summarizePersonalizacaoJobs,
  type PersonalizacaoJobStatus,
} from "./personalizacaoJobsApi";

function opsOf(index = 0): Array<[string, unknown[]]> {
  return sb.calls[index]?.ops ?? [];
}

describe("listPersonalizacaoJobs", () => {
  beforeEach(() => {
    sb.calls.length = 0;
    sb.result = { data: [], error: null };
  });

  it("le a tabela de jobs, filtra pela classe e ordena do mais recente", async () => {
    await listPersonalizacaoJobs({ classeId: 54, limit: 6 });

    expect(sb.calls[0].table).toBe("personalizacao_jobs");
    expect(opsOf()).toContainEqual(["eq", ["classe_id", 54]]);
    expect(opsOf()).toContainEqual(["order", ["created_at", { ascending: false }]]);
    expect(opsOf()).toContainEqual(["limit", [6]]);
  });

  it("nao aplica filtro de status quando a lista vem vazia", async () => {
    // `.in("status", [])` casaria com zero linhas — o painel do console
    // ficaria vazio em vez de mostrar a fila inteira.
    await listPersonalizacaoJobs({ classeId: 54, statuses: [] });

    expect(opsOf().some(([op]) => op === "in")).toBe(false);
  });

  it("normaliza payload null, que os consumidores leem como objeto", async () => {
    sb.result = {
      data: [{ id: "job-1", classe_id: 54, status: "pending", payload: null }],
      error: null,
    };

    const { itens, total } = await listPersonalizacaoJobs({ classeId: 54 });

    expect(total).toBe(1);
    expect(itens[0].payload).toEqual({});
    expect(getPersonalizacaoJobContentIds(itens[0])).toEqual([]);
  });

  it("propaga erro do PostgREST em vez de devolver lista vazia", async () => {
    // Um 403 de RLS nao pode virar "nenhum job": o console mostraria fila
    // limpa quando na verdade nao conseguiu ler nada.
    sb.result = { data: null, error: { message: "permission denied" } };

    await expect(listPersonalizacaoJobs({ classeId: 54 })).rejects.toMatchObject({
      message: "permission denied",
    });
  });
});

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

  it("coleta topico_id só dos jobs com status failed, deduplicado", () => {
    expect(
      selectFailedJobTopicoIds([
        buildJob({ id: "a", status: "failed", topico_id: 121 }),
        buildJob({ id: "b", status: "processing", topico_id: 122 }),
        buildJob({ id: "c", status: "failed", topico_id: 121 }),
        buildJob({ id: "d", status: "failed", topico_id: 123 }),
        buildJob({ id: "e", status: "failed", topico_id: null }),
      ])
    ).toEqual([121, 123]);
  });

  it("retorna vazio quando não há job failed", () => {
    expect(
      selectFailedJobTopicoIds([buildJob({ status: "processing", topico_id: 121 })])
    ).toEqual([]);
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
