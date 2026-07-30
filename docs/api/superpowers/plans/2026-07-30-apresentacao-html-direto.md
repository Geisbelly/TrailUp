# Apresentação: entrega direta em HTML (substitui PDF/Puppeteer) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remover o Puppeteer/Chrome headless do pipeline de geração de apresentação no `microservice`, entregando o HTML que `slideTemplate.ts` já constrói diretamente como arquivo estático (`.html`), no lugar de rasterizá-lo em PDF.

**Architecture:** `slideTemplate.ts`/`buildDeckHtml()` não muda. `pdfService.ts` (100% código de Puppeteer) é deletado. `server.ts` troca a etapa "renderiza PDF + upload" por "monta HTML + upload", remove os 3 pontos que checavam prontidão do Chromium (`/api/health`, `/api/v1/archive`, `/api/personalizar`), e renomeia campos `pdf*` → `presentation*` nos trechos que essa mudança toca diretamente. `microservice/package.json`, `.puppeteerrc.cjs` e `Dockerfile` perdem a dependência do Puppeteer.

**Tech Stack:** Node.js/Express, TypeScript, `node:test` (test runner já usado no microservice).

**Spec:** `docs/api/superpowers/specs/2026-07-30-apresentacao-html-direto-design.md`

---

## Task 1: Bump das versões de contrato

**Files:**
- Modify: `microservice/src/constants/pipelineVersions.ts:9-10`
- Modify: `api/app/services/media_contract.py:9-10`

- [ ] **Step 1: Atualizar `microservice/src/constants/pipelineVersions.ts`**

Trocar:
```ts
export const MEDIA_PIPELINE_VERSION = "2026-07-28.19" as const;
export const PRESENTATION_ENGINE_VERSION = "puppeteer-html-v3" as const;
```
por:
```ts
export const MEDIA_PIPELINE_VERSION = "2026-07-30.1" as const;
export const PRESENTATION_ENGINE_VERSION = "html-direct-v1" as const;
```

- [ ] **Step 2: Atualizar `api/app/services/media_contract.py` (espelho Python)**

Trocar:
```python
MEDIA_PIPELINE_VERSION = "2026-07-28.19"
PRESENTATION_ENGINE_VERSION = "puppeteer-html-v3"
```
por:
```python
MEDIA_PIPELINE_VERSION = "2026-07-30.1"
PRESENTATION_ENGINE_VERSION = "html-direct-v1"
```

- [ ] **Step 3: Commit**

```bash
git add microservice/src/constants/pipelineVersions.ts api/app/services/media_contract.py
git commit -m "chore: bump presentation engine version para html-direct-v1"
```

---

## Task 2: `renderAndUploadPresentation` monta e sobe HTML em vez de PDF

**Files:**
- Modify: `microservice/server.ts:1-46` (imports)
- Modify: `microservice/server.ts:188-259` (`renderAndUploadPresentation` + `buildPresentationMaterialMetadata`)
- Modify: `microservice/src/server.test.ts:1-17` (imports)
- Modify: `microservice/src/server.test.ts:537-600` (describe "diagnostico da apresentacao")

- [ ] **Step 1: Escrever os testes que vão falhar (RED)**

Em `microservice/src/server.test.ts`, trocar o bloco `describe("diagnostico da apresentacao", ...)` (linhas 537-602, até o fechamento do `it` que termina em `assert.equal(metadata.error, ...)` mais o `});` de fechamento do describe) por:

