# BrainHexPDF Direct DB Write Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** BrainHexPDF grava o resultado da apresentação (`materiais.apresentacao` + histórico em `materiais_gerados`) direto no banco via Supabase, em vez de só devolver a URL pro microservice decidir o que persistir.

**Architecture:** Novo módulo `materialsPersistence.ts` no BrainHexPDF chama a mesma RPC Postgres (`merge_personalizacao_materiais_v2`) e o mesmo upsert atômico (`materiais_gerados`, `ON CONFLICT`) que o microservice já usa hoje para si mesmo. O microservice passa a mandar `personalizacaoId`/`cicloId`/`sourceHash`/`ordem`/`totalPartes`/`presentationVersionMetadata` no request e para de gravar `apresentacao` no caminho feliz — só grava um fallback quando a chamada HTTP falha no nível de transporte (`dbWritten: false`).

**Tech Stack:** TypeScript, Express, Supabase JS client (`@supabase/supabase-js`), `node:test`/`node:assert/strict` via `tsx`.

**Spec:** `docs/superpowers/specs/2026-08-16-brainhexpdf-direct-db-write-design.md`

## Global Constraints

- Nenhuma env var nova no BrainHexPDF — reusa `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` já existentes.
- Nenhuma constante de versão (`PRESENTATION_ENGINE_VERSION` etc.) é duplicada no BrainHexPDF — o microservice sempre manda o objeto `presentationVersionMetadata` pronto no request.
- `totalPartes === 1` nunca produz campo `partes[]` no `p_updates.apresentacao` (mantém o formato atual do caso single-shot).
- `MaterialPart.failed` é aditivo — JSONB antigo sem esse campo continua válido (tratar como `undefined`/falsy).
- `persistApresentacaoResult`/o handler HTTP NUNCA lançam por erro de RPC/upsert — sempre retornam `{ dbWritten: false, error }` pro caller decidir.
- Falha de transporte (timeout/rede) no microservice: `dbWritten` fica `false` por default — dispara o fallback nos 3 call sites.

---

### Task 1: BrainHexPDF — bootstrap de teste + `generationKeyFor`

**Files:**
- Modify: `../BrainHexPDF/package.json` (script `test`)
- Create: `../BrainHexPDF/src/services/materialsPersistence.ts`
- Create: `../BrainHexPDF/src/services/materialsPersistence.test.ts`

**Interfaces:**
- Produces: `generationKeyFor(fence: GenerationFence): string`, tipo `GenerationFence { personalizacaoId: number; cicloId: string; sourceHash: string }`.

BrainHexPDF não tem infraestrutura de teste nenhuma hoje. Este projeto usa `node:test` via `tsx` no microservice — mesmo padrão aqui.

- [ ] **Step 1: Escrever o teste que falha**

```ts
// ../BrainHexPDF/src/services/materialsPersistence.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { generationKeyFor } from "./materialsPersistence";

test("generationKeyFor monta cicloId:sourceHash", () => {
  const key = generationKeyFor({ personalizacaoId: 42, cicloId: "ciclo-1", sourceHash: "hash-abc" });
  assert.equal(key, "ciclo-1:hash-abc");
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `cd ../BrainHexPDF && npx tsx --test src/services/materialsPersistence.test.ts`
Expected: FAIL — `Cannot find module './materialsPersistence'` (arquivo ainda não existe).

- [ ] **Step 3: Criar o módulo com o mínimo pra passar**

```ts
// ../BrainHexPDF/src/services/materialsPersistence.ts
export interface GenerationFence {
  personalizacaoId: number;
  cicloId: string;
  sourceHash: string;
}

