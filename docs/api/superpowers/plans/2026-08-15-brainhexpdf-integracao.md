# Integração microservice → BrainHexPDF: Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `microservice/` (legado "ApiBrainHex") passa a gerar a apresentação via BrainHexPDF (`POST /api/v1/render-and-store`, repo externo `https://github.com/Geisbelly/BrainHexPDF`) em vez de gerar imagem/PDF localmente. Markdown e áudio continuam gerados localmente e são a entrada (`sourceText`) para o BrainHexPDF.

**Architecture:** Novo cliente HTTP `src/services/brainhexPdfClient.ts` isola a chamada (nunca lança, retorna `null` em falha). `runPipeline` chama esse cliente logo após gerar o markdown/áudio, e passa o resultado pra `archiveToSupabase`, que troca o bloco de geração de PDF por um registro direto do retorno do BrainHexPDF. Código morto de imagem/PDF (`generateSlideImage`, `pdfService.ts`, `slideEnricher.ts`) é removido.

**Tech Stack:** Node.js 22 + TypeScript (`tsx`), `node:test` + `node:assert/strict` (runner nativo, sem Jest), `fetch` global + `AbortController`.

**Spec:** `docs/api/superpowers/specs/2026-08-15-brainhexpdf-integracao-design.md`

## Global Constraints

- Cliente novo nunca lança exceção — sempre retorna `null` em qualquer falha (rede, timeout, 401, `success:false`, JSON inválido, resposta sem campos obrigatórios). Falha isolada não pode derrubar o job.
- `BRAINHEXPDF_URL` ausente → pula a chamada silenciosamente (warn único), não é erro fatal.
- Timeout duro configurável via `BRAINHEXPDF_TIMEOUT_MS` (default `120000`).
- Header de auth: `x-api-secret: BRAINHEXPDF_SHARED_SECRET` — só enviado se a env estiver setada.
- `mime_type` do material `apresentacao` passa a ser `"text/html; charset=utf-8"` (era `"application/pdf"`).
- Testes novos usam `node:test` + `node:assert/strict`, mesmo padrão de `src/lib/materialsMerge.test.ts`. Todo arquivo `.test.ts` novo precisa ser adicionado à lista explícita no script `test` do `package.json`.

---

## Task 1: `brainhexPdfClient.ts` — cliente HTTP pro BrainHexPDF

**Files:**
- Create: `microservice/src/services/brainhexPdfClient.ts`
- Test: `microservice/src/services/brainhexPdfClient.test.ts`
- Modify: `microservice/package.json` (script `test`)

**Interfaces:**
- Produces: `renderAndStore(params: RenderAndStoreParams): Promise<RenderAndStoreResult | null>`, onde:
  ```ts
  export interface RenderAndStoreResult {
    url: string;
    storagePath: string;
    bucket: string;
    slideCount: number;
  }
  export interface RenderAndStoreParams {
    profile: BrainHexProfile;
    sourceText: string;
    bucket: string;
    storagePath: string;
    classe?: string;
    log: Logger;
  }
  ```
  Usado por Task 2 (`runPipeline` em `server.ts`).

- [ ] **Step 1: Escrever os testes (falha esperada — módulo ainda não existe)**

