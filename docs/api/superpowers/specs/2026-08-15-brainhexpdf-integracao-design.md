# Integração microservice (legado) → BrainHexPDF: Design

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** `microservice/` (legado, chamado internamente de "ApiBrainHex") para de gerar apresentação em imagem/PDF localmente. Ao terminar markdown + áudio, ele chama o microservice externo BrainHexPDF (`https://github.com/Geisbelly/BrainHexPDF`, endpoint `POST /api/v1/render-and-store`), que gera um deck via Gemini, renderiza HTML interativo e sobe pro Supabase Storage com sua própria service role key. O legado recebe só a URL de volta e persiste como material `apresentacao`.

**Architecture:** `runPipeline` ganha um passo novo entre "áudio" e "persistência": chama `brainhexPdfClient.renderAndStore()` passando o markdown já gerado pelo Gemini local como `sourceText`. Geração local de imagem/PDF (`generateSlidesImages`, `generateSlideImage`, `generateSlidesPDF`, `enrichSlidesWithImages`, `pdfService.ts`, `slideEnricher.ts`) é removida — morta, sem outro consumidor.

**Tech Stack:** Node.js/Express + TypeScript (`microservice/`), fetch nativo com `AbortController` p/ timeout, Supabase Storage (bucket `conteudo_aluno`), BrainHexPDF (Node/Express + Gemini SDK, repo externo, já implementado e fora deste repo).

---

## Fluxo end-to-end

```
POST /api/personalizar (ApiTraiUp → microservice/, sem mudança)
  │
  └─ runPipeline (background, setImmediate)
        │
        ├─ 1. fetchFontesAsFileData(fontes)
        ├─ 2. processMediaWithGemini(filesData, profile) → { markdown, audioScript }
        │        (campo "slides" do retorno passa a ser ignorado — não some do
        │         schema Gemini, só não tem mais consumidor no pipeline)
        ├─ 3. generateNaturalAudio(audioScript, voice) → wav/mp3 (falha isolada)
        ├─ 4. brainhexPdfClient.renderAndStore({                      ← NOVO
        │        profile, sourceText: markdown, bucket, storagePath,
        │      }) → { url, storagePath, bucket, slideCount } | null
        │        (falha isolada — não interrompe o job)
        └─ 5. archiveToSupabase({ markdown, audioScript, mp3/wav, apresentacao })
               → mergePersonalizacaoMateriais(personalizacaoId, { audio, markdown, apresentacao })
               → saveMateriaisGerados(...)

--- BrainHexPDF (repo externo, já implementado) ---
  POST /api/v1/render-and-store (requireSecret)
    ├─ gera deck (Gemini) a partir de targetProfile + sourceText
    ├─ generateInteractiveHtml(fullDeck)
    ├─ upload no bucket/storagePath informados (service role key própria)
    └─ retorna { success, url, storage_path, bucket, slide_count }
```

---

## Seção 1: Responsabilidades

| Componente | Responsabilidade |
|---|---|
| `microservice/` (legado) | Download de fontes, Gemini local (markdown + roteiro de áudio), TTS, disparo do BrainHexPDF, persistência de **todos** os materiais (`audio`, `markdown`, `apresentacao`) em `conteudo_personalizado` |
| BrainHexPDF (externo) | Recebe `targetProfile` + `sourceText`, gera deck via Gemini, renderiza HTML interativo, sobe no Supabase Storage (própria service role key), retorna URL pública. **Não escreve em nenhuma tabela.** |
| `conteudo_personalizado.materiais.apresentacao` | Passa a apontar para um arquivo `.html` (`mime_type: text/html; charset=utf-8`) em vez de `.pdf` |

---

## Seção 2: Novo componente — `brainhexPdfClient.ts`