export function generationKeyFor(fence: GenerationFence): string {
  return `${fence.cicloId}:${fence.sourceHash}`;
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

Run: `npx tsx --test src/services/materialsPersistence.test.ts`
Expected: PASS (1 passing).

- [ ] **Step 5: Adicionar o script `test` ao `package.json`**

Em `../BrainHexPDF/package.json`, dentro de `"scripts"`, adicionar (mesmo padrão do `microservice/package.json` — lista explícita de arquivos):

```json
"test": "node --import tsx --test src/services/materialsPersistence.test.ts"
```

Run: `npm test`
Expected: PASS (1 passing) — confirma que o runner funciona via `npm test`, não só `npx tsx --test` direto.

- [ ] **Step 6: Commit**

```bash
cd ../BrainHexPDF
git add package.json src/services/materialsPersistence.ts src/services/materialsPersistence.test.ts
git commit -m "test: bootstrap node:test no BrainHexPDF + generationKeyFor"
```

---

### Task 2: BrainHexPDF — `persistApresentacaoResult` (caso single-shot, `totalPartes === 1`)

**Files:**
- Modify: `../BrainHexPDF/src/services/materialsPersistence.ts`
- Modify: `../BrainHexPDF/src/services/materialsPersistence.test.ts`

**Interfaces:**
- Consumes: `generationKeyFor` (Task 1).
- Produces: `PresentationVersionMetadata`, `PersistApresentacaoParams`, `SupabaseClientLike`, `persistApresentacaoResult(client, params): Promise<{ dbWritten: boolean; error?: string }>`.

**Fake de Supabase usado nos testes** (objeto plano, sem lib de mock — mesmo estilo de `RecordingSession` já usado em `api/tests/test_repositories.py` e `microservice/`):

```ts
// dentro do .test.ts
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
```

- [ ] **Step 1: Teste — sucesso grava com status "completed"**

```ts
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
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npm test`
Expected: FAIL — `persistApresentacaoResult is not a function` / não exportado.

- [ ] **Step 3: Teste — falha de geração grava status "failed"**

```ts
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
```

- [ ] **Step 4: Teste — RPC retorna erro, não lança**

```ts
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
```

- [ ] **Step 5: Teste — geração obsoleta (SELECT não encontra linha) não faz upsert**

```ts
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
```

- [ ] **Step 6: Teste — falha no upsert de histórico não derruba `dbWritten`**

```ts
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
```

- [ ] **Step 7: Implementar `persistApresentacaoResult`**

```ts
// adicionar em materialsPersistence.ts

export interface PresentationVersionMetadata {
  engine: string;
  schema: string;
  design_system: string;
  media_pipeline_version: string;
}

export interface PresentationFailure {
  stage: string;
  error: string;
}

export interface PersistApresentacaoParams {
  fence: GenerationFence;
  versionMetadata: PresentationVersionMetadata;
  bucket: string;
  storagePath: string;
  presentationUrl: string | null;
  failure: PresentationFailure | null;
  ordem: number;
  totalPartes: number;
}

export interface MaterialPart {
  ordem: number;
  titulo?: string;
  arquivo_url: string | null;
  storage_path: string | null;
  failed?: boolean;
}

interface SupabaseRpcResult {
  data: unknown;
  error: { message: string } | null;
}

interface SupabaseSelectResult {
  data: { aluno_id: string; conteudo_id: number | null; materiais: any } | null;
  error: unknown;
}

export interface SupabaseClientLike {
  rpc(name: string, args: Record<string, unknown>): Promise<SupabaseRpcResult>;
  from(table: string): {
    select(cols: string): {
      eq(col: string, val: unknown): {
        eq(col: string, val: unknown): {
          eq(col: string, val: unknown): { maybeSingle(): Promise<SupabaseSelectResult> };
        };
      };
    };
    upsert(rows: unknown[], opts: { onConflict: string }): Promise<{ error: { message: string } | null }>;
  };
}

function buildApresentacaoMetadata(params: {
  // string, nao só "completed"|"failed": a Task 4 (agregacao multi-parte)
  // tambem passa o status intermediario atual do banco quando ainda faltam
  // partes chegar.
  status: string;
  versionMetadata: PresentationVersionMetadata;
  generationKey: string;
  bucket: string | null;
  failure: PresentationFailure | null;
}) {
  return {
    status: params.status,
    media_kind: "apresentacao",
    ...params.versionMetadata,
    generation_key: params.generationKey,
    updated_at: new Date().toISOString(),
    ...(params.bucket ? { bucket: params.bucket } : {}),
    ...(params.failure ? { error_stage: params.failure.stage, error: params.failure.error } : {}),
  };
}

export async function persistApresentacaoResult(
  client: SupabaseClientLike,
  params: PersistApresentacaoParams,
): Promise<{ dbWritten: boolean; error?: string }> {
  const generationKey = generationKeyFor(params.fence);
  const status: "completed" | "failed" = params.presentationUrl ? "completed" : "failed";

  const apresentacao = {
    payload: { slides: [] as never[], tema_visual: null },
    metadata: buildApresentacaoMetadata({
      status,
      versionMetadata: params.versionMetadata,
      generationKey,
      bucket: params.presentationUrl ? params.bucket : null,
      failure: params.failure,
    }),
    arquivo_url: params.presentationUrl,
    storage_path: params.presentationUrl ? params.storagePath : null,
    ...(params.presentationUrl ? { bucket: params.bucket, mime_type: "text/html; charset=utf-8" } : {}),
  };

  const { error: rpcError } = await client.rpc("merge_personalizacao_materiais_v2", {
    p_id: params.fence.personalizacaoId,
    p_updates: { apresentacao },
    p_ciclo_id: params.fence.cicloId,
    p_source_hash: params.fence.sourceHash,
  });
  if (rpcError) {
    return { dbWritten: false, error: rpcError.message };
  }

  const { data: row } = await client
    .from("conteudo_personalizado")
    .select("aluno_id, conteudo_id, materiais")
    .eq("id", params.fence.personalizacaoId)
    .eq("ciclo_id", params.fence.cicloId)
    .eq("source_hash", params.fence.sourceHash)
    .maybeSingle();

  if (!row) {
    return { dbWritten: true };
  }

  const { error: upsertError } = await client.from("materiais_gerados").upsert(
    [
      {
        aluno_id: row.aluno_id,
        conteudo_id: row.conteudo_id ?? null,
        personalizacao_id: params.fence.personalizacaoId,
        tipo: "apresentacao",
        payload: apresentacao.payload,
        arquivo_url: apresentacao.arquivo_url,
        storage_path: apresentacao.storage_path,
        metadata: apresentacao.metadata,
      },
    ],
    { onConflict: "personalizacao_id,tipo,generation_key" },
  );
  if (upsertError) {
    console.error("persistApresentacaoResult: upsert materiais_gerados falhou", upsertError.message);
  }

  return { dbWritten: true };
}
```

- [ ] **Step 8: Rodar e confirmar que todos os 5 testes passam**

Run: `npm test`
Expected: PASS (6 passing — inclui o `generationKeyFor` da Task 1).

- [ ] **Step 9: Commit**

```bash
cd ../BrainHexPDF
git add src/services/materialsPersistence.ts src/services/materialsPersistence.test.ts
git commit -m "feat: persistApresentacaoResult grava direto na RPC + materiais_gerados (caso 1 parte)"
```

---

### Task 3: BrainHexPDF — agregação de `partes[]` (`totalPartes > 1`)

**Files:**
- Modify: `../BrainHexPDF/src/services/materialsPersistence.ts`
- Modify: `../BrainHexPDF/src/services/materialsPersistence.test.ts`

**Interfaces:**
- Consumes: `MaterialPart`, `PersistApresentacaoParams`, `SupabaseClientLike` (Task 2).
- Produces: `computeAggregatedApresentacaoEntry(currentPartes, novaParte, totalPartes, currentStatus): { partes: MaterialPart[]; status: "completed" | "failed" | string; headline: { arquivo_url: string | null; storage_path: string | null } }` (função pura, sem I/O — testável isolada).

`PersistApresentacaoParams` ganha um campo opcional `titulo?: string` (nome da parte, usado em `MaterialPart.titulo`).

- [ ] **Step 1: Teste — parte 1 de 2, ainda falta a parte 2**

```ts
test("computeAggregatedApresentacaoEntry mantem status atual quando faltam partes", () => {
  const result = computeAggregatedApresentacaoEntry(
    [], // currentPartes (nenhuma ainda)
    { ordem: 1, titulo: "Introducao", arquivo_url: "https://storage/p1.html", storage_path: "p1.html", failed: false },
    2, // totalPartes
    "pending", // currentStatus
  );

  assert.deepEqual(result.partes, [
    { ordem: 1, titulo: "Introducao", arquivo_url: "https://storage/p1.html", storage_path: "p1.html", failed: false },
  ]);
  assert.equal(result.status, "pending");
  assert.equal(result.headline.arquivo_url, "https://storage/p1.html");
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npm test`
Expected: FAIL — `computeAggregatedApresentacaoEntry is not a function`.

- [ ] **Step 3: Teste — parte 2 chega, todas completas**

```ts
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
```

- [ ] **Step 4: Teste — uma parte falha, status vira failed mesmo com outras OK**

```ts
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
```

- [ ] **Step 5: Teste — retry de uma parte existente substitui, não duplica**

```ts
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
```

- [ ] **Step 6: Implementar `computeAggregatedApresentacaoEntry`**

```ts
// adicionar em materialsPersistence.ts

export function computeAggregatedApresentacaoEntry(
  currentPartes: MaterialPart[],
  novaParte: MaterialPart,
  totalPartes: number,
  currentStatus: string,
): { partes: MaterialPart[]; status: string; headline: { arquivo_url: string | null; storage_path: string | null } } {
  const mergedPartes = [...currentPartes.filter((p) => p.ordem !== novaParte.ordem), novaParte].sort(
    (a, b) => a.ordem - b.ordem,
  );

  const anyFailed = mergedPartes.some((p) => p.failed);
  const allArrived = mergedPartes.length === totalPartes;

  let status: string;
  if (anyFailed) {
    status = "failed";
  } else if (allArrived) {
    status = "completed";
  } else {
    status = currentStatus;
  }

  return {
    partes: mergedPartes,
    status,
    headline: {
      arquivo_url: mergedPartes[0]?.arquivo_url ?? null,
      storage_path: mergedPartes[0]?.storage_path ?? null,
    },
  };
}
```

- [ ] **Step 7: Rodar e confirmar que os 4 testes novos passam**

Run: `npm test`
Expected: PASS (10 passing).

- [ ] **Step 8: Commit**

```bash
cd ../BrainHexPDF
git add src/services/materialsPersistence.ts src/services/materialsPersistence.test.ts
git commit -m "feat: computeAggregatedApresentacaoEntry agrega partes[] entre chamadas sequenciais"
```

---

### Task 4: BrainHexPDF — integrar `persistApresentacaoResult` no handler multi-parte + `server.ts`

**Files:**
- Modify: `../BrainHexPDF/src/services/materialsPersistence.ts`
- Modify: `../BrainHexPDF/src/services/materialsPersistence.test.ts`
- Modify: `../BrainHexPDF/server.ts:1870-2009` (handler `/api/v1/render-and-store`)

**Interfaces:**
- Consumes: `persistApresentacaoResult`, `computeAggregatedApresentacaoEntry`, `generationKeyFor` (Tasks 1-3).
- Produces: resposta HTTP de `/api/v1/render-and-store` ganha `dbWritten: boolean`.

Primeiro, unificar `persistApresentacaoResult` pra usar a agregação quando `totalPartes > 1` (hoje só cobre o caso 1 parte da Task 2).

- [ ] **Step 1: Teste — `persistApresentacaoResult` com `totalPartes > 1` busca `materiais` atual e agrega**

```ts
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
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npm test`
Expected: FAIL — resultado atual não inclui `partes[]` pra `totalPartes > 1` (a Step atual do código monta a RPC ANTES do SELECT, sem considerar partes existentes).

- [ ] **Step 3: Reescrever `persistApresentacaoResult` pra buscar o estado atual ANTES de montar `p_updates` quando `totalPartes > 1`**

Substituir a implementação da Task 2 por esta versão (o SELECT agora acontece antes do RPC quando há mais de uma parte, porque a agregação precisa do estado atual):

```ts
export async function persistApresentacaoResult(
  client: SupabaseClientLike,
  params: PersistApresentacaoParams,
): Promise<{ dbWritten: boolean; error?: string }> {
  const generationKey = generationKeyFor(params.fence);
  const novaParte: MaterialPart = {
    ordem: params.ordem,
    titulo: params.titulo,
    arquivo_url: params.presentationUrl,
    storage_path: params.presentationUrl ? params.storagePath : null,
    failed: params.presentationUrl === null,
  };

  let currentRow: { aluno_id: string; conteudo_id: number | null; materiais: any } | null = null;
  if (params.totalPartes > 1) {
    const { data } = await client
      .from("conteudo_personalizado")
      .select("aluno_id, conteudo_id, materiais")
      .eq("id", params.fence.personalizacaoId)
      .eq("ciclo_id", params.fence.cicloId)
      .eq("source_hash", params.fence.sourceHash)
      .maybeSingle();
    currentRow = data;
    if (!currentRow) {
      return { dbWritten: true }; // geracao obsoleta, nada a agregar
    }
  }

  let apresentacao: Record<string, unknown>;
  if (params.totalPartes > 1) {
    const currentPartes: MaterialPart[] = currentRow?.materiais?.apresentacao?.partes ?? [];
    const currentStatus: string = currentRow?.materiais?.apresentacao?.metadata?.status ?? "pending";
    const aggregated = computeAggregatedApresentacaoEntry(currentPartes, novaParte, params.totalPartes, currentStatus);
    // aggregated.status pode ser "completed"/"failed" (terminal) ou o
    // status intermediario atual do banco (ainda faltam partes) - passa
    // direto, sem normalizar: a RPC recomputa o status AGREGADO do registro
    // inteiro; isso so afeta o valor desta chave especifica.
    apresentacao = {
      payload: { slides: [] as never[], tema_visual: null },
      metadata: buildApresentacaoMetadata({
        status: aggregated.status,
        versionMetadata: params.versionMetadata,
        generationKey,
        bucket: aggregated.headline.arquivo_url ? params.bucket : null,
        failure: novaParte.failed ? params.failure : null,
      }),
      arquivo_url: aggregated.headline.arquivo_url,
      storage_path: aggregated.headline.storage_path,
      partes: aggregated.partes,
      ...(aggregated.headline.arquivo_url ? { bucket: params.bucket, mime_type: "text/html; charset=utf-8" } : {}),
    };
  } else {
    const status: "completed" | "failed" = params.presentationUrl ? "completed" : "failed";
    apresentacao = {
      payload: { slides: [] as never[], tema_visual: null },
      metadata: buildApresentacaoMetadata({
        status,
        versionMetadata: params.versionMetadata,
        generationKey,
        bucket: params.presentationUrl ? params.bucket : null,
        failure: params.failure,
      }),
      arquivo_url: params.presentationUrl,
      storage_path: params.presentationUrl ? params.storagePath : null,
      ...(params.presentationUrl ? { bucket: params.bucket, mime_type: "text/html; charset=utf-8" } : {}),
    };
  }

  const { error: rpcError } = await client.rpc("merge_personalizacao_materiais_v2", {
    p_id: params.fence.personalizacaoId,
    p_updates: { apresentacao },
    p_ciclo_id: params.fence.cicloId,
    p_source_hash: params.fence.sourceHash,
  });
  if (rpcError) {
    return { dbWritten: false, error: rpcError.message };
  }

  let row = currentRow;
  if (!row) {
    const { data } = await client
      .from("conteudo_personalizado")
      .select("aluno_id, conteudo_id, materiais")
      .eq("id", params.fence.personalizacaoId)
      .eq("ciclo_id", params.fence.cicloId)
      .eq("source_hash", params.fence.sourceHash)
      .maybeSingle();
    row = data;
  }
  if (!row) {
    return { dbWritten: true };
  }

  const { error: upsertError } = await client.from("materiais_gerados").upsert(
    [
      {
        aluno_id: row.aluno_id,
        conteudo_id: row.conteudo_id ?? null,
        personalizacao_id: params.fence.personalizacaoId,
        tipo: "apresentacao",
        payload: apresentacao.payload,
        arquivo_url: apresentacao.arquivo_url,
        storage_path: apresentacao.storage_path,
        metadata: apresentacao.metadata,
      },
    ],
    { onConflict: "personalizacao_id,tipo,generation_key" },
  );
  if (upsertError) {
    console.error("persistApresentacaoResult: upsert materiais_gerados falhou", upsertError.message);
  }

  return { dbWritten: true };
}
```

Atualizar `PersistApresentacaoParams` (adicionar `titulo?: string`).

- [ ] **Step 4: Rodar TODOS os testes do arquivo e confirmar que passam (incluindo os das Tasks 2-3)**

Run: `npm test`
Expected: PASS (11 passing) — reconfirma que o caso `totalPartes===1` (Task 2) não regrediu (agora faz 1 SELECT a mais só quando `totalPartes>1`, então os testes de 1-parte continuam batendo 1 chamada de `select` — ver Step 5).

- [ ] **Step 5: Se algum teste da Task 2 quebrar por causa da chamada de SELECT dupla no caso `totalPartes===1`**

O código acima só faz o `currentRow` lookup ANTES do RPC quando `totalPartes > 1` — para `totalPartes === 1` o SELECT continua acontecendo só uma vez, DEPOIS do RPC, igual à Task 2. Se o teste falhar, o bug está em ter deixado esse `if (params.totalPartes > 1)` fora do bloco certo — revisar antes de prosseguir.

- [ ] **Step 6: Integrar no handler `/api/v1/render-and-store`**

Em `../BrainHexPDF/server.ts`, no topo do arquivo, adicionar o import:

```ts
import { persistApresentacaoResult } from './src/services/materialsPersistence';
```

Dentro do handler (`server.ts:1870`), extrair os campos novos do body:

```ts
const {
  targetProfile,
  topic,
  sourceText,
  classe = 'Turma-Geral',
  narrativeStyle,
  slideCount,
  bucket,
  storagePath,
  personalizacaoId,
  cicloId,
  sourceHash,
  ordem = 1,
  totalPartes = 1,
  presentationVersionMetadata,
} = req.body;
```

Adicionar validação (junto das validações existentes de `targetProfile`/`bucket`/`storagePath`):

```ts
const hasFence = personalizacaoId !== undefined && cicloId && sourceHash && presentationVersionMetadata;
```

Nos 3 pontos de retorno de erro ANTES do upload (`stage: 'validate'`, `'generate'`, `'render'`), se `hasFence` for `true`, chamar `persistApresentacaoResult` com `presentationUrl: null` e a falha correspondente ANTES de responder — assim mesmo uma falha de geração grava o estado no banco. Exemplo no branch `catch` de `generateDeckSlidesInBatches` (linha ~1919):

```ts
} catch (err: any) {
  if (hasFence) {
    await persistApresentacaoResult(getServiceRoleClient(), {
      fence: { personalizacaoId, cicloId, sourceHash },
      versionMetadata: presentationVersionMetadata,
      bucket,
      storagePath,
      presentationUrl: null,
      failure: { stage: 'generate', error: err.message },
      ordem,
      totalPartes,
    });
  }
  return res.status(502).json({ success: false, stage: 'generate', error: err.message });
}
```

Repetir o mesmo padrão no `catch` de `generateInteractiveHtml` (`stage: 'render'`) e no `catch`/`if (uploadError)` do upload (`stage: 'upload'`).

No caminho de sucesso (depois do upload, antes do `return res.json(...)`):

```ts
let dbWritten = false;
if (hasFence) {
  const persistResult = await persistApresentacaoResult(getServiceRoleClient(), {
    fence: { personalizacaoId, cicloId, sourceHash },
    versionMetadata: presentationVersionMetadata,
    bucket,
    storagePath,
    presentationUrl: deckUrl,
    failure: null,
    ordem,
    totalPartes,
  });
  dbWritten = persistResult.dbWritten;
}
return res.json({
  success: true,
  url: deckUrl,
  storage_path: storagePath,
  bucket,
  slide_count: fullDeck.slides.length,
  model_used: modelUsed,
  dbWritten,
});
```

Requisições SEM os campos novos (`hasFence === false`) continuam funcionando exatamente como hoje, com `dbWritten: false` na resposta — retrocompatível com qualquer chamador antigo (ex.: `/api/generate-deck`, que não usa este endpoint).

- [ ] **Step 7: Verificar tipos e build**

Run: `npx tsc --noEmit && npm run build`
Expected: sem erro.

- [ ] **Step 8: Commit**

```bash
cd ../BrainHexPDF
git add src/services/materialsPersistence.ts src/services/materialsPersistence.test.ts server.ts
git commit -m "feat: /api/v1/render-and-store grava direto no banco quando recebe fence"
```

---

### Task 5: microservice — `computeAggregatedApresentacaoEntry` (cópia TS, fallback)

**Files:**
- Modify: `microservice/src/lib/materialsMerge.ts`
- Modify: `microservice/src/lib/materialsMerge.test.ts`

**Interfaces:**
- Produces: `MaterialPart` ganha `failed?: boolean` (aditivo). `computeAggregatedApresentacaoEntry(currentPartes, novaParte, totalPartes, currentStatus)` — MESMA assinatura e comportamento da Task 3 no BrainHexPDF (duplicação deliberada, comentário cruzando os dois arquivos).

- [ ] **Step 1: Escrever o teste que falha** (mesmos 4 casos da Task 3, adaptados ao arquivo de teste existente)

```ts
// adicionar no fim de microservice/src/lib/materialsMerge.test.ts
import { computeAggregatedApresentacaoEntry } from "./materialsMerge"; // ajustar import no topo do arquivo, junto do computeMergedMaterials existente

test("computeAggregatedApresentacaoEntry: mantem status atual quando faltam partes", () => {
  const result = computeAggregatedApresentacaoEntry(
    [],
    { ordem: 1, titulo: "Introducao", arquivo_url: "https://storage/p1.html", storage_path: "p1.html", failed: false },
    2,
    "pending",
  );
  assert.equal(result.status, "pending");
  assert.equal(result.partes.length, 1);
});

test("computeAggregatedApresentacaoEntry: completed quando todas as partes chegaram sem falha", () => {
  const currentPartes = [
    { ordem: 1, titulo: "Introducao", arquivo_url: "https://storage/p1.html", storage_path: "p1.html", failed: false },
  ];
  const result = computeAggregatedApresentacaoEntry(
    currentPartes,
    { ordem: 2, titulo: "Conclusao", arquivo_url: "https://storage/p2.html", storage_path: "p2.html", failed: false },
    2,
    "pending",
  );
  assert.equal(result.status, "completed");
  assert.equal(result.headline.arquivo_url, "https://storage/p1.html");
});

test("computeAggregatedApresentacaoEntry: failed se qualquer parte falhou", () => {
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

test("computeAggregatedApresentacaoEntry: substitui parte com mesma ordem, nao duplica", () => {
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
  assert.equal(result.status, "completed");
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `cd microservice && npm test -- --test-name-pattern="computeAggregatedApresentacaoEntry"` (ou `npx tsx --test src/lib/materialsMerge.test.ts`)
Expected: FAIL — função não existe.

- [ ] **Step 3: Implementar (idêntico à Task 3, mesmo arquivo de destino diferente)**

Em `microservice/src/lib/materialsMerge.ts`, adicionar no topo do arquivo (perto do comentário existente sobre duplicação com a RPC):

```ts
// computeAggregatedApresentacaoEntry é duplicada deliberadamente em
// ../BrainHexPDF/src/services/materialsPersistence.ts (mesma lógica, TS dos
// dois lados — o BrainHexPDF grava direto na RPC parte a parte; este lado
// só é usado no fallback quando a chamada HTTP falha em nível de
// transporte). Se a lógica mudar aqui, atualize a cópia lá.
export interface MaterialPart {
  ordem: number;
  titulo?: string;
  arquivo_url: string | null;
  storage_path: string | null;
  failed?: boolean;
}

export function computeAggregatedApresentacaoEntry(
  currentPartes: MaterialPart[],
  novaParte: MaterialPart,
  totalPartes: number,
  currentStatus: string,
): { partes: MaterialPart[]; status: string; headline: { arquivo_url: string | null; storage_path: string | null } } {
  const mergedPartes = [...currentPartes.filter((p) => p.ordem !== novaParte.ordem), novaParte].sort(
    (a, b) => a.ordem - b.ordem,
  );

  const anyFailed = mergedPartes.some((p) => p.failed);
  const allArrived = mergedPartes.length === totalPartes;

  let status: string;
  if (anyFailed) {
    status = "failed";
  } else if (allArrived) {
    status = "completed";
  } else {
    status = currentStatus;
  }

  return {
    partes: mergedPartes,
    status,
    headline: {
      arquivo_url: mergedPartes[0]?.arquivo_url ?? null,
      storage_path: mergedPartes[0]?.storage_path ?? null,
    },
  };
}
```

Nota: já existe `export interface MaterialPart` em `microservice/src/services/supabaseService.ts:100-105` — este novo `MaterialPart` em `materialsMerge.ts` precisa dos MESMOS campos + `failed?`. Se o TypeScript reclamar de tipos incompatíveis nos call sites (Tasks 7-9), importar o tipo de `materialsMerge.ts` em vez de `supabaseService.ts` nesses arquivos, ou adicionar `failed?: boolean` diretamente em `supabaseService.ts:100-105` e reexportar de lá (mais simples — ver Step 3.1).

- [ ] **Step 3.1: Adicionar `failed?: boolean` ao `MaterialPart` já existente em vez de criar um segundo tipo**

Reverter a criação do `interface MaterialPart` no Step 3 acima — em vez disso, editar `microservice/src/services/supabaseService.ts:100-105`:

```ts
export interface MaterialPart {
  ordem: number;
  titulo: string;
  arquivo_url: string | null;
  storage_path: string | null;
  failed?: boolean; // NOVO — aditivo, permite computeAggregatedApresentacaoEntry recomputar status sem reconstruir mensagens de erro de partes antigas
}
```

E em `materialsMerge.ts`, importar esse tipo em vez de redeclarar:

```ts
import type { MaterialPart } from "../services/supabaseService";
```

(Ajustar a assinatura de `computeAggregatedApresentacaoEntry` pra usar esse `MaterialPart` importado — `titulo` obrigatório ali, então o `novaParte` passado pelos call sites das Tasks 7-9 precisa sempre incluir `titulo`.)

- [ ] **Step 4: Rodar e confirmar que os 4 testes passam**

Run: `npx tsx --test src/lib/materialsMerge.test.ts`
Expected: PASS.

- [ ] **Step 5: `npx tsc --noEmit`**

Expected: sem erro (confirma que a importação cruzada de tipos entre `materialsMerge.ts` e `supabaseService.ts` não criou dependência circular — se criar, mover `MaterialPart` para um terceiro arquivo de tipos compartilhado é a correção, mas não deve ser necessário aqui pois `supabaseService.ts` não importa de `materialsMerge.ts`).

- [ ] **Step 6: Commit**

```bash
cd microservice
git add src/lib/materialsMerge.ts src/lib/materialsMerge.test.ts src/services/supabaseService.ts
git commit -m "feat: computeAggregatedApresentacaoEntry (fallback local, espelha o BrainHexPDF)"
```

---

### Task 6: microservice — `brainHexPdfClient.ts` (novos campos de request/response)

**Files:**
- Modify: `microservice/src/services/brainHexPdfClient.ts`
- Modify: `microservice/src/services/brainHexPdfClient.test.ts`

**Interfaces:**
- Consumes: `GenerationFence` (já existe, `supabaseService.ts:129-133`).
- Produces: `RenderAndUploadPresentationParams` ganha `personalizacaoId: number`, `fence: GenerationFence`, `versionMetadata: { engine: string; schema: string; design_system: string; media_pipeline_version: string }`, `ordem: number`, `totalPartes: number`, `titulo: string`. `RenderAndUploadPresentationResult` ganha `dbWritten: boolean`.

- [ ] **Step 1: Escrever o teste que falha**

```ts
// adicionar em microservice/src/services/brainHexPdfClient.test.ts
test("manda personalizacaoId/fence/versionMetadata/ordem/totalPartes no corpo e le dbWritten da resposta", async () => {
  await withEnv({ BRAINHEXPDF_API_URL: "http://localhost:3002" }, async () => {
    let capturedBody: any = null;
    const fetchImpl = (async (_url: any, init: any) => {
      capturedBody = JSON.parse(init.body);
      return {
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          url: "https://storage/x.html",
          storage_path: "a/b.html",
          bucket: "conteudo_aluno",
          slide_count: 8,
          dbWritten: true,
        }),
      } as any;
    }) as typeof fetch;

    const result = await renderAndUploadPresentationViaBrainHexPdf(
      {
        markdown: "## Aula\nConteudo",
        topic: "Aula 1",
        profile: "mastermind",
        bucket: "conteudo_aluno",
        presentationPath: "brainhex/mastermind/topico/apresentacao/material-1.html",
        personalizacaoId: 42,
        fence: { cicloId: "ciclo-1", sourceHash: "hash-abc", generationKey: "ciclo-1:hash-abc" },
        versionMetadata: { engine: "brainhexpdf-v1", schema: "v2", design_system: "v3", media_pipeline_version: "2026-08-16.1" },
        ordem: 1,
        totalPartes: 1,
        titulo: "Aula 1",
      },
      { fetchImpl },
    );

    assert.equal(result.dbWritten, true);
    assert.equal(capturedBody.personalizacaoId, 42);
    assert.equal(capturedBody.cicloId, "ciclo-1");
    assert.equal(capturedBody.sourceHash, "hash-abc");
    assert.equal(capturedBody.ordem, 1);
    assert.equal(capturedBody.totalPartes, 1);
    assert.deepEqual(capturedBody.presentationVersionMetadata, {
      engine: "brainhexpdf-v1", schema: "v2", design_system: "v3", media_pipeline_version: "2026-08-16.1",
    });
  });
});