```ts
describe("diagnostico da apresentacao", () => {
  it("classifica falha ao montar o HTML e nao tenta upload", async () => {
    let uploadCalls = 0;
    const result = await renderAndUploadPresentation({
      slides: [{ titulo: "Teste" }],
      profile: "seeker",
      bucket: "conteudo_aluno",
      presentationPath: "brainhex/seeker/apresentacao/teste.html",
      buildHtml: () => {
        throw new Error("slide invalido\ncom quebra de linha");
      },
      uploadHtml: async () => {
        uploadCalls += 1;
        return "https://example.test/nao-deveria-subir.html";
      },
    });

    assert.equal(result.presentationUrl, null);
    assert.deepEqual(result.failure, {
      stage: "render",
      error: "slide invalido com quebra de linha",
    });
    assert.equal(uploadCalls, 0);
  });

  it("classifica falha de upload separadamente", async () => {
    const result = await renderAndUploadPresentation({
      slides: [{ titulo: "Teste" }],
      profile: "seeker",
      bucket: "conteudo_aluno",
      presentationPath: "brainhex/seeker/apresentacao/teste.html",
      buildHtml: () => "<html></html>",
      uploadHtml: async () => {
        throw new Error("limite do bucket excedido");
      },
    });

    assert.equal(result.presentationUrl, null);
    assert.deepEqual(result.failure, {
      stage: "upload",
      error: "limite do bucket excedido",
    });
  });

  it("persiste engine e causa real sem anunciar URL legada", () => {
    const metadata = buildPresentationMaterialMetadata({
      generationKey: "ciclo-1:hash-a",
      presentationUrl: null,
      bucket: "conteudo_aluno",
      failure: {
        stage: "render",
        error: "slide invalido",
      },
      updatedAt: "2026-07-28T00:00:00.000Z",
    });

    assert.equal(metadata.status, "failed");
    assert.equal(metadata.engine, PRESENTATION_ENGINE_VERSION);
    assert.equal(metadata.schema, PRESENTATION_SCHEMA_VERSION);
    assert.equal(metadata.media_pipeline_version, MEDIA_PIPELINE_VERSION);
    assert.equal(metadata.generation_key, "ciclo-1:hash-a");
    assert.equal(metadata.error_stage, "render");
    assert.equal(metadata.error, "slide invalido");
  });
});
```

- [ ] **Step 2: Rodar os testes e confirmar que falham (compilação quebrada — `renderAndUploadPresentation`/`buildPresentationMaterialMetadata` ainda esperam `pdfPath`/`renderPdf`/`uploadPdf`/`pdfUrl`)**

Run: `cd microservice && npm test -- --test-name-pattern="diagnostico da apresentacao"`
Expected: FAIL (erro de tipo/assinatura — os campos `presentationPath`, `buildHtml`, `uploadHtml`, `presentationUrl` não existem ainda nas funções).

- [ ] **Step 3: Reescrever `renderAndUploadPresentation` e `buildPresentationMaterialMetadata` em `microservice/server.ts`**

Substituir o bloco de `export async function renderAndUploadPresentation(...)` até o fim de `buildPresentationMaterialMetadata` (linhas 188-259 do arquivo original) por:

```ts
export type PresentationFailureStage = "render" | "upload";

export interface PresentationFailure {
  stage: PresentationFailureStage;
  error: string;
}

function presentationRendererError(error: unknown): string {
  const raw = error instanceof Error ? error.message : String(error);
  return raw.replace(/\s+/g, " ").trim().slice(0, 1200) || "renderer_error";
}

export async function renderAndUploadPresentation(params: {
  slides: any[];
  profile: BrainHexProfile;
  presentationTheme?: PresentationDesignPlan;
  bucket: string;
  presentationPath: string;
  buildHtml?: typeof buildDeckHtml;
  uploadHtml?: typeof uploadBuffer;
}): Promise<{ presentationUrl: string | null; failure: PresentationFailure | null }> {
  const buildHtml = params.buildHtml ?? buildDeckHtml;
  const uploadHtml = params.uploadHtml ?? uploadBuffer;

  let html: string;
  try {
    html = buildHtml(params.slides, params.profile, params.presentationTheme);
  } catch (error) {
    return {
      presentationUrl: null,
      failure: { stage: "render", error: presentationRendererError(error) },
    };
  }

  try {
    const presentationUrl = await uploadHtml(
      params.bucket,
      params.presentationPath,
      Buffer.from(html, "utf-8"),
      "text/html; charset=utf-8",
    );
    if (!presentationUrl) {
      return {
        presentationUrl: null,
        failure: {
          stage: "upload",
          error: "upload da apresentacao nao retornou URL publica",
        },
      };
    }
    return { presentationUrl, failure: null };
  } catch (error) {
    return {
      presentationUrl: null,
      failure: { stage: "upload", error: presentationRendererError(error) },
    };
  }
}

export function buildPresentationMaterialMetadata(params: {
  generationKey: string;
  presentationUrl: string | null;
  bucket: string;
  failure: PresentationFailure | null;
  updatedAt?: string;
}): MaterialEntry["metadata"] {
  return {
    status: params.presentationUrl ? "completed" : "failed",
    media_kind: "apresentacao",
    ...buildPresentationVersionMetadata(params.generationKey),
    updated_at: params.updatedAt ?? now(),
    ...(params.presentationUrl ? { bucket: params.bucket } : {}),
    ...(params.failure
      ? {
          error_stage: params.failure.stage,
          error: params.failure.error,
        }
      : {}),
  };
}
```

- [ ] **Step 4: Atualizar o import de `pdfService.ts` em `microservice/server.ts` (linhas 34-39)**