```ts
// microservice/src/services/brainhexPdfClient.ts

export interface RenderAndStoreResult {
  url:         string;
  storagePath: string;
  bucket:      string;
  slideCount:  number;
}

export async function renderAndStore(params: {
  profile:     BrainHexProfile;
  sourceText:  string;       // markdown gerado pelo Gemini local
  classe?:     string;       // default "Turma-Geral" no lado do BrainHexPDF
  bucket:      string;
  storagePath: string;       // ex: `${storagePath}/apresentacao/material-${refId}.html`
}): Promise<RenderAndStoreResult | null> {
  // POST BRAINHEXPDF_URL + "/api/v1/render-and-store"
  // headers: { "x-api-secret": BRAINHEXPDF_SHARED_SECRET, "content-type": "application/json" }
  // body: { targetProfile: params.profile, sourceText: params.sourceText,
  //         classe: params.classe, bucket: params.bucket, storagePath: params.storagePath }
  // timeout: BRAINHEXPDF_TIMEOUT_MS (default 120_000ms) via AbortController
  // Em qualquer falha (rede, timeout, status != 2xx, success:false, JSON inválido):
  //   loga erro com contexto (storagePath, stage retornado pela API se houver) e retorna null.
  //   NUNCA lança — chamador (runPipeline) trata como falha isolada, igual áudio hoje.
}
```

Se `BRAINHEXPDF_URL` não estiver configurado: loga warn uma vez no startup (mesmo padrão de `API_SHARED_SECRET` ausente) e `renderAndStore` retorna `null` imediatamente sem tentar a chamada.

---

## Seção 3: Mudanças em `archiveToSupabase`

**Assinatura atual:**
```ts
slides: any[]; // slides COM imagem_referencia — usado só pra gerar PDF
```

**Assinatura nova:**
```ts
apresentacao: RenderAndStoreResult | null; // vem do brainhexPdfClient.renderAndStore()
```

**Bloco de PDF removido:**
```ts
// REMOVER:
const pdfPath = `${storagePath}/apresentacao/material-${refId}.pdf`;
let pdfUrl: string | null = null;
try {
  const pdfBytes = await generateSlidesPDF(slides, profile);
  pdfUrl = await uploadBuffer(bucket, pdfPath, pdfBytes, "application/pdf");
  ...
} catch (e) { ... }
```

**Entry `apresentacao` nova:**
```ts
apresentacao: {
  payload:      apresentacao ? { url: apresentacao.url, slide_count: apresentacao.slideCount } : null,
  metadata: {
    status:     apresentacao ? "completed" : "failed",
    media_kind: "apresentacao",
    updated_at: now(),
    ...(apresentacao ? { bucket: apresentacao.bucket } : {}),
  },
  arquivo_url:  apresentacao?.url ?? null,
  storage_path: apresentacao?.storagePath ?? null,
  ...(apresentacao ? { bucket: apresentacao.bucket, mime_type: "text/html; charset=utf-8" } : {}),
},
```

Upload do HTML em si **não** passa por `uploadBuffer` do legado — quem sobe é o BrainHexPDF, com a própria service role key. `archiveToSupabase` só registra o resultado.

---

## Seção 4: Mudanças em `runPipeline`

```ts
// runPipeline — ordem nova:
// 1. fetchFontesAsFileData        (sem mudança)
// 2. processMediaWithGemini       (sem mudança na chamada; resultado.slides passa a ser ignorado)
// 3. generateNaturalAudio         (sem mudança)
// 4. NOVO: renderAndStore
const htmlPath = `${storagePath}/apresentacao/material-${refId}.html`;
const apresentacao = await brainhexPdfClient.renderAndStore({
  profile,
  sourceText:  resultado.markdown,
  bucket,
  storagePath: htmlPath,
}); // nunca lança — retorna null em falha, já logado internamente

// 5. archiveToSupabase — troca `slides: slidesComImagens` por `apresentacao`
await archiveToSupabase({
  profile, storagePath, bucket, refId,
  markdown:    resultado.markdown,
  audioScript: resultado.audioScript,
  apresentacao,
  mp3Base64, wavBase64,
  personalizacaoId,
  log: jobLog,
});
```

`generateSlidesImages` (função local em `server.ts`) e a chamada a ela são removidas. `enrichSlidesWithImages` deixa de ser chamado.

---

## Seção 5: Arquivos removidos (dead code após a mudança)

| Arquivo | Motivo |
|---|---|
| `microservice/src/services/pdfService.ts` | Só usado por `generateSlidesPDF`, que some do pipeline |
| `microservice/src/lib/slideEnricher.ts` | Só usado por `enrichSlidesWithImages`, que some do pipeline |
| `generateSlideImage` (em `geminiService.ts`) | Só usado pela geração de imagem local — remover a função, manter `processMediaWithGemini` e `generateNaturalAudio` |