test("dbWritten fica false quando a chamada falha por timeout/rede", async () => {
  await withEnv({ BRAINHEXPDF_API_URL: undefined }, async () => {
    const result = await renderAndUploadPresentationViaBrainHexPdf({
      markdown: "## Aula",
      topic: "Aula 1",
      profile: "mastermind",
      bucket: "conteudo_aluno",
      presentationPath: "x.html",
      personalizacaoId: 42,
      fence: { cicloId: "ciclo-1", sourceHash: "hash-abc", generationKey: "ciclo-1:hash-abc" },
      versionMetadata: { engine: "e", schema: "s", design_system: "d", media_pipeline_version: "m" },
      ordem: 1,
      totalPartes: 1,
      titulo: "Aula 1",
    });
    assert.equal(result.dbWritten, false);
  });
});
```

- [ ] **Step 2: Rodar e confirmar que falha**

Run: `npx tsx --test src/services/brainHexPdfClient.test.ts`
Expected: FAIL — tipo `RenderAndUploadPresentationParams` não aceita os campos novos (erro de TS) ou `result.dbWritten` é `undefined`.

- [ ] **Step 3: Atualizar `brainHexPdfClient.ts`**

```ts
// microservice/src/services/brainHexPdfClient.ts
import { createLogger } from "../lib/logger";
import type { BrainHexProfile } from "../constants/brainHex";
import type { GenerationFence } from "./supabaseService";

