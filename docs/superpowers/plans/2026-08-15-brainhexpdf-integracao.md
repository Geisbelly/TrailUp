# BrainHexPDF como motor de apresentação — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Delegar a geração de apresentação (deck + HTML) do `microservice/`
(trailup) para o repositório externo `BrainHexPDF`, que passa a ser um
serviço HTTP próprio chamado pelo microservice; o microservice continua dono
da persistência final em `conteudo_personalizado.materiais.apresentacao`.

**Architecture:** BrainHexPDF ganha um endpoint novo (`POST
/api/v1/render-and-store`) que gera o deck via Gemini (código já existente,
reaproveitado), renderiza HTML completo (`generateInteractiveHtml`, hoje só
usada no frontend) e sobe o arquivo no Supabase Storage, devolvendo a URL. O
microservice troca sua função de renderização local (`renderAndUploadPresentation`,
que usava `buildDeckHtml`/motor imersivo/geração de imagens) por um cliente
HTTP fino (`brainHexPdfClient.ts`) que chama esse novo endpoint por parte,
usando o `markdown` já sintetizado de cada parte como conteúdo-fonte —
preservando o alinhamento de fronteiras entre markdown/áudio/apresentação
sem precisar de nova lógica de particionamento.

**Tech Stack:** Node.js + TypeScript + Express (ambos os repos), `node:test`
nativo no trailup (sem framework — `tsc --noEmit` + verificação manual via
curl no BrainHexPDF, que não tem test runner instalado), Supabase JS SDK,
Gemini (`@google/genai`).

**Repos e branches:**
- `C:\Users\geisb\documents\github\trailup`, branch `docs/brainhexpdf-integracao-design`
  (já existe, criada durante o design — continue nela).
- `C:\Users\geisb\Documents\GitHub\BrainHexPDF`, branch nova `feat/render-and-store-endpoint`
  (criar a partir de `main` antes da Task 1).

**Spec de referência:** `docs/superpowers/specs/2026-08-15-brainhexpdf-integracao-design.md`
(no repo trailup).

---

## PARTE A — BrainHexPDF (`C:\Users\geisb\Documents\GitHub\BrainHexPDF`)

### Task 1: Branch + variáveis de ambiente

**Files:**
- Modify: `.env.example`

- [ ] **Step 1: Criar a branch**

```bash
cd "C:/Users/geisb/Documents/GitHub/BrainHexPDF"
git checkout -b feat/render-and-store-endpoint
```

- [ ] **Step 2: Adicionar variáveis novas ao `.env.example`**

Adicionar ao final do arquivo:

```
# Segurança do endpoint /api/v1/render-and-store (novo — chamado pelo
# microservice do trailup, nunca pelo browser). Opt-in: se vazio, o endpoint
# fica sem autenticação (mesmo padrão do microservice/api-brainhex).
API_SHARED_SECRET=

# Necessária para o endpoint /api/v1/render-and-store gravar no bucket
# conteudo_aluno (RLS exige service role, ANON_KEY acima não é suficiente
# para esse endpoint). As rotas antigas de Storage continuam usando
# SUPABASE_ANON_KEY.
SUPABASE_SERVICE_ROLE_KEY=

# Porta do servidor. Default 3002 — NÃO usar 3000 (porta do microservice/
# do trailup no mesmo host de dev).
PORT=3002
```

- [ ] **Step 3: Commit**

```bash
git add .env.example
git commit -m "docs: documenta envs do endpoint render-and-store"
```

### Task 2: Porta configurável via env

**Files:**
- Modify: `server.ts:11`

- [ ] **Step 1: Trocar a porta fixa por env-configurável**

Old:
```ts
const PORT = 3000;
```

New:
```ts
const PORT = Number(process.env.PORT) || 3002;
```

- [ ] **Step 2: Verificar tipos**

```bash
npm run lint
```
Expected: sem erros novos relacionados a `PORT`.

- [ ] **Step 3: Commit**

```bash
git add server.ts
git commit -m "fix: porta padrao configuravel via env (evita colisao com o microservice trailup)"
```

### Task 3: Middleware `requireSecret`

**Files:**
- Modify: `server.ts` (logo após o bloco de middlewares globais, antes das rotas — após a linha do `app.use(express.urlencoded(...))`, ou seja, logo depois do trecho lido em `server.ts:16-44`)

- [ ] **Step 1: Adicionar o middleware**

Inserir logo após o bloco de CORS/JSON/logger (após a linha `app.use((req: Request, res: Response, next: NextFunction) => { ... });` do request logger, antes de qualquer `app.post`/`app.get`):

```ts
// Segredo compartilhado com o microservice do trailup. Opt-in: se
// API_SHARED_SECRET não estiver definido, o middleware deixa passar tudo
// (mesmo comportamento do microservice/api-brainhex). Aplicado só no
// endpoint /api/v1/render-and-store — as rotas antigas (UI, demos)
// continuam sem autenticação, fora de escopo desta mudança.
const apiSharedSecret = (process.env.API_SHARED_SECRET || '').trim();

function requireSecret(req: Request, res: Response, next: NextFunction) {
  if (!apiSharedSecret) return next();
  const provided = req.header('x-api-secret') ?? req.header('authorization')?.replace(/^Bearer\s+/i, '');
  if (provided !== apiSharedSecret) {
    return res.status(401).json({ success: false, error: 'auth obrigatória — header x-api-secret ausente ou inválido' });
  }
  return next();
}
```

- [ ] **Step 2: Verificar tipos**

```bash
npm run lint
```
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
git add server.ts
git commit -m "feat: middleware requireSecret (opt-in, espelha o microservice trailup)"
```

### Task 4: Cliente Supabase com service role key

**Files:**
- Modify: `server.ts` (perto do topo, junto dos outros helpers de Supabase — pode ficar logo abaixo do `requireSecret` adicionado na Task 3)

- [ ] **Step 1: Adicionar o helper**

```ts
// Service role: necessária pro endpoint /api/v1/render-and-store gravar no
// bucket conteudo_aluno (RLS não permite ANON_KEY nesse bucket). As rotas
// antigas de Storage (test/upload/list, /api/v1/supabase/sync) continuam
// usando SUPABASE_ANON_KEY via url/anonKey do body ou env — não mexer nelas.
function getServiceRoleClient() {
  const url = process.env.SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  if (!url || !key) {
    throw new Error('SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios para /api/v1/render-and-store');
  }
  return createClient(url, key);
}
```

- [ ] **Step 2: Verificar tipos**

```bash
npm run lint
```
Expected: sem erros (`createClient` já importado no topo do arquivo, linha 5).

- [ ] **Step 3: Commit**

```bash
git add server.ts
git commit -m "feat: cliente Supabase com service role key para render-and-store"
```

### Task 5: Endpoint `POST /api/v1/render-and-store`

**Files:**
- Modify: `server.ts` (imports no topo + novo endpoint, inserido logo após o handler `POST /api/v1/generate`, ou seja, logo antes de `app.post('/api/v1/supabase/sync', ...)`)

- [ ] **Step 1: Adicionar os imports novos**

No topo do arquivo, junto aos demais imports (após `import dotenv from 'dotenv';`):

```ts
import { generateInteractiveHtml } from './src/utils/deckExportUtils';
import { BRAIN_HEX_PROFILES } from './src/data/brainHexProfiles';
```

- [ ] **Step 2: Adicionar o helper de capitalização do perfil**

Junto dos outros helpers de topo (perto de `getApiKeysPool`/`generateWithKeyRotation`):

```ts
// O microservice do trailup manda targetProfile em minusculo
// ("mastermind"); BRAIN_HEX_PROFILES usa chaves capitalizadas
// ("Mastermind") — mesma convencao ja usada no frontend (App.tsx/
// GeneratorModal.tsx).
function capitalizeProfile(targetProfile: string): string {
  const lower = String(targetProfile || '').trim().toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}