Criar `microservice/src/services/brainhexPdfClient.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { renderAndStore } from "./brainhexPdfClient";

const noopLog = {
  debug() {},
  info() {},
  warn() {},
  error() {},
  child(): any { return noopLog; },
};

function withEnv(vars: Record<string, string | undefined>, fn: () => Promise<void>): Promise<void> {
  const prev: Record<string, string | undefined> = {};
  for (const k of Object.keys(vars)) {
    prev[k] = process.env[k];
    if (vars[k] === undefined) delete process.env[k];
    else process.env[k] = vars[k];
  }
  return fn().finally(() => {
    for (const k of Object.keys(prev)) {
      if (prev[k] === undefined) delete process.env[k];
      else process.env[k] = prev[k];
    }
  });
}

test("renderAndStore: BRAINHEXPDF_URL ausente -> null sem chamar fetch", async () => {
  await withEnv({ BRAINHEXPDF_URL: undefined }, async () => {
    let called = false;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => { called = true; throw new Error("não deveria chamar"); }) as any;
    try {
      const result = await renderAndStore({
        profile: "seeker" as any,
        sourceText: "# Título\nConteúdo",
        bucket: "conteudo_aluno",
        storagePath: "brainhex/seeker/classe-1/topico-1/apresentacao/material-1.html",
        log: noopLog as any,
      });
      assert.equal(result, null);
      assert.equal(called, false);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

test("renderAndStore: sucesso -> mapeia resposta pro shape esperado", async () => {
  await withEnv({ BRAINHEXPDF_URL: "http://brainhexpdf.local", BRAINHEXPDF_SHARED_SECRET: "s3gredo" }, async () => {
    const originalFetch = globalThis.fetch;
    let capturedHeaders: Record<string, string> | undefined;
    globalThis.fetch = (async (_url: string, init: any) => {
      capturedHeaders = init.headers;
      return {
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          url: "https://supabase.local/storage/v1/object/public/conteudo_aluno/x.html",
          storage_path: "brainhex/seeker/classe-1/topico-1/apresentacao/material-1.html",
          bucket: "conteudo_aluno",
          slide_count: 9,
        }),
      };
    }) as any;
    try {
      const result = await renderAndStore({
        profile: "seeker" as any,
        sourceText: "# Título\nConteúdo",
        bucket: "conteudo_aluno",
        storagePath: "brainhex/seeker/classe-1/topico-1/apresentacao/material-1.html",
        log: noopLog as any,
      });
      assert.deepEqual(result, {
        url: "https://supabase.local/storage/v1/object/public/conteudo_aluno/x.html",
        storagePath: "brainhex/seeker/classe-1/topico-1/apresentacao/material-1.html",
        bucket: "conteudo_aluno",
        slideCount: 9,
      });
      assert.equal(capturedHeaders?.["x-api-secret"], "s3gredo");
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

test("renderAndStore: success:false -> null", async () => {
  await withEnv({ BRAINHEXPDF_URL: "http://brainhexpdf.local" }, async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = (async () => ({
      ok: false,
      status: 401,
      json: async () => ({ success: false, stage: "validate", error: "auth obrigatória" }),
    })) as any;
    try {
      const result = await renderAndStore({
        profile: "seeker" as any,
        sourceText: "texto",
        bucket: "conteudo_aluno",
        storagePath: "path.html",
        log: noopLog as any,
      });
      assert.equal(result, null);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

test("renderAndStore: erro de rede/timeout -> null", async () => {
  await withEnv({ BRAINHEXPDF_URL: "http://brainhexpdf.local", BRAINHEXPDF_TIMEOUT_MS: "10" }, async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = ((_url: string, init: any) => new Promise((_resolve, reject) => {
      init.signal.addEventListener("abort", () => reject(new Error("aborted")));
    })) as any;
    try {
      const result = await renderAndStore({
        profile: "seeker" as any,
        sourceText: "texto",
        bucket: "conteudo_aluno",
        storagePath: "path.html",
        log: noopLog as any,
      });
      assert.equal(result, null);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
```

- [ ] **Step 2: Rodar os testes para confirmar falha**

Run: `cd microservice && node --import tsx --test src/services/brainhexPdfClient.test.ts`
Expected: FAIL — `Cannot find module './brainhexPdfClient'` (ou erro equivalente de import).

- [ ] **Step 3: Implementar `brainhexPdfClient.ts`**