const log = createLogger({ ctx: "brainhexpdf-client" });

export interface PresentationRenderFailure {
  stage: "render" | "upload";
  error: string;
}

export interface RenderAndUploadPresentationResult {
  presentationUrl: string | null;
  failure: PresentationRenderFailure | null;
  dbWritten: boolean;
}

export interface PresentationVersionMetadata {
  engine: string;
  schema: string;
  design_system: string;
  media_pipeline_version: string;
}

export interface RenderAndUploadPresentationParams {
  markdown: string;
  topic: string;
  profile: BrainHexProfile;
  bucket: string;
  presentationPath: string;
  personalizacaoId: number;
  fence: GenerationFence;
  versionMetadata: PresentationVersionMetadata;
  ordem: number;
  totalPartes: number;
  titulo: string;
}

export interface BrainHexPdfClientDeps {
  fetchImpl?: typeof fetch;
}

function truncateError(message: string): string {
  return message.replace(/\s+/g, " ").trim().slice(0, 1200) || "brainhexpdf_error";
}

function resolveTimeoutMs(): number {
  return Number(process.env.BRAINHEXPDF_TIMEOUT_MS) || 120_000;
}

export async function renderAndUploadPresentationViaBrainHexPdf(
  params: RenderAndUploadPresentationParams,
  deps: BrainHexPdfClientDeps = {},
): Promise<RenderAndUploadPresentationResult> {
  const fetchImpl = deps.fetchImpl ?? fetch;
  const apiUrl = (process.env.BRAINHEXPDF_API_URL ?? "").trim();
  if (!apiUrl) {
    return {
      presentationUrl: null,
      failure: { stage: "render", error: "BRAINHEXPDF_API_URL nao configurado" },
      dbWritten: false,
    };
  }

  const apiSecret = (process.env.BRAINHEXPDF_API_SECRET ?? "").trim();
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), resolveTimeoutMs());

  try {
    const response = await fetchImpl(`${apiUrl.replace(/\/+$/, "")}/api/v1/render-and-store`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(apiSecret ? { "x-api-secret": apiSecret } : {}),
      },
      body: JSON.stringify({
        targetProfile: params.profile,
        topic: params.topic,
        sourceText: params.markdown,
        bucket: params.bucket,
        storagePath: params.presentationPath,
        personalizacaoId: params.personalizacaoId,
        cicloId: params.fence.cicloId,
        sourceHash: params.fence.sourceHash,
        presentationVersionMetadata: params.versionMetadata,
        ordem: params.ordem,
        totalPartes: params.totalPartes,
        titulo: params.titulo,
      }),
      signal: ac.signal,
    });

    const body: any = await response.json().catch(() => null);

    if (!response.ok || !body || body.success !== true) {
      const stage: "render" | "upload" = body?.stage === "upload" ? "upload" : "render";
      const errMsg = typeof body?.error === "string" ? body.error : `HTTP ${response.status}`;
      log.error("render-and-store falhou", { status: response.status, stage, error: errMsg });
      return {
        presentationUrl: null,
        failure: { stage, error: truncateError(errMsg) },
        dbWritten: body?.dbWritten === true,
      };
    }

    if (typeof body.url !== "string" || !body.url) {
      return {
        presentationUrl: null,
        failure: { stage: "upload", error: "resposta sem url publica" },
        dbWritten: body?.dbWritten === true,
      };
    }

    return { presentationUrl: body.url, failure: null, dbWritten: body?.dbWritten === true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.error("render-and-store erro de rede/timeout", { err: error });
    return { presentationUrl: null, failure: { stage: "upload", error: truncateError(message) }, dbWritten: false };
  } finally {
    clearTimeout(timer);
  }
}
```

- [ ] **Step 4: Atualizar os 2 testes existentes que chamam a função sem os campos novos (agora obrigatórios)**

Nos 3 testes já existentes em `brainHexPdfClient.test.ts` (linhas 22-97), adicionar aos objetos de params passados:

```ts
personalizacaoId: 42,
fence: { cicloId: "ciclo-1", sourceHash: "hash-abc", generationKey: "ciclo-1:hash-abc" },
versionMetadata: { engine: "e", schema: "s", design_system: "d", media_pipeline_version: "m" },
ordem: 1,
totalPartes: 1,
titulo: "Aula 1",
```

E ajustar as asserções que checam `result` pra incluir `dbWritten` onde fizer sentido (ex.: o teste de sucesso: `assert.equal(result.dbWritten, false)` já que o fake response desses testes antigos não inclui `dbWritten: true`).

- [ ] **Step 5: Rodar TODOS os testes do arquivo**

Run: `npx tsx --test src/services/brainHexPdfClient.test.ts`
Expected: PASS (5 passing).

- [ ] **Step 6: `npx tsc --noEmit`**

Expected: sem erro.

- [ ] **Step 7: Commit**

```bash
cd microservice
git add src/services/brainHexPdfClient.ts src/services/brainHexPdfClient.test.ts
git commit -m "feat: brainHexPdfClient manda fence/versionMetadata/ordem e le dbWritten"
```

---

### Task 7: microservice — `archiveToSupabase` para de gravar apresentação no caminho feliz

**Files:**
- Modify: `microservice/server.ts:118-280` (aprox., função `archiveToSupabase`)
- Test: arquivo de teste existente que cobre `archiveToSupabase` (localizar via `grep -n "archiveToSupabase" microservice/*.test.ts microservice/**/*.test.ts` antes de editar — se não existir teste dedicado, criar `microservice/server.test.ts` com os casos abaixo)

**Interfaces:**
- Consumes: `renderAndUploadPresentationViaBrainHexPdf` (Task 6), `computeAggregatedApresentacaoEntry`/`buildPresentationMaterialMetadata` (já existe).
- Produces: `archiveToSupabase` não inclui mais `apresentacao` em `updates` no caminho feliz; inclui só quando `dbWritten === false`.

- [ ] **Step 1: Localizar os testes existentes de `archiveToSupabase`**

Run: `cd microservice && grep -rln "archiveToSupabase" --include="*.test.ts" .`

Ler o(s) arquivo(s) encontrados antes de prosseguir — os testes existentes provavelmente fazem mock de `renderAndUploadPresentationViaBrainHexPdf` com o formato ANTIGO de retorno (sem `dbWritten`) e vão quebrar até este task terminar. Ajustá-los faz parte deste task (Step 5).

- [ ] **Step 2: Escrever o teste que falha — `dbWritten: true` não gera merge de apresentacao**

```ts
test("archiveToSupabase nao inclui apresentacao no merge quando o BrainHexPDF ja gravou (dbWritten:true)", async () => {
  const mergeMateriaisCalls: any[] = [];
  const fakeMergeMateriais = async (id: number, updates: any, fence: any) => {
    mergeMateriaisCalls.push({ id, updates, fence });
    return { materiais: updates, status: "processando_midias" };
  };
  const fakeRenderAndUpload = async () => ({
    presentationUrl: "https://storage/x.html",
    failure: null,
    dbWritten: true,
  });

  await archiveToSupabase(
    { /* ...params minimos existentes, ver assinatura atual de archiveToSupabase... */ },
    { mergeMateriais: fakeMergeMateriais, renderAndUpload: fakeRenderAndUpload },
  );

  assert.equal(mergeMateriaisCalls.length, 1);
  assert.equal("apresentacao" in mergeMateriaisCalls[0].updates, false);
});