```

- [ ] **Step 3: Adicionar o endpoint**

Inserir depois do handler `app.post('/api/v1/generate', ...)` (logo antes de `// API Microservice: POST /api/v1/supabase/sync`):

```ts
// API Microservice: POST /api/v1/render-and-store — gera o deck, renderiza
// o HTML completo (generateInteractiveHtml, antes só usada no frontend) e
// sobe o arquivo no Supabase Storage no bucket/path informados pelo
// chamador. Não escreve em nenhuma tabela — quem persiste em
// conteudo_personalizado é o microservice do trailup (ver
// docs/superpowers/specs/2026-08-15-brainhexpdf-integracao-design.md).
app.post('/api/v1/render-and-store', requireSecret, async (req: Request, res: Response) => {
  try {
    const {
      targetProfile,
      topic,
      sourceText,
      classe = 'Turma-Geral',
      narrativeStyle,
      slideCount = 8,
      bucket,
      storagePath,
    } = req.body;

    if (!targetProfile) {
      return res.status(400).json({ success: false, stage: 'validate', error: 'targetProfile é obrigatório.' });
    }
    if (!bucket || !storagePath) {
      return res.status(400).json({ success: false, stage: 'validate', error: 'bucket e storagePath são obrigatórios.' });
    }

    const capitalizedProfile = capitalizeProfile(targetProfile);
    const theme = (BRAIN_HEX_PROFILES as Record<string, any>)[capitalizedProfile];
    if (!theme) {
      return res.status(400).json({ success: false, stage: 'validate', error: `targetProfile inválido: ${targetProfile}` });
    }

    const guideInfo = getGuideForProfile(targetProfile);
    const targetSlideMin = Math.max(Number(slideCount) || 8, 8);
    const systemPrompt = buildPedagogicalSystemPrompt(targetProfile, guideInfo, targetSlideMin);
    const userPrompt = `
Tema: ${topic || 'Material Educacional'}
Classe/Turma: ${classe}
Perfil: ${targetProfile}
Guia: ${guideInfo.name} (${guideInfo.title})
${sourceText ? `\nConteúdo:\n${sourceText}` : ''}
${narrativeStyle ? `Estilo narrativo: ${narrativeStyle}` : ''}
Gere a aula completa e aprofundada com pelo menos ${targetSlideMin} slides.
`;

    let result;
    try {
      result = await generateWithKeyRotation(systemPrompt, userPrompt, {
        schema: DECK_RESPONSE_SCHEMA,
      });
    } catch (err: any) {
      return res.status(502).json({ success: false, stage: 'generate', error: err.message });
    }

    let deckData: any;
    try {
      deckData = JSON.parse(result.text);
    } catch (err: any) {
      return res.status(502).json({ success: false, stage: 'generate', error: `deck JSON inválido: ${err.message}` });
    }

    const fullDeck = {
      ...deckData,
      id: `deck-${Date.now()}`,
      title: deckData.title || topic || 'Apresentação TrailUp',
      subtitle: deckData.subtitle || `Trilha de ${theme.archetype}`,
      subject: deckData.subject || topic || 'Geral',
      targetProfile: capitalizedProfile,
      rankLevel: deckData.rankLevel || 'Guardião',
      themeConfig: theme,
      createdAt: new Date().toISOString().split('T')[0],
      author: 'TrailUp AI Master',
      estimatedMinutes: deckData.estimatedMinutes || (deckData.slides?.length || 5) * 2,
      tags: deckData.tags || [topic || 'Conteúdo', capitalizedProfile, 'TrailUp'],
      slides: (deckData.slides || []).map((s: any, i: number) => ({ ...s, id: s.id || `slide-${i + 1}` })),
    };

    let html: string;
    try {
      html = generateInteractiveHtml(fullDeck);
    } catch (err: any) {
      return res.status(502).json({ success: false, stage: 'render', error: err.message });
    }

    try {
      const supabase = getServiceRoleClient();
      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(storagePath, Buffer.from(html, 'utf-8'), {
          contentType: 'text/html; charset=utf-8',
          upsert: true,
        });
      if (uploadError) {
        return res.status(502).json({ success: false, stage: 'upload', error: uploadError.message });
      }
      const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(storagePath);
      if (!urlData?.publicUrl) {
        return res.status(502).json({ success: false, stage: 'upload', error: 'upload não retornou URL pública' });
      }
      return res.json({
        success: true,
        url: urlData.publicUrl,
        storage_path: storagePath,
        bucket,
        slide_count: fullDeck.slides.length,
      });
    } catch (err: any) {
      return res.status(502).json({ success: false, stage: 'upload', error: err.message });
    }
  } catch (error: any) {
    console.error('render-and-store error:', error);
    return res.status(500).json({ success: false, stage: 'unknown', error: error.message });
  }
});
```

- [ ] **Step 4: Verificar tipos**

```bash
npm run lint
```
Expected: sem erros. Se `BRAIN_HEX_PROFILES` ou `generateInteractiveHtml` derem erro de tipo no `fullDeck` (estrutura parcial vs `DeckData` completo), ajuste o cast de `fullDeck` para `as any` na chamada de `generateInteractiveHtml(fullDeck as any)` — a função só lê campos em runtime, não há validação de tipo em tempo de execução que dependa disso.

- [ ] **Step 5: Build**

```bash
npm run build
```
Expected: build conclui sem erro (confirma que `deckExportUtils.ts`/`ThematicDecorations.tsx`/`brainHexBorderStyles.ts` empacotam corretamente com esbuild em modo Node — essas funções são strings puras, mas o arquivo `.tsx` importado tem outros exports que usam JSX/React; o bundle deve funcionar porque `react` já é dependency, mas confirme aqui antes de seguir).

- [ ] **Step 6: Verificação manual (sem test runner neste repo)**

```bash
npm run dev
```
Em outro terminal:
```bash
curl -X POST http://localhost:3002/api/v1/render-and-store \
  -H "Content-Type: application/json" \
  -d '{"targetProfile":"mastermind","topic":"Teste","sourceText":"## Aula\nConteudo de teste.","bucket":"conteudo_aluno","storagePath":"teste/render-and-store/manual.html"}'
```
Expected: resposta JSON com `"success": true`, `"url"` apontando pro Supabase Storage configurado no `.env` local, `"slide_count"` >= 8. Se `SUPABASE_URL`/`SUPABASE_SERVICE_ROLE_KEY` não estiverem configurados no `.env` local, a resposta será `{"success":false,"stage":"upload","error":"SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios..."}` — nesse caso o teste é considerado OK até a etapa de geração/render (confirma que o deck+HTML foram gerados), documente no PR que o upload não foi testado ponta-a-ponta sem credenciais.

- [ ] **Step 7: Commit**

```bash
git add server.ts
git commit -m "feat: endpoint POST /api/v1/render-and-store (gera deck + HTML + upload Supabase)"
```

### Task 6: Push da branch

- [ ] **Step 1: Push**

```bash
git push -u origin feat/render-and-store-endpoint
```

---

## PARTE B — trailup microservice (`C:\Users\geisb\documents\github\trailup`)

Todas as tasks abaixo continuam na branch `docs/brainhexpdf-integracao-design`
já existente. Rode `cd "C:/Users/geisb/documents/github/trailup"` antes de
cada bloco de comandos.

### Task 7: Versão do contrato + variáveis de ambiente

**Files:**
- Modify: `microservice/src/constants/pipelineVersions.ts:10`
- Modify: `microservice/.env.example`

- [ ] **Step 1: Bump de `PRESENTATION_ENGINE_VERSION`**

