# Testabilidade do Pipeline de Upload no Microservice — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tornar `uploadBuffer` (e por transitividade
`archiveMultiPartToSupabase`/`archiveToSupabase`/`renderAndUploadPresentation`)
testável via um único ponto de injeção em `getClient()`, sem exigir
credenciais Supabase reais nem mockar o módulo `@supabase/supabase-js`
inteiro.

**Architecture:** Um override de módulo testável em `supabaseService.ts`
(`setSupabaseClientForTesting`), exportar as 2 funções de arquivamento em
`server.ts` (hoje não-exportadas), e 2 arquivos de teste novos usando um
client Supabase fake em memória.

**Tech Stack:** TypeScript, `node:test` nativo (via `tsx`), sem framework de
teste externo.

---

### Task 1: Ponto de injeção em `getClient()`

**Files:**
- Modify: `microservice/src/services/supabaseService.ts:1-15`
- Test: `microservice/src/services/supabaseService.test.ts`

- [ ] **Step 1: Escrever o teste que falha**

Adicionar ao topo de `microservice/src/services/supabaseService.test.ts`,
antes do primeiro `test(...)` existente, um helper de fixture reutilizável e
um teste novo:

```ts
import { setSupabaseClientForTesting, uploadBuffer } from "./supabaseService";

type FakeUploadCall = {
  bucket: string;
  path: string;
  data: Buffer;
  contentType: string;
  upsert: boolean;
};

function createFakeSupabaseClient(options?: {
  uploadError?: { message: string } | null;
  publicUrl?: string;
}) {
  const calls: FakeUploadCall[] = [];
  const client = {
    storage: {
      from(bucket: string) {
        return {
          upload: async (
            path: string,
            data: Buffer,
            opts: { contentType: string; upsert: boolean },
          ) => {
            calls.push({
              bucket,
              path,
              data,
              contentType: opts.contentType,
              upsert: opts.upsert,
            });
            return { error: options?.uploadError ?? null };
          },
          getPublicUrl: (path: string) => ({
            data: {
              publicUrl: options?.publicUrl ?? `https://fake.supabase/${bucket}/${path}`,
            },
          }),
        };
      },
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
  return { client, calls };
}

test("uploadBuffer usa o client injetado via setSupabaseClientForTesting, sem tocar process.env", async () => {
  const { client, calls } = createFakeSupabaseClient({
    publicUrl: "https://fake.supabase/meu-bucket/caminho/arquivo.mp3",
  });
  setSupabaseClientForTesting(client);
  try {
    const url = await uploadBuffer(
      "meu-bucket",
      "caminho/arquivo.mp3",
      Buffer.from("dados de audio"),
      "audio/mpeg",
    );

    assert.equal(url, "https://fake.supabase/meu-bucket/caminho/arquivo.mp3");
    assert.equal(calls.length, 1);
    assert.equal(calls[0].bucket, "meu-bucket");
    assert.equal(calls[0].path, "caminho/arquivo.mp3");
    assert.equal(calls[0].contentType, "audio/mpeg");
    assert.equal(calls[0].upsert, true);
  } finally {
    setSupabaseClientForTesting(null);
  }
});

test("uploadBuffer lanca com o storagePath na mensagem quando o client retorna erro", async () => {
  const { client } = createFakeSupabaseClient({
    uploadError: { message: "bucket não encontrado" },
  });
  setSupabaseClientForTesting(client);
  try {
    await assert.rejects(
      uploadBuffer("meu-bucket", "caminho/quebrado.mp3", Buffer.from("x"), "audio/mpeg"),
      /caminho\/quebrado\.mp3.*bucket não encontrado/,
    );
  } finally {
    setSupabaseClientForTesting(null);
  }
});
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `cd microservice && npx tsx --test src/services/supabaseService.test.ts`
Expected: FALHA — `setSupabaseClientForTesting` ainda não existe (erro de
import/undefined), os testes pré-existentes do arquivo continuam passando.

- [ ] **Step 3: Adicionar o override em `supabaseService.ts`**

No topo de `microservice/src/services/supabaseService.ts`, trocar:

```ts
import { createClient } from "@supabase/supabase-js";
import { createKeyedQueue } from "../lib/serialQueue";
import { createLogger } from "../lib/logger";
import type { MaterialEntryLike } from "../lib/materialsMerge";

const log = createLogger({ ctx: "supabase" });

function getClient() {
  const url = process.env.SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!url || !key) {
    throw new Error("SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios");
  }
  return createClient(url, key);
}
```

por:

```ts
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createKeyedQueue } from "../lib/serialQueue";
import { createLogger } from "../lib/logger";
import type { MaterialEntryLike } from "../lib/materialsMerge";

const log = createLogger({ ctx: "supabase" });

let clientOverride: SupabaseClient | null = null;

/**
 * Escape hatch só para testes: injeta um client fake, ignorando process.env.
 * Chame com `null` para restaurar o comportamento normal (ler process.env).
 */
export function setSupabaseClientForTesting(client: SupabaseClient | null): void {
  clientOverride = client;
}

function getClient(): SupabaseClient {
  if (clientOverride) return clientOverride;
  const url = process.env.SUPABASE_URL ?? "";
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (!url || !key) {
    throw new Error("SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios");
  }
  return createClient(url, key);
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `cd microservice && npx tsx --test src/services/supabaseService.test.ts`
Expected: todos os testes (pré-existentes + os 2 novos) passam.

- [ ] **Step 5: Rodar `tsc --noEmit`**

Run: `cd microservice && npx tsc --noEmit`
Expected: sem erros — `SupabaseClient` já é exportado por
`@supabase/supabase-js` (dependência já instalada).

- [ ] **Step 6: Commit**

```bash
git add microservice/src/services/supabaseService.ts microservice/src/services/supabaseService.test.ts
git commit -m "feat(microservice): adiciona ponto de injecao testavel em getClient (supabaseService)"
```

---

### Task 2: Exportar as funções de arquivamento e testar o pipeline real

**Files:**
- Modify: `microservice/server.ts` (só visibilidade — adicionar `export` em 2 funções já existentes)
- Test: novo `microservice/server.archive.test.ts`

- [ ] **Step 1: Exportar `archiveToSupabase` e `archiveMultiPartToSupabase`**

Em `microservice/server.ts`, trocar as duas declarações:

```ts
async function archiveToSupabase(params: {
```
por:
```ts
export async function archiveToSupabase(params: {
```

e:
```ts
async function archiveMultiPartToSupabase(params: {
```
por:
```ts
export async function archiveMultiPartToSupabase(params: {
```

Nenhuma outra linha muda — é só adicionar a palavra-chave `export` nas duas
assinaturas.

- [ ] **Step 2: Escrever o novo arquivo de teste**

Criar `microservice/server.archive.test.ts` (raiz do `microservice/`, ao
lado de `server.ts` — mesmo diretório que os outros testes de `server.ts`
já usam, confirme olhando onde `server.test.ts` vive antes de escrever;
ajuste o caminho de import relativo conforme necessário):

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { archiveToSupabase, archiveMultiPartToSupabase } from "./server";
import { setSupabaseClientForTesting } from "./src/services/supabaseService";
import { BRAIN_HEX_CONFIG } from "./src/constants/brainHex";

type FakeUploadCall = { bucket: string; path: string; contentType: string };

function createFakeSupabaseClient(failingPaths: string[] = []) {
  const calls: FakeUploadCall[] = [];
  const client = {
    storage: {
      from(bucket: string) {
        return {
          upload: async (
            path: string,
            _data: Buffer,
            opts: { contentType: string },
          ) => {
            calls.push({ bucket, path, contentType: opts.contentType });
            if (failingPaths.includes(path)) {
              return { error: { message: "falha simulada de upload" } };
            }
            return { error: null };
          },
          getPublicUrl: (path: string) => ({
            data: { publicUrl: `https://fake.supabase/${bucket}/${path}` },
          }),
        };
      },
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
  return { client, calls };
}

const profile = "socializer" as const;
const presentationTheme = {
  accent: BRAIN_HEX_CONFIG.socializer.color,
} as any;

test("archiveToSupabase monta os 3 paths (audio/markdown/apresentacao) sem sufixo de parte", async () => {
  const { client, calls } = createFakeSupabaseClient();
  setSupabaseClientForTesting(client);
  try {
    const result = await archiveToSupabase({
      profile,
      storagePath: "brainhex/socializer/classe-1/topico-2",
      bucket: "conteudo_aluno",
      refId: "ref-abc",
      markdown: "# Título\n\nConteúdo",
      audioScript: "Mateo: oi\nZuri: oi",
      slides: [],
      presentationTheme,
      mp3Base64: Buffer.from("audio-fake").toString("base64"),
      wavBase64: null,
      personalizacaoId: null,
    });

    assert.equal(
      result.audioMp3Url,
      "https://fake.supabase/conteudo_aluno/brainhex/socializer/classe-1/topico-2/audio/material-ref-abc.mp3",
    );
    assert.equal(
      result.markdownUrl,
      "https://fake.supabase/conteudo_aluno/brainhex/socializer/classe-1/topico-2/markdown/material-ref-abc.md",
    );
    assert.ok(result.presentationUrl?.endsWith("/apresentacao/material-ref-abc.html"));

    const paths = calls.map((c) => c.path);
    assert.ok(paths.includes("brainhex/socializer/classe-1/topico-2/audio/material-ref-abc.mp3"));
    assert.ok(paths.includes("brainhex/socializer/classe-1/topico-2/markdown/material-ref-abc.md"));
    const audioCall = calls.find((c) => c.path.endsWith(".mp3"));
    assert.equal(audioCall?.contentType, "audio/mpeg");
  } finally {
    setSupabaseClientForTesting(null);
  }
});

test("archiveToSupabase usa wav/audio-wav quando so ha wavBase64 (sem mp3Base64)", async () => {
  const { client, calls } = createFakeSupabaseClient();
  setSupabaseClientForTesting(client);
  try {
    await archiveToSupabase({
      profile,
      storagePath: "brainhex/socializer/classe-1/topico-2",
      bucket: "conteudo_aluno",
      refId: "ref-wav",
      markdown: "# Título",
      audioScript: "roteiro",
      slides: [],
      presentationTheme,
      mp3Base64: null,
      wavBase64: Buffer.from("audio-fake").toString("base64"),
      personalizacaoId: null,
    });

    const audioCall = calls.find((c) => c.path.endsWith(".wav"));
    assert.ok(audioCall, "esperava um upload .wav");
    assert.equal(audioCall?.contentType, "audio/wav");
  } finally {
    setSupabaseClientForTesting(null);
  }
});

test("archiveMultiPartToSupabase usa sufixo -parte-NN (2 digitos) quando ha mais de 1 parte", async () => {
  const { client, calls } = createFakeSupabaseClient();
  setSupabaseClientForTesting(client);
  try {
    await archiveMultiPartToSupabase({
      profile,
      storagePath: "brainhex/socializer/classe-1/topico-2",
      bucket: "conteudo_aluno",
      refId: "ref-multi",
      parts: [
        { ordem: 1, titulo: "Parte 1", markdown: "md-1", audioScript: "audio-1", slides: [], mp3Base64: Buffer.from("a1").toString("base64"), wavBase64: null } as any,
        { ordem: 2, titulo: "Parte 2", markdown: "md-2", audioScript: "audio-2", slides: [], mp3Base64: Buffer.from("a2").toString("base64"), wavBase64: null } as any,
      ],
      presentationTheme,
      personalizacaoId: null,
    });

    const paths = calls.map((c) => c.path);
    assert.ok(paths.some((p) => p.endsWith("audio/material-ref-multi-parte-01.mp3")));
    assert.ok(paths.some((p) => p.endsWith("audio/material-ref-multi-parte-02.mp3")));
    assert.ok(paths.some((p) => p.endsWith("markdown/material-ref-multi-parte-01.md")));
  } finally {
    setSupabaseClientForTesting(null);
  }
});

test("archiveMultiPartToSupabase nao usa sufixo de parte quando ha so 1 parte", async () => {
  const { client, calls } = createFakeSupabaseClient();
  setSupabaseClientForTesting(client);
  try {
    await archiveMultiPartToSupabase({
      profile,
      storagePath: "brainhex/socializer/classe-1/topico-2",
      bucket: "conteudo_aluno",
      refId: "ref-single",
      parts: [
        { ordem: 1, titulo: "Única", markdown: "md-1", audioScript: "audio-1", slides: [], mp3Base64: Buffer.from("a1").toString("base64"), wavBase64: null } as any,
      ],
      presentationTheme,
      personalizacaoId: null,
    });

    const paths = calls.map((c) => c.path);
    assert.ok(paths.some((p) => p.endsWith("audio/material-ref-single.mp3")));
    assert.ok(!paths.some((p) => p.includes("-parte-")));
  } finally {
    setSupabaseClientForTesting(null);
  }
});

test("archiveMultiPartToSupabase: falha de upload numa parte nao impede as demais partes", async () => {
  const { client, calls } = createFakeSupabaseClient([
    "brainhex/socializer/classe-1/topico-2/audio/material-ref-fail-parte-01.mp3",
  ]);
  setSupabaseClientForTesting(client);
  try {
    const result = await archiveMultiPartToSupabase({
      profile,
      storagePath: "brainhex/socializer/classe-1/topico-2",
      bucket: "conteudo_aluno",
      refId: "ref-fail",
      parts: [
        { ordem: 1, titulo: "Parte 1", markdown: "md-1", audioScript: "audio-1", slides: [], mp3Base64: Buffer.from("a1").toString("base64"), wavBase64: null } as any,
        { ordem: 2, titulo: "Parte 2", markdown: "md-2", audioScript: "audio-2", slides: [], mp3Base64: Buffer.from("a2").toString("base64"), wavBase64: null } as any,
      ],
      presentationTheme,
      personalizacaoId: null,
    });

    // A parte 1 de audio falhou (uploadBuffer lanca e e capturado por-parte),
    // mas a parte 2 de audio e ambas as partes de markdown ainda foram tentadas.
    const paths = calls.map((c) => c.path);
    assert.ok(paths.some((p) => p.endsWith("audio/material-ref-fail-parte-02.mp3")));
    assert.ok(paths.some((p) => p.endsWith("markdown/material-ref-fail-parte-01.md")));
    assert.ok(paths.some((p) => p.endsWith("markdown/material-ref-fail-parte-02.md")));
    // audioMp3Url reflete a parte 1 (primeira), que falhou -> null.
    assert.equal(result.audioMp3Url, null);
  } finally {
    setSupabaseClientForTesting(null);
  }
});
```

Ajuste os campos exatos de `ContentPart`/`parts[].mp3Base64`/`wavBase64` se
o typecheck do Step 3 apontar divergência de tipo — o `as any` nos objetos
de `parts` é deliberado para não precisar replicar 100% da interface
`ContentPart` real no teste (mesma prática que testes existentes do
microservice já usam pra fixtures parciais).

- [ ] **Step 3: Rodar os testes e ajustar**

Run: `cd microservice && npx tsx --test server.archive.test.ts`
Expected: primeiro FALHA (import de funções ainda não exportadas, do Step 1
desta mesma task — se você seguiu a ordem do plano, o Step 1 já foi feito, então
deve passar direto; se algum path não bater exatamente com o código real de
`archiveMultiPartToSupabase`/`archiveToSupabase`, ajuste as asserções pra
refletir o path real, não o código de produção).

- [ ] **Step 4: Rodar `tsc --noEmit` e a suíte completa do microservice**

Run: `cd microservice && npx tsc --noEmit && npx tsx --test $(procure todos os *.test.ts em microservice/ e microservice/src/ recursivamente, ou rode arquivo por arquivo)`
Expected: sem erros de tipo; suíte completa passa, incluindo
`server.test.ts` (que continua mockando o job runner inteiro, sem overlap
com os testes novos) e os 2 arquivos de teste desta feature.

- [ ] **Step 5: Commit**

```bash
git add microservice/server.ts microservice/server.archive.test.ts
git commit -m "test(microservice): exporta archiveToSupabase/archiveMultiPartToSupabase e testa o pipeline real de upload"
```

---

### Task 3: Revisão final da branch

- [ ] **Step 1: Rodar a suíte completa do microservice uma última vez**

Run: `cd microservice && npx tsc --noEmit` e a suíte completa de testes.
Expected: tudo passa.

- [ ] **Step 2: Revisar o diff completo da branch contra `main`**

Run: `git diff main --stat` e `git log main..HEAD --oneline`
Expected: 3 commits (Tasks 1-2 + este plano/spec), tocando exatamente
`supabaseService.ts`, `supabaseService.test.ts`, `server.ts`,
`server.archive.test.ts`.