test("archiveToSupabase inclui apresentacao com fallback quando dbWritten:false", async () => {
  const mergeMateriaisCalls: any[] = [];
  const fakeMergeMateriais = async (id: number, updates: any, fence: any) => {
    mergeMateriaisCalls.push({ id, updates, fence });
    return { materiais: updates, status: "processando_midias" };
  };
  const fakeRenderAndUpload = async () => ({
    presentationUrl: null,
    failure: { stage: "upload" as const, error: "timeout" },
    dbWritten: false,
  });

  await archiveToSupabase(
    { /* ...params minimos existentes... */ },
    { mergeMateriais: fakeMergeMateriais, renderAndUpload: fakeRenderAndUpload },
  );

  assert.equal(mergeMateriaisCalls.length, 1);
  assert.equal(mergeMateriaisCalls[0].updates.apresentacao.metadata.status, "failed");
});
```

(Preencher `params minimos` com os mesmos valores que os testes existentes de `archiveToSupabase` já usam — copiar do arquivo localizado no Step 1.)

- [ ] **Step 3: Rodar e confirmar que falha**

Run: `npx tsx --test <arquivo-de-teste-do-step-1>`
Expected: FAIL — `archiveToSupabase` hoje sempre inclui `apresentacao` em `updates`.

- [ ] **Step 4: Editar `archiveToSupabase` (`server.ts:187-269`)**

Antes (trecho a remover do objeto `updates`):

```ts
apresentacao: {
  payload:      apresentacaoPayloadObj,
  metadata: buildPresentationMaterialMetadata({
    generationKey: fence.generationKey,
    presentationUrl,
    bucket,
    failure: presentationResult.failure,
  }),
  arquivo_url:  presentationUrl,
  storage_path: presentationUrl ? presentationPath : null,
  ...(presentationUrl ? { bucket, mime_type: "text/html; charset=utf-8" } : {}),
},
```

Depois:

```ts
...(presentationResult.dbWritten
  ? {}
  : {
      apresentacao: {
        payload: apresentacaoPayloadObj,
        metadata: buildPresentationMaterialMetadata({
          generationKey: fence.generationKey,
          presentationUrl,
          bucket,
          failure: presentationResult.failure,
        }),
        arquivo_url: presentationUrl,
        storage_path: presentationUrl ? presentationPath : null,
        ...(presentationUrl ? { bucket, mime_type: "text/html; charset=utf-8" } : {}),
      },
    }),