Old (`microservice/src/constants/pipelineVersions.ts:10`):
```ts
export const PRESENTATION_ENGINE_VERSION = "html-direct-v1" as const;
```

New:
```ts
export const PRESENTATION_ENGINE_VERSION = "brainhexpdf-v1" as const;
```

- [ ] **Step 2: Atualizar `.env.example`**

Adicionar, na seção de segurança (perto de `API_SHARED_SECRET`):

```
# Motor de apresentacao (BrainHexPDF, servico externo — ver
# docs/superpowers/specs/2026-08-15-brainhexpdf-integracao-design.md)
BRAINHEXPDF_API_URL=http://localhost:3002
BRAINHEXPDF_API_SECRET=
# BRAINHEXPDF_TIMEOUT_MS=120000
```

Remover as linhas obsoletas do motor imersivo (não existem mais):
```
PRESENTATION_ENGINE_IMMERSIVE_ENABLED=false
# Chamadas Gemini concorrentes por deck ao gerar slides imersivos (min 1, max 6).
PRESENTATION_IMMERSIVE_SLIDE_CONCURRENCY=3
```
E o comentário logo acima delas (bloco "Motor de slides imersivos...").

- [ ] **Step 3: Commit**

```bash
cd "C:/Users/geisb/documents/github/trailup"
git add microservice/src/constants/pipelineVersions.ts microservice/.env.example
git commit -m "feat(microservice): bump PRESENTATION_ENGINE_VERSION para brainhexpdf-v1"
```

### Task 8: Cliente HTTP do BrainHexPDF (TDD)

**Files:**
- Create: `microservice/src/services/brainHexPdfClient.ts`
- Test: `microservice/src/services/brainHexPdfClient.test.ts`

- [ ] **Step 1: Escrever o teste (falhando)**

Criar `microservice/src/services/brainHexPdfClient.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { renderAndUploadPresentationViaBrainHexPdf } from "./brainHexPdfClient";

async function withEnv(vars: Record<string, string | undefined>, fn: () => Promise<void>) {
  const original: Record<string, string | undefined> = {};
  for (const key of Object.keys(vars)) {
    original[key] = process.env[key];
    if (vars[key] === undefined) delete process.env[key];
    else process.env[key] = vars[key];
  }
  try {
    await fn();
  } finally {
    for (const key of Object.keys(original)) {
      if (original[key] === undefined) delete process.env[key];
      else process.env[key] = original[key];
    }
  }
}

test("retorna failure render quando BRAINHEXPDF_API_URL nao configurado", async () => {
  await withEnv({ BRAINHEXPDF_API_URL: undefined }, async () => {
    const result = await renderAndUploadPresentationViaBrainHexPdf({
      markdown: "## Aula\nConteudo",
      topic: "Aula 1",
      profile: "mastermind",
      bucket: "conteudo_aluno",
      presentationPath: "brainhex/mastermind/topico/apresentacao/material-1.html",
    });
    assert.equal(result.presentationUrl, null);
    assert.equal(result.failure?.stage, "render");
  });
});

test("retorna presentationUrl quando o BrainHexPDF responde com sucesso", async () => {
  await withEnv({ BRAINHEXPDF_API_URL: "http://localhost:3002", BRAINHEXPDF_API_SECRET: "segredo" }, async () => {
    let capturedUrl = "";
    let capturedSecret: string | undefined;
    const fetchImpl = (async (url: any, init: any) => {
      capturedUrl = String(url);
      capturedSecret = init?.headers?.["x-api-secret"];
      return {
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          url: "https://storage/x.html",
          storage_path: "a/b.html",
          bucket: "conteudo_aluno",
          slide_count: 8,
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
      },
      { fetchImpl },
    );

    assert.equal(result.presentationUrl, "https://storage/x.html");
    assert.equal(result.failure, null);
    assert.equal(capturedUrl, "http://localhost:3002/api/v1/render-and-store");
    assert.equal(capturedSecret, "segredo");
  });
});

test("retorna failure upload quando o BrainHexPDF responde com stage upload", async () => {
  await withEnv({ BRAINHEXPDF_API_URL: "http://localhost:3002" }, async () => {
    const fetchImpl = (async () => ({
      ok: false,
      status: 502,
      json: async () => ({ success: false, stage: "upload", error: "bucket cheio" }),
    })) as unknown as typeof fetch;

    const result = await renderAndUploadPresentationViaBrainHexPdf(
      {
        markdown: "## Aula",
        topic: "Aula 1",
        profile: "seeker",
        bucket: "conteudo_aluno",
        presentationPath: "x.html",
      },
      { fetchImpl },
    );

    assert.equal(result.presentationUrl, null);
    assert.equal(result.failure?.stage, "upload");
    assert.match(result.failure?.error ?? "", /bucket cheio/);
  });
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha**

```bash
cd "C:/Users/geisb/documents/github/trailup/microservice"
node --import tsx --import ./src/testSetup.ts --test src/services/brainHexPdfClient.test.ts
```
Expected: FAIL — `Cannot find module './brainHexPdfClient'` (o arquivo ainda não existe).

- [ ] **Step 3: Implementar `brainHexPdfClient.ts`**

Criar `microservice/src/services/brainHexPdfClient.ts`:

```ts
// Cliente HTTP do motor de apresentacao (BrainHexPDF, servico externo). Gera
// o deck (Gemini) e o HTML completo do lado de la, sobe o arquivo no
// Supabase Storage e devolve so a URL/path — o merge em
// conteudo_personalizado continua no microservice (mergePersonalizacaoMateriais).
// Ver docs/superpowers/specs/2026-08-15-brainhexpdf-integracao-design.md.

import { createLogger } from "../lib/logger";
import type { BrainHexProfile } from "../constants/brainHex";

const log = createLogger({ ctx: "brainhexpdf-client" });

export interface PresentationRenderFailure {
  stage: "render" | "upload";
  error: string;
}

export interface RenderAndUploadPresentationResult {
  presentationUrl: string | null;
  failure: PresentationRenderFailure | null;
}

export interface RenderAndUploadPresentationParams {
  markdown: string;
  topic: string;
  profile: BrainHexProfile;
  bucket: string;
  presentationPath: string;
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
      }),
      signal: ac.signal,
    });

    const body: any = await response.json().catch(() => null);

    if (!response.ok || !body || body.success !== true) {
      const stage: "render" | "upload" = body?.stage === "upload" ? "upload" : "render";
      const errMsg = typeof body?.error === "string" ? body.error : `HTTP ${response.status}`;
      log.error("render-and-store falhou", { status: response.status, stage, error: errMsg });
      return { presentationUrl: null, failure: { stage, error: truncateError(errMsg) } };
    }

    if (typeof body.url !== "string" || !body.url) {
      return {
        presentationUrl: null,
        failure: { stage: "upload", error: "resposta sem url publica" },
      };
    }

    return { presentationUrl: body.url, failure: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.error("render-and-store erro de rede/timeout", { err: error });
    return { presentationUrl: null, failure: { stage: "upload", error: truncateError(message) } };
  } finally {
    clearTimeout(timer);
  }
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

```bash
node --import tsx --import ./src/testSetup.ts --test src/services/brainHexPdfClient.test.ts
```
Expected: PASS (3 testes).

- [ ] **Step 5: Commit**

```bash
cd "C:/Users/geisb/documents/github/trailup"
git add microservice/src/services/brainHexPdfClient.ts microservice/src/services/brainHexPdfClient.test.ts
git commit -m "feat(microservice): cliente HTTP do BrainHexPDF para gerar apresentacao"
```

### Task 9: Trocar os imports em `server.ts`

**Files:**
- Modify: `microservice/server.ts:1-59`

- [ ] **Step 1: Ajustar o import de `geminiService`**

