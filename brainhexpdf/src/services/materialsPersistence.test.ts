import { test } from "node:test";
import assert from "node:assert/strict";
import { generationKeyFor, persistApresentacaoResult, computeAggregatedApresentacaoEntry } from "./materialsPersistence";

test("generationKeyFor monta cicloId:sourceHash", () => {
  const key = generationKeyFor({ personalizacaoId: 42, cicloId: "ciclo-1", sourceHash: "hash-abc" });
  assert.equal(key, "ciclo-1:hash-abc");
});

function fakeClient(opts: {
  rpcError?: string;
  selectRow?: { aluno_id: string; conteudo_id: number | null; materiais: any } | null;
  upsertError?: string;
}) {
  const calls: { rpc: any[]; upsert: any[] } = { rpc: [], upsert: [] };
  const client = {
    rpc: async (name: string, args: Record<string, unknown>) => {
      calls.rpc.push({ name, args });
      if (opts.rpcError) return { data: null, error: { message: opts.rpcError } };
      return { data: { status: "processando_midias" }, error: null };
    },
    from: (table: string) => ({
      select: (_cols: string) => ({
        eq: (_c1: string, _v1: unknown) => ({
          eq: (_c2: string, _v2: unknown) => ({
            eq: (_c3: string, _v3: unknown) => ({
              maybeSingle: async () => ({ data: opts.selectRow ?? null, error: null }),
            }),
          }),
        }),
      }),
      upsert: async (rows: unknown[], upsertOpts: { onConflict: string }) => {
        calls.upsert.push({ table, rows, upsertOpts });
        if (opts.upsertError) return { error: { message: opts.upsertError } };
        return { error: null };
      },
    }),
  };
  return { client: client as any, calls };
}

test("persistApresentacaoResult (1 parte) grava sucesso com status completed", async () => {
  const { client, calls } = fakeClient({
    selectRow: { aluno_id: "aluno-1", conteudo_id: 170, materiais: {} },
  });

  const result = await persistApresentacaoResult(client, {
    fence: { personalizacaoId: 42, cicloId: "ciclo-1", sourceHash: "hash-abc" },
    versionMetadata: { engine: "brainhexpdf-v1", schema: "v2", design_system: "v3", media_pipeline_version: "2026-08-16.1" },
    bucket: "conteudo_aluno",
    storagePath: "brainhex/mastermind/122/apresentacao/material-1.html",
    presentationUrl: "https://storage/x.html",
    failure: null,
    ordem: 1,
    totalPartes: 1,
  });

  assert.deepEqual(result, { dbWritten: true });
  assert.equal(calls.rpc.length, 1);
  assert.equal(calls.rpc[0].name, "merge_personalizacao_materiais_v2");
  assert.equal(calls.rpc[0].args.p_id, 42);
  assert.equal(calls.rpc[0].args.p_ciclo_id, "ciclo-1");
  assert.equal(calls.rpc[0].args.p_source_hash, "hash-abc");
  const apresentacao = (calls.rpc[0].args.p_updates as any).apresentacao;
  assert.equal(apresentacao.metadata.status, "completed");
  assert.equal(apresentacao.metadata.generation_key, "ciclo-1:hash-abc");
  assert.equal(apresentacao.metadata.engine, "brainhexpdf-v1");
  assert.equal(apresentacao.arquivo_url, "https://storage/x.html");
  assert.equal(apresentacao.partes, undefined);
  assert.equal(calls.upsert.length, 1);
  assert.equal(calls.upsert[0].rows[0].tipo, "apresentacao");
  assert.equal(calls.upsert[0].rows[0].aluno_id, "aluno-1");
  assert.equal(calls.upsert[0].upsertOpts.onConflict, "personalizacao_id,tipo,generation_key");
});

test("persistApresentacaoResult (1 parte) grava falha com status failed", async () => {
  const { client, calls } = fakeClient({
    selectRow: { aluno_id: "aluno-1", conteudo_id: 170, materiais: {} },
  });

  const result = await persistApresentacaoResult(client, {
    fence: { personalizacaoId: 42, cicloId: "ciclo-1", sourceHash: "hash-abc" },
    versionMetadata: { engine: "brainhexpdf-v1", schema: "v2", design_system: "v3", media_pipeline_version: "2026-08-16.1" },
    bucket: "conteudo_aluno",
    storagePath: "brainhex/mastermind/122/apresentacao/material-1.html",
    presentationUrl: null,
    failure: { stage: "generate", error: "Gemini quota exhausted" },
    ordem: 1,
    totalPartes: 1,
  });

  assert.deepEqual(result, { dbWritten: true });
  const apresentacao = (calls.rpc[0].args.p_updates as any).apresentacao;
  assert.equal(apresentacao.metadata.status, "failed");
  assert.equal(apresentacao.metadata.error_stage, "generate");
  assert.equal(apresentacao.metadata.error, "Gemini quota exhausted");
  assert.equal(apresentacao.arquivo_url, null);
});

test("persistApresentacaoResult devolve dbWritten:false quando a RPC falha, sem lancar", async () => {
  const { client } = fakeClient({ rpcError: "connection refused" });

  const result = await persistApresentacaoResult(client, {
    fence: { personalizacaoId: 42, cicloId: "ciclo-1", sourceHash: "hash-abc" },
    versionMetadata: { engine: "e", schema: "s", design_system: "d", media_pipeline_version: "m" },
    bucket: "conteudo_aluno",
    storagePath: "x.html",
    presentationUrl: "https://storage/x.html",
    failure: null,
    ordem: 1,
    totalPartes: 1,
  });

  assert.deepEqual(result, { dbWritten: false, error: "connection refused" });
});