```ts
// microservice/src/services/brainhexPdfClient.ts
//
// Cliente HTTP pro microservice externo BrainHexPDF
// (https://github.com/Geisbelly/BrainHexPDF), endpoint
// POST /api/v1/render-and-store. Gera a apresentação HTML interativa a
// partir do markdown já produzido pelo Gemini local (runPipeline) e sobe
// o arquivo no Supabase Storage com a service role key própria do
// BrainHexPDF — este cliente só registra o resultado, nunca faz upload.
//
// Nunca lança exceção: qualquer falha (rede, timeout, auth, resposta
// inválida) é logada e retorna null. Chamador trata como falha isolada,
// igual generateNaturalAudio hoje (ver server.ts:runPipeline).

import type { Logger } from "../lib/logger";
import type { BrainHexProfile } from "../constants/brainHex";

export interface RenderAndStoreResult {
  url:         string;
  storagePath: string;
  bucket:      string;
  slideCount:  number;
}

export interface RenderAndStoreParams {
  profile:     BrainHexProfile;
  sourceText:  string;
  bucket:      string;
  storagePath: string;
  classe?:     string;
  log:         Logger;
}

function getConfig() {
  return {
    baseUrl:   (process.env.BRAINHEXPDF_URL ?? "").trim().replace(/\/+$/, ""),
    secret:    (process.env.BRAINHEXPDF_SHARED_SECRET ?? "").trim(),
    timeoutMs: Number(process.env.BRAINHEXPDF_TIMEOUT_MS) || 120_000,
  };
}

export async function renderAndStore(params: RenderAndStoreParams): Promise<RenderAndStoreResult | null> {
  const { profile, sourceText, bucket, storagePath, classe, log } = params;
  const { baseUrl, secret, timeoutMs } = getConfig();

  if (!baseUrl) {
    log.warn("BRAINHEXPDF_URL não configurada — pulando geração de apresentação HTML");
    return null;
  }

  const ac    = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);

  try {
    const res = await fetch(`${baseUrl}/api/v1/render-and-store`, {
      method: "POST",
      signal: ac.signal,
      headers: {
        "content-type": "application/json",
        ...(secret ? { "x-api-secret": secret } : {}),
      },
      body: JSON.stringify({
        targetProfile: profile,
        sourceText,
        classe: classe ?? "Turma-Geral",
        bucket,
        storagePath,
      }),
    });

    const json: any = await res.json().catch(() => null);

    if (!res.ok || !json || json.success !== true) {
      log.error("brainhexPdfClient: render-and-store falhou", {
        status: res.status,
        stage:  json?.stage,
        error:  json?.error,
      });
      return null;
    }

    if (!json.url || !json.storage_path || !json.bucket) {
      log.error("brainhexPdfClient: resposta sem campos obrigatórios", { json });
      return null;
    }

    return {
      url:         json.url,
      storagePath: json.storage_path,
      bucket:      json.bucket,
      slideCount:  Number(json.slide_count) || 0,
    };
  } catch (err: any) {
    log.error("brainhexPdfClient: erro de rede/timeout", {
      err:      err?.message ?? String(err),
      aborted:  ac.signal.aborted,
    });
    return null;
  } finally {
    clearTimeout(timer);
  }
}
```

- [ ] **Step 4: Adicionar o arquivo de teste na lista do script `test`**

Editar `microservice/package.json`, campo `scripts.test` — acrescentar `src/services/brainhexPdfClient.test.ts` no fim da lista:

```json
"test": "node --import tsx --test src/lib/serialQueue.test.ts src/lib/textSanitize.test.ts src/lib/wav.test.ts src/lib/logger.test.ts src/lib/materialsMerge.test.ts src/lib/slideEnricher.test.ts src/lib/validators.test.ts src/lib/rateLimit.test.ts src/services/brainhexPdfClient.test.ts"
```

- [ ] **Step 5: Rodar os testes para confirmar que passam**

Run: `cd microservice && npm test`
Expected: PASS em todos, incluindo os 4 testes novos de `brainhexPdfClient.test.ts`.

- [ ] **Step 6: Type-check**

Run: `cd microservice && npm run lint`
Expected: sem erros (`tsc --noEmit`).

- [ ] **Step 7: Commit**