Old (`server.ts:6-17`):
```ts
import {
  processMediaWithGemini,
  generateLongNaturalAudio,
  generateLongConversationalAudio,
  generateSlideImage,
  splitProcessedContentIntoParts,
  regenerateChapterContent,
  regenerateSlideContent,
  regenerateDocumentMarkdown,
  renderImmersiveSlides,
  type ContentPart,
} from "./src/services/geminiService";
```

New:
```ts
import {
  processMediaWithGemini,
  generateLongNaturalAudio,
  generateLongConversationalAudio,
  splitProcessedContentIntoParts,
  regenerateChapterContent,
  regenerateSlideContent,
  regenerateDocumentMarkdown,
  type ContentPart,
} from "./src/services/geminiService";
```

- [ ] **Step 2: Remover imports de assets/ícones/template/enrichment, adicionar o cliente novo**

Old (`server.ts:19-20`):
```ts
import { generateFullSlideImages, buildImageStyleSuffix } from "./src/lib/slideAssetGenerator";
import { generateSlideIconWithFallback } from "./src/services/slideIconService";
```

New: (remover as duas linhas — sem substituto)

Old (`server.ts:22-27`):
```ts
import {
  buildPresentationDesignPlan,
  presentationLayoutForSlide,
  type PresentationDesignPlan,
  type PresentationThemeInput,
} from "./src/constants/presentationThemes";
```

New:
```ts
import {
  buildPresentationDesignPlan,
  type PresentationDesignPlan,
  type PresentationThemeInput,
} from "./src/constants/presentationThemes";
```

Old (`server.ts:42, 44`):
```ts
import { buildDeckHtml } from "./src/lib/slideTemplate";
import { createLogger, type Logger } from "./src/lib/logger";
import { enrichSlidesWithImages } from "./src/lib/slideEnricher";
```

New:
```ts
import { createLogger, type Logger } from "./src/lib/logger";
import { renderAndUploadPresentationViaBrainHexPdf } from "./src/services/brainHexPdfClient";
```

(nota: `presentationLayoutForSlide` fica sem nenhum consumidor de aplicação
depois desta task — seu único uso era em `generateSceneImages`, removida na
Task 10. A função continua exportada em `presentationThemes.ts` e coberta
por `presentationThemes.test.ts`; não removida nesta mudança — decisão
documentada, não um esquecimento.)

- [ ] **Step 2: Verificar que ainda não compila (esperado — funções ainda referenciadas serão removidas na próxima task)**

```bash
cd "C:/Users/geisb/documents/github/trailup/microservice"
npm run lint
```
Expected: FAIL com erros tipo `Cannot find name 'generateFullSlideImages'`, `Cannot find name 'buildDeckHtml'`, `Cannot find name 'enrichSlidesWithImages'`, `Cannot find name 'renderImmersiveSlides'` etc. — normal neste ponto, resolvido na Task 10.

### Task 10: Remover geração de imagens/ícones e renderização local em `server.ts`

**Files:**
- Modify: `microservice/server.ts`

- [ ] **Step 1: Remover `SlideAssetInput`/`SlideAssets`/`generateSceneImages`/`generateSlideIcons`/`generateSlideAssets`**

Remover o bloco completo entre o comentário `// ─── Helpers ───...` (que fica)
e a linha antes de `// enrichSlidesWithImages extraído...` — ou seja, todo o
trecho hoje em `server.ts:89-179`:

```ts
type SlideAssetInput = { imagePrompt: string; iconPrompts?: string[] };
type SlideAssets = { imagem_referencia: string[]; icones: string[][] };

/**
 * 1 cena de fundo por slide, via Gemini (gemini-2.5-flash-image). Serial (1
 * chave, sem pool). gpt-image-1 (OpenAI) não é suportado em todos os tiers —
 ... (todo o corpo de generateSceneImages, generateSlideIcons, generateSlideAssets) ...
async function generateSlideAssets(
  slides: SlideAssetInput[],
  profile: BrainHexProfile,
  plan: PresentationDesignPlan,
): Promise<SlideAssets> {
  const styleSuffix = buildImageStyleSuffix(profile, plan);
  const [scenes, iconsPerSlide] = await Promise.all([
    generateSceneImages(slides, styleSuffix, plan),
    generateSlideIcons(slides, styleSuffix),
  ]);
  return { imagem_referencia: scenes, icones: iconsPerSlide };
}
```

Delete o bloco inteiro (use `Grep` por `type SlideAssetInput` e
`async function generateSlideAssets` para achar o início/fim exatos no seu
checkout local, já que números de linha podem ter deslocado após a Task 9).

- [ ] **Step 2: Remover `PRESENTATION_ENGINE_IMMERSIVE_ENABLED`**

Remover (hoje em `server.ts:182-190`):
```ts
// enrichSlidesWithImages extraído para src/lib/slideEnricher.ts (testado).

// Flag desligado por padrao (mesmo padrao de ENABLE_OPENAI_FULL_SLIDE_IMAGES
// em src/lib/slideAssetGenerator.ts). Quando ligado, decks de 1 parte usam o
// motor imersivo (IA gera HTML/CSS/JS por slide) em vez de imagem de
// cena/icone + template. Decks que precisaram ser divididos em multiplas
// partes (parts.length > 1) sempre usam o pipeline atual, independente do
// flag - o motor imersivo produz 1 documento autocontido, incompativel com
// a paginacao multi-parte sem uma mudanca maior (fora de escopo aqui).
const PRESENTATION_ENGINE_IMMERSIVE_ENABLED =
  process.env.PRESENTATION_ENGINE_IMMERSIVE_ENABLED === "true";
```

- [ ] **Step 3: Simplificar `renderAndUploadPresentation` → remover (substituído pelo cliente)**

Remover a função inteira `renderAndUploadPresentation` (assinatura
`export async function renderAndUploadPresentation(params: { slides: any[]; ... })`)
— toda a função, incluindo a checagem de `buildHtml`/`uploadHtml` injetáveis.

Remover também `presentationRendererError` (hoje em `server.ts:201-204`) —
confirmado via grep que seu único consumidor era `renderAndUploadPresentation`
(chamadas nos dois blocos `catch`), então fica órfã junto com ela.

`PresentationFailure`/`PresentationFailureStage` (tipos, hoje em
`server.ts:194-199`) **ficam** — ainda usados como tipo de retorno de
`archiveToSupabase`/`archiveMultiPartToSupabase` e como parâmetro de
`buildPresentationMaterialMetadata`.

- [ ] **Step 4: Simplificar `buildPresentationMaterialMetadata` (remover `engineVariant`)**

Old:
```ts
export function buildPresentationMaterialMetadata(params: {
  generationKey: string;
  presentationUrl: string | null;
  bucket: string;
  failure: PresentationFailure | null;
  updatedAt?: string;
  engineVariant?: "immersive";
}): MaterialEntry["metadata"] {
  return {
    status: params.presentationUrl ? "completed" : "failed",
    media_kind: "apresentacao",
    ...buildPresentationVersionMetadata(params.generationKey),
    updated_at: params.updatedAt ?? now(),
    ...(params.presentationUrl ? { bucket: params.bucket } : {}),
    ...(params.engineVariant ? { engine_variant: params.engineVariant } : {}),
    ...(params.failure
      ? {
          error_stage: params.failure.stage,
          error: params.failure.error,
        }
      : {}),
  };
}
```

New:
```ts
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

- [ ] **Step 5: Atualizar `archiveToSupabase`** (usado por `/api/v1/archive`, endpoint avulso)

Dentro de `archiveToSupabase`, trocar o bloco:
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
```