```

(O objeto `updates` no TS aceita spread condicional assim — `{ audio: {...}, markdown: {...}, ...(condicao ? {} : {apresentacao: {...}}) }`.)

Também atualizar a chamada de `renderAndUploadPresentationViaBrainHexPdf` (linha ~197) pra passar os campos novos:

```ts
const presentationResult = await renderAndUploadPresentationViaBrainHexPdf({
  markdown,
  topic: presentationTopic,
  profile,
  bucket,
  presentationPath,
  personalizacaoId: personalizacaoId as number, // já dentro do if (personalizacaoId !== null) mais abaixo — mover a checagem null pra antes desta chamada, ou passar 0 e nao usar hasFence quando for o caso "sem personalizacaoId" (ver Step 4.1)
  fence: fence as GenerationFence,
  versionMetadata: {
    engine: PRESENTATION_ENGINE_VERSION,
    schema: PRESENTATION_SCHEMA_VERSION,
    design_system: PRESENTATION_DESIGN_VERSION,
    media_pipeline_version: MEDIA_PIPELINE_VERSION,
  },
  ordem: 1,
  totalPartes: 1,
  titulo: presentationTopic,
});
```

- [ ] **Step 4.1: Resolver a ordem de checagem de `personalizacaoId`/`fence`**

Olhando `server.ts:118-220`, a chamada a `renderAndUploadPresentationViaBrainHexPdf` (linha 197) acontece ANTES do `if (personalizacaoId !== null)` (linha 215) que valida `fence`. Mover o bloco:

```ts
if (personalizacaoId !== null) {
  if (!fence) {
    throw new Error("generation fence ausente para persistir personalizacao");
  }
```

pra ANTES da chamada de `renderAndUploadPresentationViaBrainHexPdf` (ou duplicar só a checagem `if (personalizacaoId !== null && !fence) throw ...` mais cedo) — sem isso não dá pra montar `fence: fence as GenerationFence` com segurança de tipo. Quando `personalizacaoId === null` (chamada sem persistência, ex.: preview), passar `personalizacaoId: 0` e o BrainHexPDF vai tratar como uma fence "vazia" — mas como o corpo da requisição SEMPRE inclui `cicloId`/`sourceHash` vindos de `fence`, e `fence` só existe quando `personalizacaoId !== null`, a chamada nesse caso não deve nem tentar montar esses campos. Resolver assim: extrair a chamada a `renderAndUploadPresentationViaBrainHexPdf` pra DEPOIS da checagem de `personalizacaoId`/`fence`, com dois caminhos —

```ts
let presentationResult: RenderAndUploadPresentationResult;
if (personalizacaoId !== null) {
  if (!fence) {
    throw new Error("generation fence ausente para persistir personalizacao");
  }
  presentationResult = await renderAndUploadPresentationViaBrainHexPdf({
    markdown, topic: presentationTopic, profile, bucket, presentationPath,
    personalizacaoId, fence,
    versionMetadata: {
      engine: PRESENTATION_ENGINE_VERSION,
      schema: PRESENTATION_SCHEMA_VERSION,
      design_system: PRESENTATION_DESIGN_VERSION,
      media_pipeline_version: MEDIA_PIPELINE_VERSION,
    },
    ordem: 1,
    totalPartes: 1,
    titulo: presentationTopic,
  });
} else {
  // Sem personalizacaoId: BrainHexPDF nao tem pra onde gravar, so gera e devolve a URL.
  presentationResult = {
    presentationUrl: null,
    failure: { stage: "render", error: "personalizacaoId ausente - modo preview nao suporta persistencia" },
    dbWritten: false,
  };
}
```

Isso muda o comportamento do modo "sem personalizacaoId" (hoje ele CHAMA o BrainHexPDF mesmo sem persistir nada depois) — se esse modo for usado de verdade em produção (verificar via `grep -rn "archiveToSupabase" microservice/server.ts` por quem chama com `personalizacaoId: null`), ajustar pra continuar chamando `renderAndUploadPresentationViaBrainHexPdf` normalmente nesse caso, só que com `personalizacaoId: 0`/`fence` fake e ignorando o resultado depois — a `if (personalizacaoId !== null)` mais abaixo (linha 215) já não persiste nada nesse caso de qualquer forma, então o extra do BrainHexPDF tentar gravar com uma fence fake é inofensivo (vai falhar o `SELECT` e virar `dbWritten: true` sem escrever nada, ou falhar a RPC com `p_id: 0` inexistente — checar qual comportamento a RPC tem pra id inexistente antes de decidir; se lançar erro, prefira o caminho acima que nem tenta chamar).

- [ ] **Step 5: Atualizar os testes existentes localizados no Step 1 que quebraram**

Ajustar os mocks de `renderAndUpload`/similar pra incluir `dbWritten` no retorno (default `false`, que é o comportamento anterior — apresentacao continua sendo montada pelo microservice, preservando os testes antigos sem mudança de asserção).

- [ ] **Step 6: Rodar TODOS os testes do arquivo**

Run: `npx tsx --test <arquivo-de-teste-do-step-1>`
Expected: PASS (todos, incluindo os 2 novos do Step 2).

- [ ] **Step 7: `npx tsc --noEmit` no microservice inteiro**

Expected: sem erro.

- [ ] **Step 8: Commit**

```bash
cd microservice
git add server.ts <arquivo-de-teste-ajustado>
git commit -m "feat: archiveToSupabase para de gravar apresentacao quando o BrainHexPDF ja gravou"
```

---

### Task 8: microservice — `archiveMultiPartToSupabase` (loop de partes)

**Files:**
- Modify: `microservice/server.ts:309-500` (aprox., função `archiveMultiPartToSupabase`)
- Test: mesmo arquivo localizado na Task 7 (ou equivalente pra multi-parte)

**Interfaces:**
- Consumes: `renderAndUploadPresentationViaBrainHexPdf` (Task 6), `computeAggregatedApresentacaoEntry` (Task 5).
- Produces: dentro do loop, cada chamada manda `ordem: part.ordem, totalPartes: parts.length`; a montagem de `presentationParts`/`apresentacao` em `updates` só acontece pro fallback (quando alguma parte teve `dbWritten === false`).

- [ ] **Step 1: Escrever o teste que falha**

```ts
test("archiveMultiPartToSupabase nao monta apresentacao quando todas as partes gravaram (dbWritten:true)", async () => {
  const mergeMateriaisCalls: any[] = [];
  const fakeMergeMateriais = async (id: number, updates: any, fence: any) => {
    mergeMateriaisCalls.push({ id, updates, fence });
    return { materiais: updates, status: "processando_midias" };
  };
  let call = 0;
  const fakeRenderAndUpload = async (params: any) => {
    call += 1;
    return { presentationUrl: `https://storage/p${params.ordem}.html`, failure: null, dbWritten: true };
  };

  await archiveMultiPartToSupabase(
    { /* ...params minimos com 2 partes... */ },
    { mergeMateriais: fakeMergeMateriais, renderAndUpload: fakeRenderAndUpload },
  );

  assert.equal(call, 2);
  assert.equal(mergeMateriaisCalls.length, 1);
  assert.equal("apresentacao" in mergeMateriaisCalls[0].updates, false);
});

test("archiveMultiPartToSupabase grava fallback so pra apresentacao quando 1 parte falha o transporte", async () => {
  const mergeMateriaisCalls: any[] = [];
  const fakeMergeMateriais = async (id: number, updates: any, fence: any) => {
    mergeMateriaisCalls.push({ id, updates, fence });
    return { materiais: updates, status: "processando_midias" };
  };
  const fakeRenderAndUpload = async (params: any) => {
    if (params.ordem === 2) {
      return { presentationUrl: null, failure: { stage: "upload" as const, error: "timeout" }, dbWritten: false };
    }
    return { presentationUrl: `https://storage/p${params.ordem}.html`, failure: null, dbWritten: true };
  };

  await archiveMultiPartToSupabase(
    { /* ...params minimos com 2 partes... */ },
    { mergeMateriais: fakeMergeMateriais, renderAndUpload: fakeRenderAndUpload },
  );

  assert.equal(mergeMateriaisCalls.length, 1);
  const apresentacao = mergeMateriaisCalls[0].updates.apresentacao;
  assert.equal(apresentacao.partes.length, 2);
  assert.equal(apresentacao.partes[1].failed, true);
  assert.equal(apresentacao.metadata.status, "failed");
});
```

(Preencher `params minimos` copiando a assinatura real de `archiveMultiPartToSupabase` do `server.ts:309`.)

- [ ] **Step 2: Rodar e confirmar que falha**

Expected: FAIL.

- [ ] **Step 3: Editar `archiveMultiPartToSupabase` (`server.ts:379-403` o loop, `server.ts:455-473` a montagem de `updates.apresentacao`)**

No loop (`server.ts:379-403`), passar os campos novos e parar de empilhar incondicionalmente em `presentationParts` — só empilhar quando `dbWritten === false` em ALGUMA parte (rastrear com uma flag):

```ts
let anyPresentationFallbackNeeded = false;
const fallbackPresentationParts: MaterialPart[] = [];

for (const part of parts) {
  // ...audio/markdown do loop, sem mudanca...

  const presentationPath = `${storagePath}/apresentacao/material-${refId}${suffix}.html`;
  const presentationResult = await renderAndUploadPresentationViaBrainHexPdf({
    markdown: part.markdown,
    topic: part.titulo,
    profile,
    bucket,
    presentationPath,
    personalizacaoId: personalizacaoId as number,
    fence: fence as GenerationFence,
    versionMetadata: {
      engine: PRESENTATION_ENGINE_VERSION,
      schema: PRESENTATION_SCHEMA_VERSION,
      design_system: PRESENTATION_DESIGN_VERSION,
      media_pipeline_version: MEDIA_PIPELINE_VERSION,
    },
    ordem: part.ordem,
    totalPartes: parts.length,
    titulo: part.titulo,
  });
  if (!presentationResult.dbWritten) {
    anyPresentationFallbackNeeded = true;
  }
  if (presentationResult.failure) {
    lg.error("falha na apresentacao", {
      stage: presentationResult.failure.stage,
      error: presentationResult.failure.error,
      parte: part.ordem,
    });
  } else {
    lg.info("apresentacao upload", { status: "ok", parte: part.ordem });
  }
  fallbackPresentationParts.push({
    ordem: part.ordem,
    titulo: part.titulo,
    arquivo_url: presentationResult.presentationUrl,
    storage_path: presentationResult.presentationUrl ? presentationPath : null,
    failed: presentationResult.presentationUrl === null,
  });
}
```

(Nota: a checagem de `personalizacaoId !== null`/`fence` precisa acontecer ANTES do loop — mover a validação existente linha 410-413 pra cima do loop, mesma razão da Task 7 Step 4.1. Se `personalizacaoId === null`, este loop de apresentação não deveria nem chamar o BrainHexPDF com fence — replicar a mesma solução de "modo preview" da Task 7 se esse caminho for exercitado de verdade; senão, `archiveMultiPartToSupabase` provavelmente só é chamado com `personalizacaoId !== null` sempre — confirmar com `grep -n "archiveMultiPartToSupabase(" microservice/server.ts` antes de decidir.)

Na montagem de `updates` (`server.ts:424-474`), substituir a chave `apresentacao` fixa por uma condicional:

```ts
const updates: Record<string, MaterialEntry> = {
  audio: { /* ...sem mudanca... */ },
  markdown: { /* ...sem mudanca... */ },
  ...(anyPresentationFallbackNeeded
    ? {
        apresentacao: (() => {
          let aggregated = { partes: [] as MaterialPart[], status: "pending", headline: { arquivo_url: null as string | null, storage_path: null as string | null } };
          for (const p of fallbackPresentationParts) {
            aggregated = computeAggregatedApresentacaoEntry(aggregated.partes, p, parts.length, aggregated.status);
          }
          const anyFailed = aggregated.partes.some((p) => p.failed);
          return {
            payload: { slides: [] as never[], tema_visual: presentationTheme },
            metadata: buildPresentationMaterialMetadata({
              generationKey: fence!.generationKey,
              presentationUrl: aggregated.headline.arquivo_url,
              bucket,
              failure: anyFailed ? { stage: "upload", error: "uma ou mais partes falharam" } : null,
            }),
            arquivo_url: aggregated.headline.arquivo_url,
            storage_path: aggregated.headline.storage_path,
            ...(aggregated.headline.arquivo_url ? { bucket, mime_type: "text/html; charset=utf-8" } : {}),
            partes: aggregated.partes,
          };
        })(),
      }
    : {}),
};
```

Importar `computeAggregatedApresentacaoEntry` de `./src/lib/materialsMerge` no topo do arquivo.

- [ ] **Step 4: Rodar os testes**

Expected: PASS (os 2 novos + os já existentes ajustados, mesmo padrão da Task 7 Step 5).

- [ ] **Step 5: `npx tsc --noEmit`**

Expected: sem erro.

- [ ] **Step 6: Commit**

```bash
cd microservice
git add server.ts <arquivo-de-teste>
git commit -m "feat: archiveMultiPartToSupabase manda ordem/totalPartes e so grava fallback quando necessario"
```

---

### Task 9: microservice — `retryApresentacaoOnly`

**Files:**
- Modify: `microservice/server.ts:660-735`
- Test: mesmo arquivo das Tasks 7-8

**Interfaces:**
- Consumes: `renderAndUploadPresentationViaBrainHexPdf` (Task 6), `computeAggregatedApresentacaoEntry` (Task 5).
- Produces: mesma mudança de comportamento da Task 8, aplicada a esta função (ela já reusa a mesma estrutura de loop).

- [ ] **Step 1: Escrever o teste que falha**

```ts
test("retryApresentacaoOnly nao chama mergeMateriais quando todas as partes gravaram via BrainHexPDF", async () => {
  const mergeMateriaisCalls: any[] = [];
  const fakeMergeMateriais = async (id: number, updates: any, fence: any) => {
    mergeMateriaisCalls.push({ id, updates, fence });
    return { materiais: updates, status: "pronto" };
  };
  const fakeRenderAndUpload = async (params: any) => ({
    presentationUrl: `https://storage/p${params.ordem}.html`,
    failure: null,
    dbWritten: true,
  });

  const result = await retryApresentacaoOnly(
    {
      profile: "mastermind",
      storagePath: "brainhex/mastermind/122",
      bucket: "conteudo_aluno",
      refId: "abc123",
      parts: [{ ordem: 1, titulo: "Aula 1", markdown: "## Aula\nConteudo" }],
      presentationTheme: {} as any,
      personalizacaoId: 42,
      fence: { cicloId: "ciclo-1", sourceHash: "hash-abc", generationKey: "ciclo-1:hash-abc" },
    },
    { renderAndUpload: fakeRenderAndUpload, mergeMateriais: fakeMergeMateriais },
  );

  assert.equal(result.presentationUrl, "https://storage/p1.html");
  assert.equal(mergeMateriaisCalls.length, 0);
});
```

Nota: isso muda a assinatura de retorno de `retryApresentacaoOnly` — hoje sempre chama `mergeMateriais` e retorna `persisted` (o resultado da RPC). Quando `dbWritten: true` em todas as partes, não há RPC pra chamar do lado do microservice, então `persisted` fica `null`. Ajustar o teste e o tipo de retorno:

```ts
assert.equal(result.persisted, null);
```

- [ ] **Step 2: Rodar e confirmar que falha**

Expected: FAIL.

- [ ] **Step 3: Editar `retryApresentacaoOnly`**

```ts
export async function retryApresentacaoOnly(
  params: {
    profile: BrainHexProfile;
    storagePath: string;
    bucket: string;
    refId: string;
    parts: Array<{ ordem: number; titulo: string; markdown: string }>;
    presentationTheme: PresentationDesignPlan;
    personalizacaoId: number;
    fence: GenerationFence;
    log?: Logger;
  },
  deps: {
    renderAndUpload?: typeof renderAndUploadPresentationViaBrainHexPdf;
    mergeMateriais?: typeof mergePersonalizacaoMateriais;
  } = {},
): Promise<{ presentationUrl: string | null; persisted: PersistedMaterialsMerge | null }> {
  const { profile, storagePath, bucket, refId, parts, presentationTheme, personalizacaoId, fence } = params;
  const lg = params.log ?? log;
  const renderAndUpload = deps.renderAndUpload ?? renderAndUploadPresentationViaBrainHexPdf;
  const mergeMateriais = deps.mergeMateriais ?? mergePersonalizacaoMateriais;
  const multiPart = parts.length > 1;

  const fallbackPresentationParts: MaterialPart[] = [];
  let anyPresentationFallbackNeeded = false;

  for (const part of parts) {
    const suffix = multiPart ? `-parte-${String(part.ordem).padStart(2, "0")}` : "";
    const presentationPath = `${storagePath}/apresentacao/material-${refId}${suffix}.html`;
    const presentationResult = await renderAndUpload({
      markdown: part.markdown,
      topic: part.titulo,
      profile,
      bucket,
      presentationPath,
      personalizacaoId,
      fence,
      versionMetadata: {
        engine: PRESENTATION_ENGINE_VERSION,
        schema: PRESENTATION_SCHEMA_VERSION,
        design_system: PRESENTATION_DESIGN_VERSION,
        media_pipeline_version: MEDIA_PIPELINE_VERSION,
      },
      ordem: part.ordem,
      totalPartes: parts.length,
      titulo: part.titulo,
    });
    if (!presentationResult.dbWritten) {
      anyPresentationFallbackNeeded = true;
    }
    if (presentationResult.failure) {
      lg.error("falha na apresentacao (retry apresentacao-only)", {
        stage: presentationResult.failure.stage,
        error: presentationResult.failure.error,
        parte: part.ordem,
      });
    } else {
      lg.info("apresentacao upload (retry apresentacao-only)", { status: "ok", parte: part.ordem });
    }
    fallbackPresentationParts.push({
      ordem: part.ordem,
      titulo: part.titulo,
      arquivo_url: presentationResult.presentationUrl,
      storage_path: presentationResult.presentationUrl ? presentationPath : null,
      failed: presentationResult.presentationUrl === null,
    });
  }

  const presentationUrl = fallbackPresentationParts[0]?.arquivo_url ?? null;

  if (!anyPresentationFallbackNeeded) {
    return { presentationUrl, persisted: null };
  }

  let aggregated = { partes: [] as MaterialPart[], status: "pending", headline: { arquivo_url: null as string | null, storage_path: null as string | null } };
  for (const p of fallbackPresentationParts) {
    aggregated = computeAggregatedApresentacaoEntry(aggregated.partes, p, parts.length, aggregated.status);
  }
  const anyFailed = aggregated.partes.some((p) => p.failed);

  const updates: Record<string, MaterialEntry> = {
    apresentacao: {
      payload: { slides: [] as never[], tema_visual: presentationTheme },
      metadata: buildPresentationMaterialMetadata({
        generationKey: fence.generationKey,
        presentationUrl: aggregated.headline.arquivo_url,
        bucket,
        failure: anyFailed ? { stage: "upload", error: "uma ou mais partes falharam" } : null,
      }),
      arquivo_url: aggregated.headline.arquivo_url,
      storage_path: aggregated.headline.storage_path,
      ...(aggregated.headline.arquivo_url ? { bucket, mime_type: "text/html; charset=utf-8" } : {}),
      partes: aggregated.partes,
    },
  };

  const persisted = await mergeMateriais(personalizacaoId, updates, fence);
  return { presentationUrl, persisted };
}
```

- [ ] **Step 4: Ajustar os testes existentes de `retryApresentacaoOnly` (se houver) pra incluir `dbWritten` nos fakes de `renderAndUpload`**

Mesma lógica das Tasks 7-8 Step 5 — fakes antigos sem `dbWritten` devem usar `dbWritten: false` (preserva o comportamento anterior nesses testes, já que o microservice continua gravando).

- [ ] **Step 5: Rodar os testes**

Expected: PASS.

- [ ] **Step 6: `npx tsc --noEmit` e suíte completa do microservice**

Run: `npx tsc --noEmit && npm test`
Expected: sem erro, todos os testes passando.

- [ ] **Step 7: Commit**

```bash
cd microservice
git add server.ts <arquivo-de-teste>
git commit -m "feat: retryApresentacaoOnly nao chama mergeMateriais quando o BrainHexPDF ja gravou todas as partes"
```

---

## Verificação final (rodar antes de abrir os PRs)

```bash
# BrainHexPDF
cd ../BrainHexPDF && npm test && npx tsc --noEmit && npm run build

# microservice
cd ../TrailUp/microservice && npm test && npx tsc --noEmit
```

Dois PRs separados (repositórios diferentes):
1. `../BrainHexPDF`: Tasks 1-4.
2. `TrailUp` (`microservice/`): Tasks 5-9 — **depende do PR do BrainHexPDF já mergeado e deployado** (o microservice manda campos novos que o BrainHexPDF antigo simplesmente ignora — retrocompatível mandar antes de deployar o BrainHexPDF novo — mas o `dbWritten` só vem `true` depois do deploy do BrainHexPDF; até lá, o microservice sempre cai no fallback, que é o comportamento ATUAL, então a ordem de deploy é segura em qualquer direção).