```bash
cd microservice
git add src/services/brainhexPdfClient.ts src/services/brainhexPdfClient.test.ts package.json
git commit -m "feat: cliente HTTP para BrainHexPDF render-and-store

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 2: Ligar `brainhexPdfClient` em `runPipeline` + `archiveToSupabase`

**Files:**
- Modify: `microservice/server.ts:77-187` (`archiveToSupabase`)
- Modify: `microservice/server.ts:248-299` (`runPipeline`)

**Interfaces:**
- Consumes: `renderAndStore(params: RenderAndStoreParams): Promise<RenderAndStoreResult | null>` (Task 1, importado de `./src/services/brainhexPdfClient`)
- Produces: `archiveToSupabase` com assinatura nova (parâmetro `slides` removido, parâmetro `apresentacao: RenderAndStoreResult | null` adicionado) — consumido só por `runPipeline` e pelo handler `/api/v1/archive` (linha ~495, ver Step 3 abaixo).

Não há teste automatizado prévio pra `archiveToSupabase`/`runPipeline` (funções internas de `server.ts`, sem export, dependem de rede/Supabase) — verificação é via `tsc --noEmit` + teste manual (Step 5), seguindo o padrão já existente no arquivo (nenhuma das duas tinha teste antes desta mudança).

- [ ] **Step 1: Importar o cliente novo**

Em `microservice/server.ts`, no bloco de imports (linha 21, onde hoje está `import { generateSlidesPDF } from "./src/services/pdfService";`), trocar por:

```ts
import { renderAndStore, type RenderAndStoreResult } from "./src/services/brainhexPdfClient";
```

- [ ] **Step 2: Trocar a assinatura e o corpo de `archiveToSupabase`**

Substituir o parâmetro `slides: any[]; // slides COM imagem_referencia` por:

```ts
  apresentacao:    RenderAndStoreResult | null;
```

Remover o bloco:

```ts
  // PDF dos slides (layout 2 painéis: imagem esquerda, conteúdo direita)
  const pdfPath = `${storagePath}/apresentacao/material-${refId}.pdf`;
  let pdfUrl: string | null = null;
  try {
    const pdfBytes = await generateSlidesPDF(slides, profile);
    pdfUrl         = await uploadBuffer(bucket, pdfPath, pdfBytes, "application/pdf");
    lg.info("pdf upload", { status: pdfUrl ? "ok" : "falhou" });
  } catch (e) {
    lg.error("falha ao gerar/enviar PDF", { err: e });
  }
```

Dentro do bloco `if (personalizacaoId !== null)`, trocar:

```ts
    const pdfStatus    = pdfUrl       ? "completed" : "failed";
```
```ts
    const pdfPayloadObj   = { slides, abertura: markdown.split("\n").find((l) => l.trim()) ?? "" };
```

por:

```ts
    const apresentacaoStatus = apresentacao ? "completed" : "failed";
```

(remove `pdfPayloadObj` — não é mais necessário, o payload novo é construído direto no objeto `apresentacao:` abaixo)

E trocar a entry `apresentacao` dentro de `updates`:

```ts
      apresentacao: {
        payload:      pdfPayloadObj,
        metadata:     { status: pdfStatus, media_kind: "apresentacao",   updated_at: now(), ...(pdfUrl ? { bucket } : {}) },
        arquivo_url:  pdfUrl,
        storage_path: pdfUrl ? pdfPath : null,
        ...(pdfUrl ? { bucket, mime_type: "application/pdf" } : {}),
      },
```

por:

```ts
      apresentacao: {
        payload:      apresentacao ? { url: apresentacao.url, slide_count: apresentacao.slideCount } : null,
        metadata:     { status: apresentacaoStatus, media_kind: "apresentacao", updated_at: now(), ...(apresentacao ? { bucket: apresentacao.bucket } : {}) },
        arquivo_url:  apresentacao?.url ?? null,
        storage_path: apresentacao?.storagePath ?? null,
        ...(apresentacao ? { bucket: apresentacao.bucket, mime_type: "text/html; charset=utf-8" } : {}),
      },
```

E o retorno da função (era `{ audioMp3Url, markdownUrl, pdfUrl }`) passa a ser:

```ts
  return { audioMp3Url, markdownUrl, apresentacaoUrl: apresentacao?.url ?? null };
```

(ajustar a assinatura de retorno declarada em `Promise<{ audioMp3Url: string | null; markdownUrl: string | null; pdfUrl: string | null }>` pra `Promise<{ audioMp3Url: string | null; markdownUrl: string | null; apresentacaoUrl: string | null }>`)

- [ ] **Step 3: Atualizar `runPipeline` — remover geração local de imagens, chamar `renderAndStore`**

Remover de `runPipeline`:

```ts
  // 4. Imagens dos slides
  const images           = await generateSlidesImages(resultado.slides);
  const slidesComImagens = enrichSlidesWithImages(resultado.slides, images);
```

Adicionar no lugar (antes do passo 5, "Persiste tudo no Supabase"):