por:
```ts
  // Apresentacao: gerada pelo BrainHexPDF (deck + HTML), usando o markdown
  // ja sintetizado como conteudo-fonte (mesmo texto que virou material de
  // estudo) e a primeira linha nao vazia do markdown como topico.
  const presentationPath = `${storagePath}/apresentacao/material-${refId}.html`;
  const presentationTopic = markdown.split("\n").find((l) => l.trim())?.trim() ?? "Aula";
  const presentationResult = await renderAndUploadPresentationViaBrainHexPdf({
    markdown,
    topic: presentationTopic,
    profile,
    bucket,
    presentationPath,
  });
```

(`slides`/`presentationTheme` continuam sendo usados logo abaixo, para
montar `apresentacaoPayloadObj` — não removidos dessa função.)

- [ ] **Step 6: Atualizar `archiveMultiPartToSupabase`** (usado por `runPipeline`, fluxo principal)

Remover os parâmetros `prebuiltPresentationHtml`/`prebuiltImmersiveSlideHtmls`
da assinatura:

Old:
```ts
export async function archiveMultiPartToSupabase(params: {
  profile:         BrainHexProfile;
  storagePath:     string;
  bucket:          string;
  refId:           string;
  parts:           Array<ContentPart & { mp3Base64: string | null; wavBase64: string | null }>;
  presentationTheme: PresentationDesignPlan;
  personalizacaoId: number | null;
  fence?:           GenerationFence;
  log?:            Logger;
  prebuiltPresentationHtml?: string | null;
  prebuiltImmersiveSlideHtmls?: string[] | null;
}): Promise<{
```

New:
```ts
export async function archiveMultiPartToSupabase(params: {
  profile:         BrainHexProfile;
  storagePath:     string;
  bucket:          string;
  refId:           string;
  parts:           Array<ContentPart & { mp3Base64: string | null; wavBase64: string | null }>;
  presentationTheme: PresentationDesignPlan;
  personalizacaoId: number | null;
  fence?:           GenerationFence;
  log?:            Logger;
}): Promise<{
```

Dentro do laço `for (const part of parts) { ... }`, trocar:
```ts
    const presentationPath = `${storagePath}/apresentacao/material-${refId}${suffix}.html`;
    const presentationResult = await renderAndUploadPresentation({
      slides: part.slides,
      profile,
      presentationTheme,
      bucket,
      presentationPath,
      ...(params.prebuiltPresentationHtml
        ? { buildHtml: () => params.prebuiltPresentationHtml as string }
        : {}),
    });
```

por:
```ts
    const presentationPath = `${storagePath}/apresentacao/material-${refId}${suffix}.html`;
    const presentationResult = await renderAndUploadPresentationViaBrainHexPdf({
      markdown: part.markdown,
      topic: part.titulo,
      profile,
      bucket,
      presentationPath,
    });
```

Mais abaixo, na montagem de `updates.apresentacao`, trocar:
```ts
        payload: {
          slides: buildApresentacaoSlidesPayload(parts, params.prebuiltImmersiveSlideHtmls),
          tema_visual: presentationTheme,
        },
        metadata: buildPresentationMaterialMetadata({
          generationKey: fence.generationKey,
          presentationUrl,
          bucket,
          failure: firstPresentationFailure,
          ...(params.prebuiltPresentationHtml ? { engineVariant: "immersive" as const } : {}),
        }),
```

por:
```ts
        payload: {
          slides: buildApresentacaoSlidesPayload(parts),
          tema_visual: presentationTheme,
        },
        metadata: buildPresentationMaterialMetadata({
          generationKey: fence.generationKey,
          presentationUrl,
          bucket,
          failure: firstPresentationFailure,
        }),
```

- [ ] **Step 7: Simplificar `buildApresentacaoSlidesPayload`**

Old:
```ts
export function buildApresentacaoSlidesPayload(
  parts: Array<{ slides: SlideContent[] }>,
  prebuiltImmersiveSlideHtmls?: string[] | null,
): SlideContent[] | Array<{ index: number; html: string }> {
  if (prebuiltImmersiveSlideHtmls) {
    return prebuiltImmersiveSlideHtmls.map((html, index) => ({ index, html }));
  }
  return parts.flatMap((p) => p.slides);
}
```

New:
```ts
export function buildApresentacaoSlidesPayload(
  parts: Array<{ slides: SlideContent[] }>,
): SlideContent[] {
  return parts.flatMap((p) => p.slides);
}
```

- [ ] **Step 8: Remover `resolvePresentationRendering`**

Remover a interface `PresentationRenderingResult`, a interface
`ResolvePresentationRenderingDeps` e a função inteira
`export async function resolvePresentationRendering(...)` (hoje em
`server.ts:779-827`).

- [ ] **Step 9: Simplificar `runPipeline`**

Old (miolo de `runPipeline`, do passo 2 ao passo 4):
```ts
  // 2. Texto + slides via Gemini (multi-arquivo)
  const resultado = await processMediaWithGemini(
    filesData,
    profile,
    contentBlocks,
    presentationPlan,
    guidancePrompt,
  );

  // 3. Divide o resultado JA sintetizado (uma so vez, sem duplicar topicos -
  // ver mergeContentBlocksIntoOne) em partes entregaveis. As fronteiras vem
  // so de markdown/audioScript/contagem de slides, entao podem ser
  // calculadas antes do enriquecimento de imagem terminar - o audio de cada
  // parte ja sai gerando em paralelo com as imagens, sem esperar por elas.
  const partsForAudio = splitProcessedContentIntoParts({
    markdown: resultado.markdown,
    audioScript: resultado.audioScript,
    slides: resultado.slides,
  });

  const voiceProfile = GUARDIAN_VOICE_PROFILES[profile];
  const voice = voiceProfile.voice;
  const secondaryGuideName = BRAIN_HEX_CONFIG[profile]?.secondaryGuideName;
  const secondaryVoice = voiceProfile.secondaryVoice;
  const generatePartAudio = (audioScript: string) =>
    secondaryGuideName && secondaryVoice
      ? generateLongConversationalAudio(
          audioScript,
          {
            name: BRAIN_HEX_CONFIG[profile].guideName,
            voice,
            direction: voiceProfile.direction,
          },
          {
            name: secondaryGuideName,
            voice: secondaryVoice,
            direction: voiceProfile.secondaryDirection,
          },
        )
      : generateLongNaturalAudio(audioScript, voice, voiceProfile.direction);

  // So decks de 1 parte usam o motor imersivo - ver decisao 6 no plano
  // desta task (paginacao multi-parte do mobile e incompativel com o
  // documento autocontido do motor imersivo).
  const useImmersiveEngine = PRESENTATION_ENGINE_IMMERSIVE_ENABLED && partsForAudio.length === 1;

  // allSettled no audio preserva a regra existente de sucesso parcial - uma
  // parte de audio falhando nao derruba as outras. resolvePresentationRendering
  // ja encapsula sua propria queda pro pipeline de imagem+template em caso de
  // falha (motor imersivo ou assets), sem propagar erro pra runPipeline - ver
  // comentario na funcao.
  const [audioSettled, { immersiveDeckHtml, immersiveSlideHtmls, slidesComImagens }] = await Promise.all([
    Promise.allSettled(partsForAudio.map((part) => generatePartAudio(part.audioScript))),
    resolvePresentationRendering(resultado.slides, profile, presentationPlan, useImmersiveEngine, jobLog),
  ]);

  const audioByPart = audioSettled.map((result, index) => {
    if (result.status === "fulfilled") {
      return { mp3Base64: result.value.mp3 ?? null, wavBase64: result.value.wav ?? null };
    }
    jobLog.error("falha no áudio de uma parte", { parte: index + 1, err: result.reason });
    return { mp3Base64: null, wavBase64: null };
  });

  // Recalcula as mesmas fronteiras de parte (deterministicas a partir do
  // mesmo markdown/audioScript) agora com as slides ja enriquecidas com
  // imagem, para a apresentacao de cada parte sair completa.
  const finalParts = splitProcessedContentIntoParts({
    markdown: resultado.markdown,
    audioScript: resultado.audioScript,
    slides: slidesComImagens,
  });
  const partsWithAudio = finalParts.map((part, index) => ({
    ...part,
    mp3Base64: audioByPart[index]?.mp3Base64 ?? null,
    wavBase64: audioByPart[index]?.wavBase64 ?? null,
  }));

  // 4. Persiste tudo no Supabase
  const archived = await archiveMultiPartToSupabase({
    profile,
    storagePath,
    bucket,
    refId,
    parts: partsWithAudio,
    presentationTheme: presentationPlan,
    personalizacaoId,
    fence,
    log:              jobLog,
    prebuiltPresentationHtml: immersiveDeckHtml,
    prebuiltImmersiveSlideHtmls: immersiveSlideHtmls,
  });
```