Trocar:
```ts
import {
  generateSlidesPDF,
  getPresentationRendererReadiness,
  presentationRendererError,
  type PresentationRendererReadiness,
} from "./src/services/pdfService";
```
por:
```ts
import { buildDeckHtml } from "./src/lib/slideTemplate";
```

(`presentationRendererError` agora é definido localmente em `server.ts`, dentro deste mesmo Task, Step 3. `buildDeckHtml` provavelmente já não está importado neste arquivo — se já houver um import de `slideTemplate.ts` em outra linha, mesclar em vez de duplicar.)

- [ ] **Step 5: Atualizar os imports de `microservice/src/server.test.ts` (linhas 4-12)**

Trocar:
```ts
import {
  buildApp,
  MEDIA_PIPELINE_VERSION,
  PRESENTATION_DESIGN_VERSION,
  PRESENTATION_ENGINE_VERSION,
  PRESENTATION_SCHEMA_VERSION,
  buildPresentationMaterialMetadata,
  renderAndUploadPresentation,
} from "../server";
```
Mantém igual — nenhum nome exportado mudou aqui (só a assinatura interna de `renderAndUploadPresentation`/`buildPresentationMaterialMetadata` mudou, os nomes exportados continuam os mesmos). Nenhuma mudança neste step além de confirmar que compila.

- [ ] **Step 6: Rodar os testes e confirmar que passam (GREEN)**

Run: `cd microservice && npm test -- --test-name-pattern="diagnostico da apresentacao"`
Expected: PASS (3 testes).

- [ ] **Step 7: Commit**

```bash
git add microservice/server.ts microservice/src/server.test.ts
git commit -m "feat(microservice): renderAndUploadPresentation monta e sobe HTML em vez de PDF"
```

---

## Task 3: `archiveToSupabase` sobe `.html` em vez de `.pdf`

**Files:**
- Modify: `microservice/server.ts:261-420` (`archiveToSupabase`)

- [ ] **Step 1: Atualizar a etapa de apresentação dentro de `archiveToSupabase`**

Localizar (dentro da função `archiveToSupabase`, por volta da linha 332-349 do arquivo original):

```ts
  // PDF dos slides: sistema editorial temático com múltiplas composições.
  const pdfPath = `${storagePath}/apresentacao/material-${refId}.pdf`;
  const presentationResult = await renderAndUploadPresentation({
    slides,
    profile,
    presentationTheme,
    bucket,
    pdfPath,
  });
  const pdfUrl = presentationResult.pdfUrl;
  if (presentationResult.failure) {
    lg.error("falha na apresentacao", {
      stage: presentationResult.failure.stage,
      error: presentationResult.failure.error,
    });
  } else {
    lg.info("pdf upload", { status: "ok" });
  }
```

Substituir por:

```ts
  // Apresentacao: HTML com a identidade do guardiao + tema da aula, sem rasterizar.
  const presentationPath = `${storagePath}/apresentacao/material-${refId}.html`;
  const presentationResult = await renderAndUploadPresentation({
    slides,
    profile,
    presentationTheme,
    bucket,
    presentationPath,
  });
  const presentationUrl = presentationResult.presentationUrl;
  if (presentationResult.failure) {
    lg.error("falha na apresentacao", {
      stage: presentationResult.failure.stage,
      error: presentationResult.failure.error,
    });
  } else {
    lg.info("apresentacao upload", { status: "ok" });
  }
```

- [ ] **Step 2: Atualizar o bloco `apresentacao` dentro de `updates` (por volta da linha 381-392 do arquivo original)**

