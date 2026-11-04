import { test } from "node:test";
import assert from "node:assert/strict";
import {
  generationKeyFor,
  persistApresentacaoResult,
  computeAggregatedApresentacaoEntry,
  aggregatedApresentacaoFailure,
  emFilaPorPersonalizacao,
} from "./materialsPersistence";

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

// #776: a parte 1 falhava e gravava o motivo; a parte 2 chegava com sucesso e
// reescrevia `failure` como null, com o status ainda `failed`. O professor via
// "Falhou" sem motivo (seeker, turma 68, 01/11).
const PARTE_1_FALHOU = { stage: "generate", error: "resposta truncada no lote 3" };

test("#776: parte 1 falha, parte 2 da certo - o status fica failed com o motivo da parte 1", async () => {
  const fence = { personalizacaoId: 42, cicloId: "ciclo-1", sourceHash: "hash-abc" };
  const versionMetadata = { engine: "e", schema: "s", design_system: "d", media_pipeline_version: "m" };

  // Parte 1 chega primeiro e falha.
  const primeira = fakeClient({ selectRow: { aluno_id: "aluno-1", conteudo_id: 282, materiais: {} } });
  await persistApresentacaoResult(primeira.client, {
    fence, versionMetadata, bucket: "conteudo_aluno", storagePath: "p1.html",
    presentationUrl: null, failure: PARTE_1_FALHOU, ordem: 1, totalPartes: 2, titulo: "Intro",
  });
  const depoisDaParte1 = (primeira.calls.rpc[0].args.p_updates as any).apresentacao;
  assert.deepEqual(depoisDaParte1.partes[0].failure, PARTE_1_FALHOU);
  assert.equal(depoisDaParte1.metadata.error, PARTE_1_FALHOU.error);

  // Parte 2 chega depois, com sucesso, lendo o que a parte 1 gravou.
  const segunda = fakeClient({
    selectRow: { aluno_id: "aluno-1", conteudo_id: 282, materiais: { apresentacao: depoisDaParte1 } },
  });
  await persistApresentacaoResult(segunda.client, {
    fence, versionMetadata, bucket: "conteudo_aluno", storagePath: "p2.html",
    presentationUrl: "https://storage/p2.html", failure: null, ordem: 2, totalPartes: 2, titulo: "Fim",
  });
  const final = (segunda.calls.rpc[0].args.p_updates as any).apresentacao;
  assert.equal(final.metadata.status, "failed");
  assert.equal(final.metadata.error_stage, PARTE_1_FALHOU.stage);
  assert.equal(final.metadata.error, PARTE_1_FALHOU.error);
  assert.deepEqual(final.partes[0].failure, PARTE_1_FALHOU);
  assert.equal(final.partes[1].failure, undefined);
});

test("#776: parte que da certo nao grava failure, mesmo se vier um motivo junto", async () => {
  const { client, calls } = fakeClient({ selectRow: { aluno_id: "a", conteudo_id: 1, materiais: {} } });
  await persistApresentacaoResult(client, {
    fence: { personalizacaoId: 1, cicloId: "c", sourceHash: "h" },
    versionMetadata: { engine: "e", schema: "s", design_system: "d", media_pipeline_version: "m" },
    bucket: "b", storagePath: "p1.html", presentationUrl: "https://storage/p1.html",
    failure: PARTE_1_FALHOU, ordem: 1, totalPartes: 2,
  });
  const apresentacao = (calls.rpc[0].args.p_updates as any).apresentacao;
  assert.equal(apresentacao.partes[0].failure, undefined);
  assert.equal(apresentacao.metadata.error, undefined);
});

test("aggregatedApresentacaoFailure: sem parte falha, nao ha motivo", () => {
  assert.equal(aggregatedApresentacaoFailure("completed", [], PARTE_1_FALHOU, { error: "velho" }), null);
});