```ts
  // 4. Apresentação HTML via BrainHexPDF (falha isolada — nunca lança)
  const htmlPath = `${storagePath}/apresentacao/material-${refId}.html`;
  const apresentacao = await renderAndStore({
    profile,
    sourceText: resultado.markdown,
    bucket,
    storagePath: htmlPath,
    log: jobLog,
  });
```

E trocar a chamada de `archiveToSupabase` (era `slides: slidesComImagens`) por `apresentacao`:

```ts
  // 5. Persiste tudo no Supabase
  await archiveToSupabase({
    profile,
    storagePath,
    bucket,
    refId,
    markdown:         resultado.markdown,
    audioScript:      resultado.audioScript,
    apresentacao,
    mp3Base64,
    wavBase64,
    personalizacaoId,
    log:              jobLog,
  });
```

- [ ] **Step 4: Remover a função `generateSlidesImages` (agora sem uso)**

Remover de `microservice/server.ts` (linhas ~57-71):

```ts
/** Gera até 6 imagens para os slides (com intervalo para respeitar rate-limit) */
async function generateSlidesImages(slides: any[]): Promise<string[]> {
  const images: string[] = [];
  const max = Math.min(slides.length, 6);
  for (let i = 0; i < max; i++) {
    try {
      if (i > 0) await new Promise((r) => setTimeout(r, 3000));
      images.push((await generateSlideImage(slides[i].imagePrompt)) ?? "");
    } catch (e) {
      log.error("imagem slide falhou", { slide: i, err: e });
      images.push("");
    }
  }
  return images;
}
```

Remover também o comentário órfão logo abaixo: `// enrichSlidesWithImages extraído para src/lib/slideEnricher.ts (testado).`

- [ ] **Step 5: Confirmar type-check e rodar servidor localmente**

Run: `cd microservice && npm run lint`
Expected: sem erros. Se `generateSlideImage` (import de `geminiService.ts` na linha 8) ficar sem uso após este task, o `tsc --noEmit` acusa `'generateSlideImage' is declared but its value is never read` — isso é esperado e resolvido na Task 3 (remoção da função em si).

Run manual (smoke test, opcional mas recomendado): `cd microservice && npm run dev`, depois `curl localhost:3000/api/health` — deve responder `200`.

- [ ] **Step 6: Commit**

```bash
cd microservice
git add server.ts
git commit -m "feat: runPipeline chama BrainHexPDF em vez de gerar imagem/PDF local

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 3: Remover código morto (imagem/PDF local)

**Files:**
- Modify: `microservice/server.ts` (import de `generateSlideImage`, linha ~8)
- Modify: `microservice/src/services/geminiService.ts` (remover `generateSlideImage`)
- Delete: `microservice/src/services/pdfService.ts`
- Delete: `microservice/src/lib/slideEnricher.ts`
- Delete: `microservice/src/lib/slideEnricher.test.ts`
- Modify: `microservice/package.json` (remover `slideEnricher.test.ts` do script `test`)

**Interfaces:**
- Consumes: nada de código produzido pelas Tasks 1/2 (esta task só remove).
- Produces: nada — remove `generateSlideImage`, `generateSlidesPDF`, `enrichSlidesWithImages` do código-fonte. Nenhum outro arquivo do repo os referencia após a Task 2 (confirmar no Step 1).

- [ ] **Step 1: Confirmar que não sobra nenhuma referência**

Run:
```bash
cd microservice
/usr/bin/grep -rn "generateSlideImage\|generateSlidesPDF\|enrichSlidesWithImages\|pdfService\|slideEnricher" server.ts src/ package.json
```

Expected: só aparecem as linhas que este task vai remover/editar nos próximos steps (a definição de `generateSlideImage` em `geminiService.ts`, o import em `server.ts`, os dois arquivos `pdfService.ts`/`slideEnricher.ts` e sua entrada no `package.json`). Se aparecer qualquer outro caller fora dessa lista, PARAR — a Task 2 não foi aplicada corretamente ou há um consumidor não mapeado neste plano.

- [ ] **Step 2: Remover import de `generateSlideImage` em `server.ts`**

Trocar:
```ts
import {
  processMediaWithGemini,
  generateNaturalAudio,
  generateSlideImage,
} from "./src/services/geminiService";
```
por:
```ts
import {
  processMediaWithGemini,
  generateNaturalAudio,
} from "./src/services/geminiService";
```

- [ ] **Step 3: Remover `generateSlideImage` de `geminiService.ts`**

Abrir `microservice/src/services/geminiService.ts`, localizar `export async function generateSlideImage(prompt: string, retries = 3): Promise<string> {` (linha ~399) e remover a função inteira (do `export async function generateSlideImage` até o `}` de fechamento correspondente).

- [ ] **Step 4: Deletar `pdfService.ts` e `slideEnricher.ts`/teste**

```bash
cd microservice
git rm src/services/pdfService.ts src/lib/slideEnricher.ts src/lib/slideEnricher.test.ts
```

- [ ] **Step 5: Remover `slideEnricher.test.ts` do script `test`**

Editar `microservice/package.json`, campo `scripts.test`:

```json
"test": "node --import tsx --test src/lib/serialQueue.test.ts src/lib/textSanitize.test.ts src/lib/wav.test.ts src/lib/logger.test.ts src/lib/materialsMerge.test.ts src/lib/validators.test.ts src/lib/rateLimit.test.ts src/services/brainhexPdfClient.test.ts"
```

(`src/lib/slideEnricher.test.ts` sai da lista; `src/services/brainhexPdfClient.test.ts`, adicionado na Task 1, permanece)

- [ ] **Step 6: Rodar suite completa + type-check**

Run: `cd microservice && npm test && npm run lint`
Expected: PASS em ambos, sem nenhuma referência quebrada.

- [ ] **Step 7: Commit**

```bash
cd microservice
git add server.ts src/services/geminiService.ts package.json
git commit -m "chore: remove geração local de imagem/PDF (substituída pelo BrainHexPDF)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 4: Env vars e documentação