New:
```ts
  // 2. Texto + slides via Gemini (multi-arquivo)
  const resultado = await processMediaWithGemini(
    filesData,
    profile,
    contentBlocks,
    presentationPlan,
    guidancePrompt,
  );

  // 3. Divide o resultado JA sintetizado (uma so vez, sem duplicar topicos -
  // ver mergeContentBlocksIntoOne) em partes entregaveis. Cada parte vira 1
  // chamada ao BrainHexPDF pra gerar a apresentacao daquele trecho - mesmas
  // fronteiras de markdown/audioScript/apresentacao, sem particionamento
  // separado (ver docs/superpowers/specs/2026-08-15-brainhexpdf-integracao-design.md).
  const parts = splitProcessedContentIntoParts({
    markdown: resultado.markdown,
    audioScript: resultado.audioScript,
    slides: resultado.slides,
  });

  const voiceProfile = GUARDIAN_VOICE_PROFILES[profile];
  const voice = voiceProfile.voice;
  const secondaryGuideName = BRAIN_HEX_CONFIG[profile]?.secondaryGuideName;
  const secondaryVoice = voiceProfile.secondaryVoice;
  const generatePartAudio = (audioScript: string) =>
    secondaryGuideName && secondaryVoice
      ? generateLongConversationalAudio(
          audioScript,
          {
            name: BRAIN_HEX_CONFIG[profile].guideName,
            voice,
            direction: voiceProfile.direction,
          },
          {
            name: secondaryGuideName,
            voice: secondaryVoice,
            direction: voiceProfile.secondaryDirection,
          },
        )
      : generateLongNaturalAudio(audioScript, voice, voiceProfile.direction);

  // allSettled preserva a regra existente de sucesso parcial - uma parte de
  // audio falhando nao derruba as outras. A apresentacao de cada parte e
  // gerada dentro de archiveMultiPartToSupabase (chamada ao BrainHexPDF por
  // parte) - corte seco: falha lá derruba a apresentacao inteira, sem
  // fallback (ver design).
  const audioSettled = await Promise.allSettled(
    parts.map((part) => generatePartAudio(part.audioScript)),
  );

  const audioByPart = audioSettled.map((result, index) => {
    if (result.status === "fulfilled") {
      return { mp3Base64: result.value.mp3 ?? null, wavBase64: result.value.wav ?? null };
    }
    jobLog.error("falha no áudio de uma parte", { parte: index + 1, err: result.reason });
    return { mp3Base64: null, wavBase64: null };
  });

  const partsWithAudio = parts.map((part, index) => ({
    ...part,
    mp3Base64: audioByPart[index]?.mp3Base64 ?? null,
    wavBase64: audioByPart[index]?.wavBase64 ?? null,
  }));

  // 4. Persiste tudo no Supabase (apresentacao gerada via BrainHexPDF por parte)
  const archived = await archiveMultiPartToSupabase({
    profile,
    storagePath,
    bucket,
    refId,
    parts: partsWithAudio,
    presentationTheme: presentationPlan,
    personalizacaoId,
    fence,
    log:              jobLog,
  });
```

- [ ] **Step 10: Atualizar o handler `POST /api/v1/archive`**

Remover o bloco de geração de assets (cena+ícones) e a chamada a
`enrichSlidesWithImages`:

Old:
```ts
      // Assets dos slides:
      // - Se o frontend enviou cenas de fundo prontas (slideImages), usa direto e so
      //   gera os icones (Gemini) server-side (generateSlideIcons sozinho — sem
      //   desperdicar uma chamada OpenAI gerando cena de prompt vazio).
      // - Caso contrario, gera cena (OpenAI) + icones (Gemini) server-side, tudo.
      let sceneImages: string[];
      let iconImages: string[][];
      if (Array.isArray(clientImages) && clientImages.length > 0) {
        sceneImages = clientImages;
        req.log.info("gerando icones dos slides server-side (cena veio do cliente)");
        iconImages = await generateSlideIcons(
          processed.slides || [],
          buildImageStyleSuffix(
            profile as BrainHexProfile,
            presentationPlan,
          ),
        );
      } else {
        req.log.info("gerando cena + icones dos slides server-side");
        const assets = await generateSlideAssets(
          processed.slides || [],
          profile as BrainHexProfile,
          presentationPlan,
        );
        sceneImages = assets.imagem_referencia;
        iconImages  = assets.icones;
      }

      const slidesComImagens = enrichSlidesWithImages(processed.slides || [], sceneImages, iconImages);

      const result = await archiveToSupabase({
        profile:          profile as BrainHexProfile,
        storagePath,
        bucket,
        refId,
        markdown:         processed.markdown ?? "",
        audioScript:      processed.audioScript ?? "",
        slides:           slidesComImagens,
        presentationTheme: presentationPlan,
        mp3Base64:        mp3Base64 ?? null,
        wavBase64:        wavBase64 ?? null,
        personalizacaoId: null,
      });
```

New:
```ts
      const result = await archiveToSupabase({
        profile:          profile as BrainHexProfile,
        storagePath,
        bucket,
        refId,
        markdown:         processed.markdown ?? "",
        audioScript:      processed.audioScript ?? "",
        slides:           processed.slides ?? [],
        presentationTheme: presentationPlan,
        mp3Base64:        mp3Base64 ?? null,
        wavBase64:        wavBase64 ?? null,
        personalizacaoId: null,
      });
```

(`clientImages`/`slideImages` do `req.body` ficam sem uso — remova a
desestruturação de `slideImages: clientImages` do bloco `const { profile,
class_name, processed, mp3Base64, wavBase64, slideImages: clientImages,
presentation_theme: requestedPresentationTheme } = req.body;`, deixando:
`const { profile, class_name, processed, mp3Base64, wavBase64,
presentation_theme: requestedPresentationTheme } = req.body;`)

- [ ] **Step 11: Verificar tipos**

```bash
cd "C:/Users/geisb/documents/github/trailup/microservice"
npm run lint
```
Expected: sem erros relacionados às mudanças acima. Se restar algum erro
`declared but never used` (ex.: `PresentationDesignPlan` sem uso em algum
ponto), ajuste o import correspondente.

- [ ] **Step 12: Commit**

```bash
cd "C:/Users/geisb/documents/github/trailup"
git add microservice/server.ts
git commit -m "refactor(microservice): remove motores classico/imersivo de apresentacao, delega ao BrainHexPDF"
```

### Task 11: Remover o motor imersivo de `geminiService.ts`

**Files:**
- Modify: `microservice/src/services/geminiService.ts`

- [ ] **Step 1: Remover os imports específicos do motor imersivo**

Old:
```ts
import { MAX_SLIDE_HTML_CHARS, validateSlideHtml } from "../lib/slideValidation";
```
e
```ts
import { buildImmersiveDeckHtml } from "../lib/slideShell";
```