test("aggregatedApresentacaoFailure: parte antiga sem motivo proprio cai no motivo que ja estava na metadata", () => {
  const partes = [
    { ordem: 1, arquivo_url: null, storage_path: null, failed: true },
    { ordem: 2, arquivo_url: "u", storage_path: "p", failed: false },
  ];
  assert.deepEqual(
    aggregatedApresentacaoFailure("failed", partes, null, { error_stage: "network", error: "This operation was aborted" }),
    { stage: "network", error: "This operation was aborted" },
  );
});

test("aggregatedApresentacaoFailure: a parte que acabou de falhar vem antes das anteriores", () => {
  const anterior = { stage: "upload", error: "anterior" };
  const partes = [{ ordem: 1, arquivo_url: null, storage_path: null, failed: true, failure: anterior }];
  assert.deepEqual(aggregatedApresentacaoFailure("failed", partes, PARTE_1_FALHOU, null), PARTE_1_FALHOU);
  assert.deepEqual(aggregatedApresentacaoFailure("failed", partes, null, null), anterior);
});

// Banco de mentira com estado: o SELECT devolve o que a RPC gravou por ultimo,
// e cada operacao cede a vez antes de responder (como a rede faz), para que
// duas gravacoes concorrentes possam se intercalar.
function bancoComEstado(materiais: any) {
  const estado = { materiais };
  const cede = () => new Promise((r) => setTimeout(r, 1));
  const client = {
    rpc: async (_name: string, args: Record<string, unknown>) => {
      await cede();
      estado.materiais = { ...estado.materiais, ...(args.p_updates as any) };
      return { data: { status: "processando_midias" }, error: null };
    },
    from: (_table: string) => ({
      select: (_cols: string) => ({
        eq: () => ({
          eq: () => ({
            eq: () => ({
              maybeSingle: async () => {
                await cede();
                return { data: { aluno_id: "a", conteudo_id: 282, materiais: structuredClone(estado.materiais) }, error: null };
              },
            }),
          }),
        }),
      }),
      upsert: async () => ({ error: null }),
    }),
  };
  return { client: client as any, estado };
}

const FENCE = { personalizacaoId: 3864, cicloId: "c", sourceHash: "h" };
const VERSAO = { engine: "e", schema: "s", design_system: "d", media_pipeline_version: "m" };

test("partes gravadas ao mesmo tempo nao se apagam (socializer, turma 68, 02/11)", async () => {
  const { client, estado } = bancoComEstado({});
  const COTA = { stage: "generate", error: "cota" };
  await Promise.all(
    [1, 2, 3, 4].map((ordem) =>
      persistApresentacaoResult(client, {
        fence: FENCE, versionMetadata: VERSAO, bucket: "b", storagePath: `p${ordem}.html`,
        presentationUrl: ordem === 2 ? "https://storage/p2.html" : null,
        failure: ordem === 2 ? null : COTA,
        ordem, totalPartes: 4, titulo: `Parte ${ordem}`,
      }),
    ),
  );
  const partes = estado.materiais.apresentacao.partes;
  assert.deepEqual(partes.map((p: any) => p.ordem), [1, 2, 3, 4]);
  for (const parte of partes) {
    if (parte.ordem === 2) assert.equal(parte.failure, undefined);
    else assert.deepEqual(parte.failure, COTA);
  }
});

test("parte de geracao anterior com ordem acima do total sai da lista", async () => {
  const velha = { ordem: 8, titulo: "Banquete", arquivo_url: null, storage_path: null, failed: true };
  const { client, estado } = bancoComEstado({ apresentacao: { partes: [velha] } });
  for (const ordem of [1, 2]) {
    await persistApresentacaoResult(client, {
      fence: FENCE, versionMetadata: VERSAO, bucket: "b", storagePath: `p${ordem}.html`,
      presentationUrl: `https://storage/p${ordem}.html`, failure: null, ordem, totalPartes: 2,
    });
  }
  const apresentacao = estado.materiais.apresentacao;
  assert.deepEqual(apresentacao.partes.map((p: any) => p.ordem), [1, 2]);
  assert.equal(apresentacao.metadata.status, "completed");
});