> Confirmar em cada arquivo que não há outro import (ex.: testes, rotas antigas tipo `/api/v1/generate-slide-decorations` do BrainHexPDF **não** é este repo — aqui é só `microservice/` do TrailUp) antes de apagar.

---

## Seção 6: Variáveis de ambiente novas (`microservice/.env`)

| Variável | Obrigatória | Default | Descrição |
|---|---|---|---|
| `BRAINHEXPDF_URL` | Não (mas sem ela o passo é pulado) | — | URL base do serviço BrainHexPDF, ex: `https://brainhexpdf.onrender.com` |
| `BRAINHEXPDF_SHARED_SECRET` | Não | — | Enviado como header `x-api-secret`. Deve bater com `API_SHARED_SECRET` configurado no BrainHexPDF |
| `BRAINHEXPDF_TIMEOUT_MS` | Não | `120000` | Timeout duro da chamada HTTP (geração via Gemini no BrainHexPDF pode demorar) |

No lado do BrainHexPDF (`.env`, repo externo, fora deste monorepo): `API_SHARED_SECRET` (mesmo valor de `BRAINHEXPDF_SHARED_SECRET` acima) e `SUPABASE_SERVICE_ROLE_KEY`/`SUPABASE_URL` já documentados no `.env.example` dele.

---

## Seção 7: Tratamento de Erros

| Cenário | Comportamento |
|---|---|
| `BRAINHEXPDF_URL` não configurada | `renderAndStore` retorna `null` sem tentar HTTP; log warn único no startup |
| BrainHexPDF fora do ar / timeout | `renderAndStore` retorna `null`; `apresentacao.metadata.status = "failed"`; markdown/áudio persistem normalmente |
| BrainHexPDF responde `success:false` (qualquer `stage`) | Idem acima — loga `stage` + `error` retornados pela API |
| `x-api-secret` errado (401) | Idem — loga status 401 explicitamente (erro de config, não transiente) |
| `generateNaturalAudio` falha | Sem mudança — já isolado hoje |
| Timeout geral do job (`MAX_JOB_DURATION_MS`) | Sem mudança — `Promise.race` já cobre a chamada nova, já que ela está dentro de `runPipeline` |

---

## Seção 8: O que NÃO muda

- `POST /api/personalizar` (contrato ApiTraiUp → `microservice/`) — sem mudança de payload
- `mergePersonalizacaoMateriais` / RPC `merge_personalizacao_materiais` — sem mudança de assinatura, só o conteúdo do updates
- `markdown` e `audio` — geração e persistência inalteradas
- Autenticação/rate-limit/heartbeat/recovery de jobs órfãos do `microservice/` — sem mudança
- ApiTraiUp (Python) — nenhuma mudança neste momento; quem chama o BrainHexPDF é o `microservice/` Node, não o Python

---

## Seção 9: Testes

| Teste | O que cobre |
|---|---|
| `brainhexPdfClient.test.ts` (novo) | sucesso (mock 200 + success:true), 401, timeout (AbortController), `success:false`, `BRAINHEXPDF_URL` ausente → sempre retorna `null` sem lançar exceto no caso de sucesso |
| `archiveToSupabase` (teste existente, ajustar) | entry `apresentacao` monta certo a partir de `RenderAndStoreResult \| null`; remover asserts sobre PDF/imagem |
| Testes de `pdfService.ts` / `slideEnricher.ts` | Remover junto com os arquivos |

---

## Arquivos por repositório

### `microservice/` (este repo)
```
src/services/brainhexPdfClient.ts       criar
src/services/geminiService.ts           modificar (remover generateSlideImage)
server.ts                                modificar (runPipeline, archiveToSupabase, remove generateSlidesImages)
src/services/pdfService.ts               deletar
src/lib/slideEnricher.ts                 deletar
.env.example                             adicionar BRAINHEXPDF_*
```

### BrainHexPDF (repo externo — fora deste monorepo, sem mudança)
```
server.ts   já tem /api/v1/render-and-store implementado — nenhuma mudança necessária
```