Remover as duas linhas (localize via `Grep` por `slideValidation` e
`slideShell` neste arquivo — são as únicas duas linhas de import
correspondentes).

- [ ] **Step 2: Remover o bloco do motor imersivo**

Remover o trecho completo entre `export interface ImmersiveSlideInput {`
e o fechamento de `export async function renderImmersiveSlides(...)`
(hoje `geminiService.ts:2129-2326`) — inclui: `ImmersiveSlideInput`,
`ImmersiveSlideExecutor`, `ImmersiveSlideOptions`,
`IMMERSIVE_SLIDE_MAX_OUTPUT_TOKENS`, `generateImmersiveSlideHtml`,
`DEFAULT_IMMERSIVE_SLIDE_CONCURRENCY`, `MAX_IMMERSIVE_SLIDE_CONCURRENCY`,
`resolveImmersiveSlideConcurrency`, `slideContentSummary`,
`RenderImmersiveSlidesOptions`, `ImmersiveDeckResult`, `renderImmersiveSlides`.

Tudo que vem depois (`regenerateChapterContent`, `regenerateSlideContent`,
`regenerateDocumentMarkdown`) **fica** — não faz parte do motor imersivo.

- [ ] **Step 3: Verificar tipos**

```bash
cd "C:/Users/geisb/documents/github/trailup/microservice"
npm run lint
```
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
cd "C:/Users/geisb/documents/github/trailup"
git add microservice/src/services/geminiService.ts
git commit -m "refactor(microservice): remove motor de slides imersivos (renderImmersiveSlides)"
```

### Task 12: Apagar arquivos mortos, script de QA e ajustar `package.json`

**Files:**
- Delete: `microservice/src/lib/slideTemplate.ts`, `microservice/src/lib/slideTemplate.test.ts`
- Delete: `microservice/src/lib/slideAssetGenerator.ts`, `microservice/src/lib/slideAssetGenerator.test.ts`
- Delete: `microservice/src/services/openaiImageService.ts`, `microservice/src/services/openaiImageService.test.ts`
- Delete: `microservice/src/services/slideIconService.ts`, `microservice/src/services/slideIconService.test.ts`
- Delete: `microservice/src/lib/slideEnricher.ts`, `microservice/src/lib/slideEnricher.test.ts`
- Delete: `microservice/src/lib/slideShell.ts`, `microservice/src/lib/slideShell.test.ts`
- Delete: `microservice/src/lib/slideValidation.ts`, `microservice/src/lib/slideValidation.test.ts`
- Delete: `microservice/src/services/geminiImmersiveSlide.test.ts`
- Delete: `microservice/scripts/renderPresentationQa.ts`
- Modify: `microservice/package.json`

- [ ] **Step 1: Confirmar que não sobrou nenhuma referência antes de apagar**

```bash
cd "C:/Users/geisb/documents/github/trailup/microservice"
grep -rn "slideTemplate\|slideAssetGenerator\|openaiImageService\|slideIconService\|slideEnricher\|slideShell\|slideValidation\|renderImmersiveSlides\|generateImmersiveSlideHtml\|renderPresentationQa" --include="*.ts" server.ts src/ scripts/ | grep -v "\.test\.ts"
```
Expected: nenhuma linha de código de produção referenciando esses módulos
(só os próprios arquivos que serão apagados, se aparecerem no grep). Se
algo inesperado aparecer, pare e investigue antes de apagar.

- [ ] **Step 2: Apagar os arquivos**

```bash
rm microservice/src/lib/slideTemplate.ts microservice/src/lib/slideTemplate.test.ts
rm microservice/src/lib/slideAssetGenerator.ts microservice/src/lib/slideAssetGenerator.test.ts
rm microservice/src/services/openaiImageService.ts microservice/src/services/openaiImageService.test.ts
rm microservice/src/services/slideIconService.ts microservice/src/services/slideIconService.test.ts
rm microservice/src/lib/slideEnricher.ts microservice/src/lib/slideEnricher.test.ts
rm microservice/src/lib/slideShell.ts microservice/src/lib/slideShell.test.ts
rm microservice/src/lib/slideValidation.ts microservice/src/lib/slideValidation.test.ts
rm microservice/src/services/geminiImmersiveSlide.test.ts
rm microservice/scripts/renderPresentationQa.ts
```
(rode a partir de `C:/Users/geisb/documents/github/trailup`, ou ajuste os
caminhos se já estiver dentro de `microservice/`)

- [ ] **Step 3: Atualizar a lista de testes em `package.json`**

Old (`microservice/package.json`, campo `"test"`):
```json
"test": "node --import tsx --import ./src/testSetup.ts --test src/lib/boundedConcurrency.test.ts src/lib/concurrencyGate.test.ts src/lib/serialQueue.test.ts src/lib/textSanitize.test.ts src/lib/wav.test.ts src/lib/logger.test.ts src/lib/materialsMerge.test.ts src/lib/slideEnricher.test.ts src/lib/validators.test.ts src/lib/rateLimit.test.ts src/lib/dedupedTimeoutRunner.test.ts src/lib/slideAssetGenerator.test.ts src/lib/pptxSlideOrder.test.ts src/server.test.ts src/server.archive.test.ts src/services/contentGenerationService.test.ts src/services/geminiBlockBatches.test.ts src/services/geminiKeyRotation.test.ts src/services/openaiImageService.test.ts src/services/slideIconService.test.ts src/services/supabaseService.test.ts src/lib/slideTemplate.test.ts src/constants/guardianVoices.test.ts src/constants/presentationThemes.test.ts src/lib/slideValidation.test.ts src/lib/slideShell.test.ts src/services/geminiImmersiveSlide.test.ts"
```

New:
```json
"test": "node --import tsx --import ./src/testSetup.ts --test src/lib/boundedConcurrency.test.ts src/lib/concurrencyGate.test.ts src/lib/serialQueue.test.ts src/lib/textSanitize.test.ts src/lib/wav.test.ts src/lib/logger.test.ts src/lib/materialsMerge.test.ts src/lib/validators.test.ts src/lib/rateLimit.test.ts src/lib/dedupedTimeoutRunner.test.ts src/lib/pptxSlideOrder.test.ts src/server.test.ts src/server.archive.test.ts src/services/contentGenerationService.test.ts src/services/geminiBlockBatches.test.ts src/services/geminiKeyRotation.test.ts src/services/supabaseService.test.ts src/constants/guardianVoices.test.ts src/constants/presentationThemes.test.ts src/services/brainHexPdfClient.test.ts"
```

- [ ] **Step 4: Commit**

```bash
cd "C:/Users/geisb/documents/github/trailup"
git add -A microservice/
git commit -m "chore(microservice): remove arquivos do motor de slides antigo (classico/imersivo)"
```

### Task 13: Corrigir `server.test.ts` / `server.archive.test.ts`

**Files:**
- Modify: `microservice/src/server.test.ts`
- Modify: `microservice/src/server.archive.test.ts`

- [ ] **Step 1: Localizar os pontos quebrados**

```bash
cd "C:/Users/geisb/documents/github/trailup/microservice"
grep -n "renderAndUploadPresentation\|resolvePresentationRendering\|prebuiltPresentationHtml\|prebuiltImmersiveSlideHtmls\|buildApresentacaoSlidesPayload\|engineVariant\|generateFullSlideImages\|buildDeckHtml\|enrichSlidesWithImages\|renderImmersiveSlides" src/server.test.ts src/server.archive.test.ts
```

- [ ] **Step 2: Para cada ocorrência, aplicar a correção correspondente**

- Qualquer mock/stub de `renderAndUploadPresentation` (via `deps.buildHtml`/
  `deps.uploadHtml` injetados em `archiveToSupabase`/`archiveMultiPartToSupabase`)
  deve virar um mock de `renderAndUploadPresentationViaBrainHexPdf` — se o
  teste importa a função para espioná-la/substituí-la, troque o import para
  `./brainHexPdfClient` (ou caminho relativo equivalente a partir do arquivo
  de teste) e ajuste a assinatura mockada para `{ markdown, topic, profile,
  bucket, presentationPath }` → `{ presentationUrl, failure }`.
- Chamadas a `buildApresentacaoSlidesPayload(parts, algumaCoisa)` com 2
  argumentos → remover o segundo argumento.
- Qualquer assert sobre `metadata.engine_variant === "immersive"` → remover
  o assert (o campo não existe mais).
- Qualquer teste que monta `archiveMultiPartToSupabase({ ...,
  prebuiltPresentationHtml: ..., prebuiltImmersiveSlideHtmls: ... })` →
  remover essas duas chaves do objeto de params.
- Qualquer teste que espera `resolvePresentationRendering`/
  `PRESENTATION_ENGINE_IMMERSIVE_ENABLED` no comportamento do `runPipeline`
  → remover o teste ou reescrever para o novo fluxo (uma chamada de
  `renderAndUploadPresentationViaBrainHexPdf` por parte, sem branch
  imersivo/clássico).

Se qualquer ajuste não estiver coberto pelos padrões acima, pare e reporte
o teste específico antes de decidir como corrigi-lo — não adivinhe
comportamento de um teste que você não conseguiu mapear pra uma das regras
acima.

- [ ] **Step 3: Commit**

```bash
cd "C:/Users/geisb/documents/github/trailup"
git add microservice/src/server.test.ts microservice/src/server.archive.test.ts
git commit -m "test(microservice): atualiza testes de server.ts para o novo motor de apresentacao"
```

### Task 14: Rodar a suíte completa

- [ ] **Step 1: Lint**

```bash
cd "C:/Users/geisb/documents/github/trailup/microservice"
npm run lint
```
Expected: PASS, sem erros.

- [ ] **Step 2: Testes**

```bash
npm test
```
Expected: PASS, todos os testes verdes (incluindo os 3 novos de
`brainHexPdfClient.test.ts` e os ajustados de `server.test.ts`/
`server.archive.test.ts`).

- [ ] **Step 3: Se algo falhar**

Volte à Task correspondente (10, 11, 12 ou 13), corrija e rode `npm test`
de novo antes de prosseguir. Não pule para a Task 15 com testes falhando.

### Task 15: Dev tooling — `scripts/dev.ps1` e `CLAUDE.md`

**Files:**
- Modify: `scripts/dev.ps1`

- [ ] **Step 1: Adicionar o serviço `brainhexpdf`**

Old:
```powershell
[CmdletBinding()]
param(
  [ValidateSet('api', 'microservice', 'frontend', 'mobile')]
  [string[]]$Service = @('api', 'microservice', 'frontend', 'mobile')
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot

# nome -> @{ Dir; Cmd; Port; Check }
$services = [ordered]@{
  api          = @{ Dir = 'api';          Port = 8000; Check = '.venv';        Cmd = '.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000' }
  microservice = @{ Dir = 'microservice'; Port = 3000; Check = 'node_modules'; Cmd = 'npm run dev' }
  frontend     = @{ Dir = 'frontend';     Port = 8080; Check = 'node_modules'; Cmd = 'npm run dev' }
  mobile       = @{ Dir = 'mobile';       Port = 8081; Check = 'node_modules'; Cmd = 'npm run start' }
}
```

New:
```powershell
[CmdletBinding()]
param(
  [ValidateSet('api', 'microservice', 'brainhexpdf', 'frontend', 'mobile')]
  [string[]]$Service = @('api', 'microservice', 'brainhexpdf', 'frontend', 'mobile')
)

$ErrorActionPreference = 'Stop'
$Root = Split-Path -Parent $PSScriptRoot

# nome -> @{ Dir; Cmd; Port; Check }
# brainhexpdf fica FORA do monorepo (repo irmao ../BrainHexPDF) - so roda se
# a pasta existir no mesmo nivel de trailup/. Motor de apresentacao chamado
# pelo microservice via BRAINHEXPDF_API_URL (ver microservice/.env.example).
$services = [ordered]@{
  api          = @{ Dir = 'api';             Port = 8000; Check = '.venv';        Cmd = '.\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000' }
  microservice = @{ Dir = 'microservice';    Port = 3000; Check = 'node_modules'; Cmd = 'npm run dev' }
  brainhexpdf  = @{ Dir = '..\BrainHexPDF';  Port = 3002; Check = 'node_modules'; Cmd = 'npm run dev' }
  frontend     = @{ Dir = 'frontend';        Port = 8080; Check = 'node_modules'; Cmd = 'npm run dev' }
  mobile       = @{ Dir = 'mobile';          Port = 8081; Check = 'node_modules'; Cmd = 'npm run start' }
}
```

- [ ] **Step 2: Atualizar o comentário do parâmetro no topo do arquivo**

Old:
```
.PARAMETER Service
  Lista de servicos a iniciar. Padrao: todos.
  Valores: api, microservice, frontend, mobile
```

New:
```
.PARAMETER Service
  Lista de servicos a iniciar. Padrao: todos.
  Valores: api, microservice, brainhexpdf, frontend, mobile

  brainhexpdf roda a partir de ..\BrainHexPDF (repo irmao, fora do
  monorepo) - pulado automaticamente se essa pasta nao existir no seu
  checkout.
```

- [ ] **Step 3: Testar manualmente**

```powershell
.\scripts\dev.ps1 -Service brainhexpdf
```
Expected: se `../BrainHexPDF` existir com `node_modules` instalado, abre
uma janela nova rodando `npm run dev` nessa pasta na porta 3002. Se a pasta
não existir, imprime "pasta '..\BrainHexPDF' nao encontrada - pulando." e
não quebra o script.

- [ ] **Step 4: Commit**

```bash
git add scripts/dev.ps1
git commit -m "chore: adiciona BrainHexPDF como servico de dev (porta 3002)"
```

### Task 16: Atualizar `CLAUDE.md`

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Adicionar uma nota sobre o BrainHexPDF na seção de arquitetura de personalização**

Logo após o item 1 ("API orquestra, microservice gera mídia...") da lista
"Sistema de personalização — decisões de arquitetura", adicionar:

```markdown
   O `microservice` delega a etapa de **apresentação** (deck + HTML) a um
   serviço externo, `../BrainHexPDF` (fora do monorepo, repo irmão — não
   confundir com o app BrainHex/Google AI Studio mencionado acima), via
   `BRAINHEXPDF_API_URL`/`POST /api/v1/render-and-store`. O BrainHexPDF gera
   o deck (Gemini) e o HTML completo e sobe o arquivo no Supabase Storage;
   o microservice continua dono do merge em `conteudo_personalizado.materiais`
   (`mergePersonalizacaoMateriais`). Ver
   `docs/superpowers/specs/2026-08-15-brainhexpdf-integracao-design.md`.
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: documenta a integracao do BrainHexPDF como motor de apresentacao"
```

---

## Task 17: Revisão final

- [ ] **Step 1: Rodar a suíte completa de novo (após todas as edições de docs)**

```bash
cd "C:/Users/geisb/documents/github/trailup/microservice"
npm run lint && npm test
```
Expected: PASS.

- [ ] **Step 2: Invocar `superpowers:requesting-code-review`**

Use a skill `superpowers:requesting-code-review` para revisar o diff
completo de ambos os repositórios antes de abrir PR/merge — cobre os dois
checkouts (`trailup` e `BrainHexPDF`), já que a mudança é cross-repo.