**Files:**
- Modify: `microservice/.env.example`
- Modify: `microservice/README.md`

**Interfaces:**
- Consumes: nada (só documentação/config).
- Produces: nada — task final, sem consumidor.

- [ ] **Step 1: Adicionar as env vars novas em `.env.example`**

Em `microservice/.env.example`, na seção "Segurança (recomendado em produção)", adicionar depois de `API_SHARED_SECRET`:

```
# BrainHexPDF (https://github.com/Geisbelly/BrainHexPDF) — gera a
# apresentação HTML interativa a partir do markdown local. Sem
# BRAINHEXPDF_URL, o passo é pulado (materiais.apresentacao fica "failed").
# BRAINHEXPDF_URL=https://brainhexpdf.exemplo.com
# BRAINHEXPDF_SHARED_SECRET=          # deve bater com API_SHARED_SECRET do BrainHexPDF
# BRAINHEXPDF_TIMEOUT_MS=120000       # timeout duro da chamada (geração via Gemini pode demorar)
```

- [ ] **Step 2: Atualizar `README.md`**

Em `microservice/README.md`:

1. Seção "O que este servico faz" — trocar:
   ```
   - Gera markdown, audio e apresentacao com Gemini.
   ```
   por:
   ```
   - Gera markdown e audio com Gemini; dispara o BrainHexPDF (repo externo) para gerar a apresentacao HTML interativa.
   ```

2. Seção "Variaveis de ambiente" — acrescentar:
   ```
   - `BRAINHEXPDF_URL` (opcional — sem ela, materiais.apresentacao fica "failed")
   - `BRAINHEXPDF_SHARED_SECRET` (opcional)
   - `BRAINHEXPDF_TIMEOUT_MS` (opcional, default 120000)
   ```

3. Seção "Estrutura" — trocar:
   ```
   services/
     geminiService.ts      # texto/slides/áudio/imagens via Gemini
     pdfService.ts         # PDF 2-painéis dos slides (jsPDF)
     supabaseService.ts    # storage + merge defensivo + heartbeat + recovery
   ```
   por:
   ```
   services/
     geminiService.ts      # texto/slides/áudio via Gemini
     brainhexPdfClient.ts  # cliente HTTP do BrainHexPDF (apresentação HTML)
     supabaseService.ts    # storage + merge defensivo + heartbeat + recovery
   ```

- [ ] **Step 3: Commit**

```bash
cd microservice
git add .env.example README.md
git commit -m "docs: documenta env vars e arquitetura da integracao com BrainHexPDF

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```