Trocar:
```ts
      apresentacao: {
        payload:      pdfPayloadObj,
        metadata: buildPresentationMaterialMetadata({
          generationKey: fence.generationKey,
          pdfUrl,
          bucket,
          failure: presentationResult.failure,
        }),
        arquivo_url:  pdfUrl,
        storage_path: pdfUrl ? pdfPath : null,
        ...(pdfUrl ? { bucket, mime_type: "application/pdf" } : {}),
      },
```
por:
```ts
      apresentacao: {
        payload:      pdfPayloadObj,
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

- [ ] **Step 3: Atualizar a assinatura de retorno e o `return` de `archiveToSupabase`**

No tipo de retorno da função (por volta da linha 275-281 do arquivo original), trocar:
```ts
}): Promise<{
  audioMp3Url: string | null;
  markdownUrl: string | null;
  pdfUrl: string | null;
  presentationFailure: PresentationFailure | null;
  persisted: PersistedMaterialsMerge | null;
}> {
```
por:
```ts
}): Promise<{
  audioMp3Url: string | null;
  markdownUrl: string | null;
  presentationUrl: string | null;
  presentationFailure: PresentationFailure | null;
  persisted: PersistedMaterialsMerge | null;
}> {
```

No `return` final da função (por volta da linha 413-419 do arquivo original), trocar:
```ts
  return {
    audioMp3Url,
    markdownUrl,
    pdfUrl,
    presentationFailure: presentationResult.failure,
    persisted,
  };
```
por:
```ts
  return {
    audioMp3Url,
    markdownUrl,
    presentationUrl,
    presentationFailure: presentationResult.failure,
    persisted,
  };
```

- [ ] **Step 4: Typecheck**

Run: `cd microservice && npm run lint`
Expected: sem erros de tipo relacionados a `pdfUrl`/`pdfPath` em `archiveToSupabase` (os call sites que ainda leem `result.pdfUrl` vão continuar quebrados até o Task 4 — esperado nesse ponto).

- [ ] **Step 5: Commit**

```bash
git add microservice/server.ts
git commit -m "feat(microservice): archiveToSupabase sobe apresentacao como .html"
```

---

## Task 4: Handler `/api/v1/archive` — remove gate de renderer, renomeia campos

**Files:**
- Modify: `microservice/server.ts:856-973` (handler `POST /api/v1/archive`)

- [ ] **Step 1: Remover o gate de renderer readiness**

Localizar (por volta da linha 880-887 do arquivo original, dentro do handler `app.post("/api/v1/archive", ...)`):

```ts
      const renderer = await presentationRendererReadiness();
      if (!renderer.ready) {
        return res.status(503).json({
          status: "renderer_unavailable",
          error: renderer.error ?? "renderer de apresentacao indisponivel",
          presentation_renderer: renderer,
        });
      }

```

Deletar esse bloco inteiro (nenhuma substituição — segue direto do `if (!isSupabaseConfigured())` pra `const safeClassName = ...`).

- [ ] **Step 2: Renomear `pdfUrl` para `presentationUrl` na resposta do handler**

Localizar (por volta da linha 947-967 do arquivo original):

```ts
      if (result.presentationFailure) {
        return res.status(502).json({
          success: false,
          error: result.presentationFailure.error,
          error_stage: result.presentationFailure.stage,
          audioMp3Url: result.audioMp3Url,
          markdownUrl: result.markdownUrl,
          pdfUrl: null,
        });
      }

      return res.json({
        success:     true,
        audioMp3Url: result.audioMp3Url,
        markdownUrl: result.markdownUrl,
        pdfUrl:      result.pdfUrl,
        supabase_paths: {
          markdown:     result.markdownUrl  ? `${storagePath}/markdown/material-${refId}.md`          : null,
          audio:        result.audioMp3Url  ? `${storagePath}/audio/material-${refId}.mp3`           : null,
          apresentacao: result.pdfUrl       ? `${storagePath}/apresentacao/material-${refId}.pdf`    : null,
        },
      });
```

Trocar por:

```ts
      if (result.presentationFailure) {
        return res.status(502).json({
          success: false,
          error: result.presentationFailure.error,
          error_stage: result.presentationFailure.stage,
          audioMp3Url: result.audioMp3Url,
          markdownUrl: result.markdownUrl,
          presentationUrl: null,
        });
      }

      return res.json({
        success:     true,
        audioMp3Url: result.audioMp3Url,
        markdownUrl: result.markdownUrl,
        presentationUrl: result.presentationUrl,
        supabase_paths: {
          markdown:     result.markdownUrl      ? `${storagePath}/markdown/material-${refId}.md`      : null,
          audio:        result.audioMp3Url      ? `${storagePath}/audio/material-${refId}.mp3`        : null,
          apresentacao: result.presentationUrl  ? `${storagePath}/apresentacao/material-${refId}.html` : null,
        },
      });
```

> Confirmado antes deste plano: nenhum código em `frontend/`, `mobile/` ou `api/` chama `/api/v1/archive` nem lê o campo `pdfUrl` da resposta — é seguro renomear.

- [ ] **Step 2: Commit**

```bash
git add microservice/server.ts
git commit -m "feat(microservice): remove gate de Puppeteer e renomeia pdfUrl->presentationUrl em /api/v1/archive"
```

---

## Task 5: Handler `/api/personalizar` — remove gate de renderer

**Files:**
- Modify: `microservice/server.ts:1052-1062` (dentro do handler `POST /api/personalizar`)

- [ ] **Step 1: Remover o gate de renderer readiness**

Localizar (por volta da linha 1052-1062 do arquivo original, logo depois do bloco `if (incompatibleVersions.length > 0) { ... }`):

```ts
    const renderer = await presentationRendererReadiness();
    if (!renderer.ready) {
      return res.status(503).json({
        status: "renderer_unavailable",
        error: renderer.error ?? "renderer de apresentacao indisponivel",
        presentation_renderer: renderer,
        media_pipeline_version: MEDIA_PIPELINE_VERSION,
        presentation_engine_version: PRESENTATION_ENGINE_VERSION,
        presentation_design_version: PRESENTATION_DESIGN_VERSION,
      });
    }

```

Deletar esse bloco inteiro (segue direto do fechamento do `if (incompatibleVersions.length > 0)` pra `const classeId = String(classe_id ?? 0);`).

> O bloco anterior (`if (incompatibleVersions.length > 0) { ... }`, que compara `requiredPresentationEngineVersion` etc.) **não muda** — é a checagem de contrato de versão, não de prontidão do renderer.

- [ ] **Step 2: Commit**

```bash
git add microservice/server.ts
git commit -m "feat(microservice): remove gate de Puppeteer em /api/personalizar"
```

---

## Task 6: `/api/health` e `buildApp` — remove readiness de renderer

**Files:**
- Modify: `microservice/server.ts:718-758` (opts type + defaults de `buildApp`)
- Modify: `microservice/server.ts:820-843` (handler `GET /api/health`)
- Modify: `microservice/src/server.test.ts:1-140` (imports, `startTestServer`, describe "GET /api/health")

- [ ] **Step 1: Escrever o teste que vai falhar (RED) — `/api/health` sem `presentation_renderer`**

Em `microservice/src/server.test.ts`, trocar o `describe("GET /api/health", ...)` inteiro (linhas 59-140 do arquivo original) por:

```ts
describe("GET /api/health", () => {
  let base: string;
  let close: () => Promise<void>;

  before(async () => ({ base, close } = await startTestServer()));
  after(async () => close());

  it("retorna 200 com status ok", async () => {
    const res = await fetch(`${base}/api/health`);
    assert.equal(res.status, 200);
    const body = await res.json() as {
      status: string;
      auth: boolean;
    };
    assert.equal(body.status, "ok");
    assert.equal(body.auth, false); // sem secret
  });

  it("auth=true quando apiSharedSecret configurado", async () => {
    const { base: b, close: c } = await startTestServer({ apiSharedSecret: "test-secret" });
    try {
      const res = await fetch(`${b}/api/health`);
      const body = await res.json() as { auth: boolean };
      assert.equal(body.auth, true);
    } finally {
      await c();
    }
  });

  it("expõe as versoes do pipeline e o commit implantado", async () => {
    const { base: b, close: c } = await startTestServer({
      renderGitCommit: "abc123render",
    });
    try {
      const res = await fetch(`${b}/api/health`);
      const body = await res.json() as {
        media_pipeline_version: string;
        presentation_engine_version: string;
        presentation_schema: string;
        presentation_design_version: string;
        content_enrichment_provider: string;
        render_git_commit: string;
      };
      assert.equal(body.media_pipeline_version, MEDIA_PIPELINE_VERSION);
      assert.equal(body.presentation_engine_version, PRESENTATION_ENGINE_VERSION);
      assert.equal(body.presentation_schema, PRESENTATION_SCHEMA_VERSION);
      assert.equal(
        body.presentation_design_version,
        PRESENTATION_DESIGN_VERSION,
      );
      assert.equal(body.content_enrichment_provider, "openai");
      assert.equal(body.render_git_commit, "abc123render");
    } finally {
      await c();
    }
  });
});
```

(O teste "retorna 503 quando o Chromium nao consegue gerar o PDF de probe" some inteiro — não há mais o que testar ali.)

- [ ] **Step 2: Atualizar `startTestServer` (linhas 23-38 do arquivo original) — remove o default de `presentationRendererReadiness`**

Trocar:
```ts
async function startTestServer(opts: Parameters<typeof buildApp>[0] = {}) {
  const app = buildApp({
    presentationRendererReadiness: async () => ({
      ready: true,
      checked_at: "2026-07-28T00:00:00.000Z",
      browser: "Chrome/Test",
    }),
    ...opts,
  });
```
por:
```ts
async function startTestServer(opts: Parameters<typeof buildApp>[0] = {}) {
  const app = buildApp(opts);
```

- [ ] **Step 3: Rodar os testes e confirmar que falham (RED) — `buildApp`/`/api/health` ainda dependem do renderer**

Run: `cd microservice && npm test -- --test-name-pattern="GET /api/health"`
Expected: FAIL (o handler ainda chama `presentationRendererReadiness()`, que não existe mais nos opts).

- [ ] **Step 4: Remover `presentationRendererReadiness` dos opts de `buildApp` em `microservice/server.ts`**

No tipo de opts (por volta da linha 727 do arquivo original), remover a linha:
```ts
  presentationRendererReadiness?: () => Promise<PresentationRendererReadiness>;
```

Na desestruturação com defaults (por volta da linha 753), remover a linha:
```ts
    presentationRendererReadiness = getPresentationRendererReadiness,
```

No comentário do gate de concorrência (por volta da linha 730-733), trocar:
```ts
   * (geracao de imagem full-slide + Puppeteer sao pesados o suficiente pra
   * derrubar o processo por memoria se varios decks forem gerados juntos —
   * ja causou crash-loop em producao). Excesso fica na fila (FIFO) do gate,
```
por:
```ts
   * (geracao de imagem full-slide por slide e pesada o suficiente pra
   * derrubar o processo por memoria se varios decks forem gerados juntos —
   * ja causou crash-loop em producao). Excesso fica na fila (FIFO) do gate,
```

- [ ] **Step 5: Reescrever o handler `GET /api/health` (linhas 820-843 do arquivo original)**

Trocar:
```ts
  // ── Health ───────────────────────────────────────────────────────
  app.get("/api/health", async (req, res) => {
    const renderer = await presentationRendererReadiness();
    const ready = renderer.ready;
    if (!renderer.ready) {
      req.log.error("renderer de apresentacao indisponivel", {
        error: renderer.error,
        checkedAt: renderer.checked_at,
      });
    }
    res.status(ready ? 200 : 503).json({
      status:   ready ? "ok" : "degraded",
      message:  "TrailUp Alchemy Microservice is online!",
      supabase: isSupabaseConfigured(),
      auth:     Boolean(apiSharedSecret),
      presentation_renderer: renderer,
      media_pipeline_version: MEDIA_PIPELINE_VERSION,
      presentation_engine_version: PRESENTATION_ENGINE_VERSION,
      presentation_schema: PRESENTATION_SCHEMA_VERSION,
      presentation_design_version: PRESENTATION_DESIGN_VERSION,
      content_enrichment_provider: CONTENT_ENRICHMENT_PROVIDER,
      render_git_commit: renderGitCommit,
    });
  });
```
por:
```ts
  // ── Health ───────────────────────────────────────────────────────
  app.get("/api/health", async (req, res) => {
    res.status(200).json({
      status:   "ok",
      message:  "TrailUp Alchemy Microservice is online!",
      supabase: isSupabaseConfigured(),
      auth:     Boolean(apiSharedSecret),
      media_pipeline_version: MEDIA_PIPELINE_VERSION,
      presentation_engine_version: PRESENTATION_ENGINE_VERSION,
      presentation_schema: PRESENTATION_SCHEMA_VERSION,
      presentation_design_version: PRESENTATION_DESIGN_VERSION,
      content_enrichment_provider: CONTENT_ENRICHMENT_PROVIDER,
      render_git_commit: renderGitCommit,
    });
  });
```

- [ ] **Step 6: Rodar os testes e confirmar que passam (GREEN)**

Run: `cd microservice && npm test -- --test-name-pattern="GET /api/health"`
Expected: PASS (3 testes).

- [ ] **Step 7: Commit**

```bash
git add microservice/server.ts microservice/src/server.test.ts
git commit -m "feat(microservice): /api/health nao depende mais de readiness do Puppeteer"
```

---

## Task 7: Deletar `pdfService.ts`/`pdfService.test.ts` e ajustar o script de QA

**Files:**
- Delete: `microservice/src/services/pdfService.ts`
- Delete: `microservice/src/services/pdfService.test.ts`
- Modify: `microservice/scripts/renderPresentationQa.ts`

- [ ] **Step 1: Confirmar que nada mais importa de `pdfService.ts`**

Run: `grep -rn "services/pdfService" microservice --include="*.ts" | grep -v node_modules`
Expected: só `microservice/scripts/renderPresentationQa.ts` (ajustado no próximo step).

- [ ] **Step 2: Deletar os dois arquivos**

```bash
git rm microservice/src/services/pdfService.ts microservice/src/services/pdfService.test.ts
```

(A cobertura de "HTML válido, sem sourceIds vazando, sem excecao com/sem imagem" já existe em `microservice/src/lib/slideTemplate.test.ts` — não precisa de teste novo.)

- [ ] **Step 3: Ajustar `microservice/scripts/renderPresentationQa.ts` pra escrever HTML em vez de PDF**

O script hoje usa Puppeteer pra duas coisas: tirar screenshot PNG de cada `<section class="slide">`, e gerar um PDF extra só pro perfil "seeker". Como o Puppeteer sai do projeto inteiro, as duas somem — QA visual passa a ser abrir o `.html` gerado direto no navegador (mesma linha da spec, Seção 4).

Remover do topo do arquivo o import:
```ts
import {
  generateSlidesPDF,
  launchPresentationBrowser,
} from "../src/services/pdfService";
```
(não precisa de substituto — `buildDeckHtml` já está importado na linha 5: `import { buildDeckHtml } from "../src/lib/slideTemplate";`)

Trocar a função `main()` inteira (linhas 45-95 do arquivo original) por:

```ts
async function main(): Promise<void> {
  for (const profile of PROFILES) {
    const config = BRAIN_HEX_CONFIG[profile];
    const theme = buildPresentationDesignPlan(profile, {
      subject: "Sistemas distribuídos",
    });
    const slides = slideTitles.map((title, index) => ({
      titulo: title,
      subtitulo: index === 0
        ? "Como serviços independentes trabalham como um sistema"
        : "Sistemas distribuídos",
      topics: [
        "Coordenação entre serviços",
        "Tolerância a falhas",
        "Consistência dos dados",
        "Observabilidade do fluxo",
      ].slice(0, index % 2 === 0 ? 4 : 3),
      explanation:
        "Cada decisão arquitetural equilibra disponibilidade, consistência e resposta a falhas sem perder o objetivo pedagógico central.",
      characterQuote:
        "Observe como cada parte muda o comportamento do sistema inteiro.",
      imagem_referencia: sceneDataUrl(config.color, index),
    }));
    const html = buildDeckHtml(slides, profile, theme);
    fs.writeFileSync(path.join(outputDir, `${profile}.html`), html, "utf-8");
  }
  process.stdout.write(`${outputDir}\n`);
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
```

- [ ] **Step 4: Testar manualmente o script**

Run: `cd microservice && npx tsx scripts/renderPresentationQa.ts /tmp/qa-out`
Expected: gera arquivos `.html` em `/tmp/qa-out` (um por perfil), sem erro, sem abrir Chrome.

- [ ] **Step 5: Commit**

```bash
git add -A microservice/scripts/renderPresentationQa.ts
git commit -m "chore(microservice): remove pdfService.ts, script de QA escreve HTML direto"
```

---

## Task 8: Remover Puppeteer do `package.json`, `.puppeteerrc.cjs` e `Dockerfile`

**Files:**
- Modify: `microservice/package.json`
- Delete: `microservice/.puppeteerrc.cjs`
- Modify: `microservice/Dockerfile`

- [ ] **Step 1: Remover a dependência e o `postinstall` de `microservice/package.json`**

Remover a linha:
```json
    "postinstall": "puppeteer browsers install chrome --install-deps",
```

Remover a linha (na seção `dependencies`):
```json
    "puppeteer": "^24.43.1",
```

- [ ] **Step 2: Deletar `.puppeteerrc.cjs`**

```bash
git rm microservice/.puppeteerrc.cjs
```

- [ ] **Step 3: Reverter `microservice/Dockerfile` pro `COPY` original (sem `.puppeteerrc.cjs`, que não existe mais)**

Trocar:
```dockerfile
# instala dependências primeiro (camada cacheada)
# .puppeteerrc.cjs precisa chegar antes do npm install: é o postinstall
# (puppeteer browsers install chrome) que le esse arquivo pra saber onde
# baixar o Chrome (node_modules/.puppeteer_cache em vez do ~/.cache padrao)
COPY package*.json .puppeteerrc.cjs ./
RUN npm install
```
por:
```dockerfile
# instala dependências primeiro (camada cacheada)
COPY package*.json ./
RUN npm install
```

- [ ] **Step 4: Reinstalar dependências localmente pra atualizar o lockfile**

Run: `cd microservice && npm install`
Expected: `package-lock.json` atualizado, `puppeteer` e suas dependências transitivas removidas.

- [ ] **Step 5: Rodar a suíte inteira do microservice**

Run: `cd microservice && npm test`
Expected: PASS em todos os testes (nenhum teste deveria mais referenciar Puppeteer/Chrome).

- [ ] **Step 6: Typecheck completo**

Run: `cd microservice && npm run lint`
Expected: sem erros (`tsc --noEmit` limpo — nenhuma referência solta a `pdfService`, `PresentationRendererReadiness`, `generateSlidesPDF` etc.).

- [ ] **Step 7: Commit**

```bash
git add microservice/package.json microservice/package-lock.json microservice/Dockerfile
git commit -m "chore(microservice): remove dependencia do Puppeteer"
```

---

## Task 9: Mobile — `isPresentationUrl` reconhece `.html`

**Files:**
- Modify: `mobile/src/utils/contentBlocks.ts:201-209`

- [ ] **Step 1: Atualizar `isPresentationUrl`**

Localizar:
```ts
export function isPresentationUrl(url: string) {
  const normalized = cleanUrl(url);
  return (
    /\.(ppt|pptx|pps|ppsx|odp|key)$/i.test(normalized) ||
    normalized.includes("docs.google.com/presentation") ||
    normalized.includes("view.officeapps.live.com/op/embed.aspx") ||
    normalized.includes("powerpoint.live.com") ||
```

Trocar a primeira linha do `return` por:
```ts
    /\.(html?|ppt|pptx|pps|ppsx|odp|key)$/i.test(normalized) ||
```

(mantém o resto do `return` — `docs.google.com/presentation`, etc. — sem alteração.)

> Sem teste automatizado pra esse arquivo: `mobile/` não tem test runner configurado hoje (`package.json` sem script `test`, sem jest/vitest instalado) — mudança pontual de regex, comportamento validado manualmente: `isPresentationUrl("https://x.supabase.co/.../material-123.html")` deve retornar `true`.

- [ ] **Step 2: Validação manual rápida do regex (sem depender de test runner, que não existe em `mobile/`)**

Run: `node -e "console.log(/\.(html?|ppt|pptx|pps|ppsx|odp|key)\$/i.test('https://x.supabase.co/storage/v1/object/public/conteudo_aluno/brainhex/seeker/apresentacao/material-123.html'.split('?')[0].split('#')[0].toLowerCase()))"`
Expected: `true`

- [ ] **Step 3: Commit**

```bash
git add mobile/src/utils/contentBlocks.ts
git commit -m "fix(mobile): isPresentationUrl reconhece .html (apresentacao deixou de ser PDF)"
```

---

## Task 10: Verificação final e push

**Files:** nenhum (só verificação)

- [ ] **Step 1: Suíte completa do microservice**

Run: `cd microservice && npm test && npm run lint`
Expected: tudo verde.

- [ ] **Step 2: Suíte completa da API (Python) — garante que o bump de versão em `media_contract.py` não quebrou nada**

Run: `cd api && python -m pytest tests/test_brainhex_generation.py tests/test_media_pipeline.py tests/test_api.py -v`
Expected: tudo verde. Esses testes importam `PRESENTATION_ENGINE_VERSION`/`MEDIA_PIPELINE_VERSION` de `media_contract.py` como símbolo (não string literal hardcoded), então o bump do Task 1 não deveria quebrar nada — essa rodada é só confirmação.

- [ ] **Step 3: Push**

```bash
git push origin main
```

- [ ] **Step 4: Redeploy manual do microservice no Dokploy**

Sem ação de código — só lembrete: como das outras vezes hoje, esse push não redesploya sozinho a menos que o Dokploy esteja com auto-deploy habilitado pro `main`. Conferir e disparar redeploy se precisar.

---

## Self-review desta plan

- **Cobertura da spec:** Seção 1 (arquitetura) → Tasks 2-3. Seção 2 (contrato/storage/versionamento) → Tasks 1, 3, 4, 9. Seção 3 (erros) → coberto pelos testes reescritos no Task 2 (falha de render vs upload continuam distintas). Seção 4 (testes) → Tasks 2, 6 (health), 7 (deleção de pdfService.test.ts + ajuste do QA script). Item "fora de escopo" sobre `isPresentationUrl`/render nativo mobile → Task 9 cobre só o ajuste defensivo da extensão (não o render nativo, que fica pra outro brainstorm, como decidido).
- **Placeholders:** nenhum "TBD"/"implementar depois" — todo código de todo step está completo e copiável.
- **Consistência de tipos:** `presentationUrl`/`presentationPath` usados com o mesmo nome em `renderAndUploadPresentation` (Task 2), `archiveToSupabase` (Task 3) e nos handlers (Tasks 4-5) — sem mistura com `pdfUrl`/`pdfPath` remanescente.