test("computeAggregatedApresentacaoEntry ignora parte com ordem acima do total", () => {
  const r = computeAggregatedApresentacaoEntry(
    [{ ordem: 3, arquivo_url: null, storage_path: null, failed: true }],
    { ordem: 1, arquivo_url: "u", storage_path: "s", failed: false },
    2,
    "pending",
  );
  assert.deepEqual(r.partes.map((p) => p.ordem), [1]);
  assert.equal(r.status, "pending");
});

test("emFilaPorPersonalizacao: falha de uma gravacao nao trava as seguintes", async () => {
  const ordem: string[] = [];
  const falha = emFilaPorPersonalizacao(1, async () => { ordem.push("a"); throw new Error("x"); });
  const depois = emFilaPorPersonalizacao(1, async () => { ordem.push("b"); return 2; });
  await assert.rejects(falha);
  assert.equal(await depois, 2);
  assert.deepEqual(ordem, ["a", "b"]);
});

const CHAMADAS = [
  { etapa: "bloco" as const, slides: 4, resultado: "truncado" as const, modelo: "gemini-3.1-flash-lite", finishReason: "MAX_TOKENS", tokensSaida: 32753 },
  { etapa: "bloco" as const, slides: 4, resultado: "ok" as const, modelo: "gemini-3.1-flash-lite", finishReason: "STOP", tokensSaida: 8800, slidesRecebidos: 4 },
];

test("#775: parte que deu certo grava as chamadas ao modelo", async () => {
  const { client, calls } = fakeClient({
    selectRow: { aluno_id: "aluno-1", conteudo_id: 282, materiais: { apresentacao: { partes: [] } } },
  });
  await persistApresentacaoResult(client, {
    fence: { personalizacaoId: 42, cicloId: "ciclo-1", sourceHash: "hash-abc" },
    versionMetadata: VERSAO,
    bucket: "conteudo_aluno",
    storagePath: "p/2.html",
    presentationUrl: "https://storage/2.html",
    failure: null,
    ordem: 2,
    totalPartes: 8,
    chamadas: CHAMADAS,
  });
  const parte = (calls.rpc[0].args.p_updates as any).apresentacao.partes.find((p: any) => p.ordem === 2);
  assert.deepEqual(parte.chamadas, CHAMADAS);
  assert.equal(parte.failure, undefined);
});

test("#775: deck de uma parte grava as chamadas na apresentacao", async () => {
  const { client, calls } = fakeClient({ selectRow: { aluno_id: "aluno-1", conteudo_id: 282, materiais: {} } });
  await persistApresentacaoResult(client, {
    fence: { personalizacaoId: 42, cicloId: "ciclo-1", sourceHash: "hash-abc" },
    versionMetadata: VERSAO,
    bucket: "conteudo_aluno",
    storagePath: "p/1.html",
    presentationUrl: null,
    failure: { stage: "generate", error: "Blocos que falharam: 1 por cota." },
    ordem: 1,
    totalPartes: 1,
    chamadas: CHAMADAS,
  });
  const apresentacao = (calls.rpc[0].args.p_updates as any).apresentacao;
  assert.deepEqual(apresentacao.chamadas, CHAMADAS);
  assert.equal(apresentacao.metadata.status, "failed");
});

test("#775: sem chamadas (rota antiga, falha de validacao) nao grava a chave", async () => {
  const { client, calls } = fakeClient({ selectRow: { aluno_id: "aluno-1", conteudo_id: 282, materiais: {} } });
  await persistApresentacaoResult(client, {
    fence: { personalizacaoId: 42, cicloId: "ciclo-1", sourceHash: "hash-abc" },
    versionMetadata: VERSAO,
    bucket: "conteudo_aluno",
    storagePath: "p/1.html",
    presentationUrl: "https://storage/1.html",
    failure: null,
    ordem: 1,
    totalPartes: 1,
  });
  assert.equal("chamadas" in (calls.rpc[0].args.p_updates as any).apresentacao, false);
});