test("persistApresentacaoResult ignora geracao obsoleta sem tentar o upsert de historico", async () => {
  const { client, calls } = fakeClient({ selectRow: null });

  const result = await persistApresentacaoResult(client, {
    fence: { personalizacaoId: 42, cicloId: "ciclo-1", sourceHash: "hash-abc" },
    versionMetadata: { engine: "e", schema: "s", design_system: "d", media_pipeline_version: "m" },
    bucket: "conteudo_aluno",
    storagePath: "x.html",
    presentationUrl: "https://storage/x.html",
    failure: null,
    ordem: 1,
    totalPartes: 1,
  });

  assert.deepEqual(result, { dbWritten: true });
  assert.equal(calls.upsert.length, 0);
});

test("persistApresentacaoResult mantem dbWritten:true mesmo se so o upsert de historico falhar", async () => {
  const { client } = fakeClient({
    selectRow: { aluno_id: "aluno-1", conteudo_id: 170, materiais: {} },
    upsertError: "constraint violation",
  });

  const result = await persistApresentacaoResult(client, {
    fence: { personalizacaoId: 42, cicloId: "ciclo-1", sourceHash: "hash-abc" },
    versionMetadata: { engine: "e", schema: "s", design_system: "d", media_pipeline_version: "m" },
    bucket: "conteudo_aluno",
    storagePath: "x.html",
    presentationUrl: "https://storage/x.html",
    failure: null,
    ordem: 1,
    totalPartes: 1,
  });

  assert.deepEqual(result, { dbWritten: true });
});

test("computeAggregatedApresentacaoEntry mantem status atual quando faltam partes", () => {
  const result = computeAggregatedApresentacaoEntry(
    [],
    { ordem: 1, titulo: "Introducao", arquivo_url: "https://storage/p1.html", storage_path: "p1.html", failed: false },
    2,
    "pending",
  );

  assert.deepEqual(result.partes, [
    { ordem: 1, titulo: "Introducao", arquivo_url: "https://storage/p1.html", storage_path: "p1.html", failed: false },
  ]);
  assert.equal(result.status, "pending");
  assert.equal(result.headline.arquivo_url, "https://storage/p1.html");
});

test("computeAggregatedApresentacaoEntry marca completed quando todas as partes chegaram sem falha", () => {
  const currentPartes = [
    { ordem: 1, titulo: "Introducao", arquivo_url: "https://storage/p1.html", storage_path: "p1.html", failed: false },
  ];
  const result = computeAggregatedApresentacaoEntry(
    currentPartes,
    { ordem: 2, titulo: "Conclusao", arquivo_url: "https://storage/p2.html", storage_path: "p2.html", failed: false },
    2,
    "pending",
  );

  assert.equal(result.partes.length, 2);
  assert.equal(result.partes[0].ordem, 1);
  assert.equal(result.partes[1].ordem, 2);
  assert.equal(result.status, "completed");
  assert.equal(result.headline.arquivo_url, "https://storage/p1.html");
});

test("computeAggregatedApresentacaoEntry marca failed se qualquer parte falhou", () => {
  const currentPartes = [
    { ordem: 1, titulo: "Introducao", arquivo_url: "https://storage/p1.html", storage_path: "p1.html", failed: false },
  ];
  const result = computeAggregatedApresentacaoEntry(
    currentPartes,
    { ordem: 2, titulo: "Conclusao", arquivo_url: null, storage_path: null, failed: true },
    2,
    "pending",
  );

  assert.equal(result.status, "failed");
});

test("computeAggregatedApresentacaoEntry substitui a parte com mesma ordem em vez de duplicar", () => {
  const currentPartes = [
    { ordem: 1, titulo: "Introducao", arquivo_url: null, storage_path: null, failed: true },
    { ordem: 2, titulo: "Conclusao", arquivo_url: "https://storage/p2.html", storage_path: "p2.html", failed: false },
  ];
  const result = computeAggregatedApresentacaoEntry(
    currentPartes,
    { ordem: 1, titulo: "Introducao", arquivo_url: "https://storage/p1-retry.html", storage_path: "p1-retry.html", failed: false },
    2,
    "failed",
  );

  assert.equal(result.partes.length, 2);
  assert.equal(result.partes[0].arquivo_url, "https://storage/p1-retry.html");
  assert.equal(result.status, "completed");
});

test("persistApresentacaoResult (multi-parte) agrega com as partes ja existentes no banco", async () => {
  const { client, calls } = fakeClient({
    selectRow: {
      aluno_id: "aluno-1",
      conteudo_id: 170,
      materiais: {
        apresentacao: {
          partes: [{ ordem: 1, titulo: "Intro", arquivo_url: "https://storage/p1.html", storage_path: "p1.html", failed: false }],
        },
      },
    },
  });

  const result = await persistApresentacaoResult(client, {
    fence: { personalizacaoId: 42, cicloId: "ciclo-1", sourceHash: "hash-abc" },
    versionMetadata: { engine: "e", schema: "s", design_system: "d", media_pipeline_version: "m" },
    bucket: "conteudo_aluno",
    storagePath: "p2.html",
    presentationUrl: "https://storage/p2.html",
    failure: null,
    ordem: 2,
    totalPartes: 2,
    titulo: "Conclusao",
  });

  assert.deepEqual(result, { dbWritten: true });
  const apresentacao = (calls.rpc[0].args.p_updates as any).apresentacao;
  assert.equal(apresentacao.partes.length, 2);
  assert.equal(apresentacao.metadata.status, "completed");
  assert.equal(apresentacao.arquivo_url, "https://storage/p1.html"); // headline = parte 1
});
