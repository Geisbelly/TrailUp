# Slides Imersivos — Wiring no Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ligar o motor de slides imersivos (já construído e revisado em `feature/slides-imersivos-fundacao`: `generateImmersiveSlideHtml`, `buildImmersiveDeckHtml`, `validateSlideHtml`) no pipeline real de `/api/personalizar`, atrás de um feature flag desligado por padrão, sem alterar o comportamento de ninguém que não ligar o flag.

**Architecture:** Reusa a decisão de conteúdo existente (lotes por bloco → `SlideContent[]` estruturado, inalterado) e só troca "como isso vira HTML visual": quando o flag está ligado E o deck não foi dividido em múltiplas partes (limitação explícita desta rodada — ver "Riscos aceitos"), substitui a etapa de gerar imagem de cena/ícone + `buildDeckHtml` por uma chamada Gemini por slide (`generateImmersiveSlideHtml`, concorrente com limite) + `buildImmersiveDeckHtml`. Em qualquer falha do motor imersivo (uma chamada exaure tentativas, por exemplo), cai de volta pro pipeline atual (imagem + template) para aquela geração — nunca falha a personalização inteira por causa do motor novo.

**Tech Stack:** TypeScript (microservice), `node:test`, infraestrutura de concorrência já existente (`mapWithConcurrency`).

**Spec:** `docs/superpowers/specs/2026-08-03-slides-imersivos-html-ia-design.md`
**Plano anterior (já implementado, mergeado nesta branch):** `docs/superpowers/plans/2026-08-03-slides-imersivos-fundacao.md`

---

## Decisões de escopo desta rodada (confirmadas com o usuário)

1. **Reusa a decisão de conteúdo atual.** Não muda como `processMediaWithGemini`/lotes de bloco decidem quantos slides e o que cada um contém — só troca a renderização visual.
2. **Elimina geração de imagem de cena/ícone pra decks que usarem o motor imersivo.** A IA desenha tudo via CSS/HTML/JS — sem custo/latência extra de Gemini/OpenAI image gen nesse caminho.
3. **Feature flag desligado por padrão** (`PRESENTATION_ENGINE_IMMERSIVE_ENABLED`), seguindo o precedente já existente no código (`ENABLE_OPENAI_FULL_SLIDE_IMAGES`).
4. **Geração concorrente com limite** (não sequencial) — a consistência visual entre slides vem do brief de design compartilhado por perfil (`buildPresentationDesignPlan`), não de encadeamento slide-a-slide.
5. **NÃO incrementa `PRESENTATION_ENGINE_VERSION`/`PRESENTATION_DESIGN_VERSION` nesta rodada.** O gate de compatibilidade entre `api/` e `microservice/` (`server.ts:1336-1354`) é comparação exata de string contra uma constante global — incrementar agora quebraria com 409 todo `/api/personalizar` real até o lado Python (`api/app/services/media_contract.py`) ser atualizado no mesmo deploy. Como o flag nasce desligado, o comportamento padrão não muda, então não há motivo pra forçar essa coordenação de deploy agora. O bump fica documentado como pré-requisito operacional de quando o flag for realmente ligado em produção (fora do escopo deste plano).
6. **Limitação aceita: só decks de 1 parte usam o motor imersivo.** `archiveMultiPartToSupabase` divide decks grandes em múltiplos arquivos HTML paginados (`parts.length > 1`) pra o mobile carregar sob demanda — o motor imersivo produz UM documento autocontido com navegação por iframe, incompatível com essa paginação sem uma mudança maior (fora de escopo). Quando `partsForAudio.length > 1`, a geração cai automaticamente pro pipeline atual mesmo com o flag ligado.

---

## Estrutura de arquivos

- **Modificar:** `microservice/src/services/geminiService.ts` — nova função `renderImmersiveSlides()`.
- **Modificar:** `microservice/src/services/geminiImmersiveSlide.test.ts` — testes de `renderImmersiveSlides()` (mesmo arquivo de teste da Task 3 do plano anterior, já registrado no `package.json`).
- **Modificar:** `microservice/server.ts` — flag, wiring em `runPipeline`, extensão de `archiveMultiPartToSupabase`/`buildPresentationMaterialMetadata`.
- **Modificar:** `microservice/src/server.test.ts` — testes do novo branch behind o flag.
- **Modificar:** `microservice/.env.example` — documenta o novo flag + variável de concorrência.

---

## Task 1: `renderImmersiveSlides()` — orquestra a geração concorrente do deck

**Files:**
- Modify: `microservice/src/services/geminiService.ts`
- Test: `microservice/src/services/geminiImmersiveSlide.test.ts`

- [ ] **Step 1: Escrever os testes que falham**

Adicione ao FINAL de `microservice/src/services/geminiImmersiveSlide.test.ts` (não remova nada existente):

```typescript
test("renderImmersiveSlides gera 1 chamada por slide, na ordem, e monta o deck", async () => {
  const slides = [
    { title: "Slide 1", topics: ["a"], explanation: "exp1", visualDescription: "vd1", characterQuote: "q1", characterAction: "explaining" as const, imagePrompt: "", iconPrompts: [], sourceIds: [] },
    { title: "Slide 2", topics: ["b"], explanation: "exp2", visualDescription: "vd2", characterQuote: "q2", characterAction: "explaining" as const, imagePrompt: "", iconPrompts: [], sourceIds: [] },
  ];
  const calls: Array<{ index: number; contentSummary: string }> = [];
  const fakeGenerate = async (input: ImmersiveSlideInput) => {
    calls.push({ index: input.index, contentSummary: input.contentSummary });
    return `<section>slide ${input.index}</section>`;
  };

  const deckHtml = await renderImmersiveSlides(slides, "mastermind", { generateSlideFn: fakeGenerate });

  assert.equal(calls.length, 2);
  assert.equal(calls[0].index, 0);
  assert.equal(calls[1].index, 1);
  assert.match(calls[0].contentSummary, /Slide 1/);
  assert.match(calls[0].contentSummary, /exp1/);
  assert.match(deckHtml, /<iframe/);
});

test("renderImmersiveSlides propaga o erro se qualquer slide falhar (sem deck parcial)", async () => {
  let calls = 0;
  const fakeGenerate = async (input: ImmersiveSlideInput) => {
    calls += 1;
    if (input.index === 1) throw new Error("falha simulada no slide 2");
    return `<section>slide ${input.index}</section>`;
  };
  const slides = [
    { title: "Slide 1", topics: [], explanation: "", visualDescription: "", characterQuote: "", characterAction: "explaining" as const, imagePrompt: "", iconPrompts: [], sourceIds: [] },
    { title: "Slide 2", topics: [], explanation: "", visualDescription: "", characterQuote: "", characterAction: "explaining" as const, imagePrompt: "", iconPrompts: [], sourceIds: [] },
  ];

  await assert.rejects(
    () => renderImmersiveSlides(slides, "seeker", { generateSlideFn: fakeGenerate }),
    /falha simulada no slide 2/,
  );
});

test("renderImmersiveSlides respeita o limite de concorrência informado", async () => {
  let inFlight = 0;
  let maxInFlight = 0;
  const fakeGenerate = async (input: ImmersiveSlideInput) => {
    inFlight += 1;
    maxInFlight = Math.max(maxInFlight, inFlight);
    await new Promise((resolve) => setTimeout(resolve, 5));
    inFlight -= 1;
    return `<section>${input.index}</section>`;
  };
  const slides = Array.from({ length: 6 }, (_, i) => ({
    title: `Slide ${i}`, topics: [], explanation: "", visualDescription: "",
    characterQuote: "", characterAction: "explaining" as const, imagePrompt: "", iconPrompts: [], sourceIds: [],
  }));

  await renderImmersiveSlides(slides, "achiever", { generateSlideFn: fakeGenerate, concurrency: 2 });

  assert.ok(maxInFlight <= 2, `esperava no maximo 2 chamadas simultaneas, teve ${maxInFlight}`);
});
```

No topo do arquivo, adicione aos imports existentes de `"./geminiService"`:

```typescript
import { renderImmersiveSlides } from "./geminiService";
import type { ImmersiveSlideInput } from "./geminiService";
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `cd microservice && npx tsx --test src/services/geminiImmersiveSlide.test.ts`
Expected: FAIL — `renderImmersiveSlides is not a function` (ou export ausente)

- [ ] **Step 3: Implementar `renderImmersiveSlides`**

Em `microservice/src/services/geminiService.ts`, confirme que `mapWithConcurrency` de `../lib/boundedConcurrency` e `SlideContent` de `../types/index` já estão importados no topo do arquivo (são usados em outras funções deste mesmo arquivo) — se `mapWithConcurrency` não estiver importado ainda, adicione:

```typescript
import { mapWithConcurrency } from "../lib/boundedConcurrency";
```

Adicione a função logo depois de `generateImmersiveSlideHtml` (a função da Task 3 do plano anterior):

```typescript
const DEFAULT_IMMERSIVE_SLIDE_CONCURRENCY = 3;
const MAX_IMMERSIVE_SLIDE_CONCURRENCY = 6;

function resolveImmersiveSlideConcurrency(
  environment: Record<string, string | undefined> = process.env,
): number {
  const parsed = Number(environment.PRESENTATION_IMMERSIVE_SLIDE_CONCURRENCY);
  if (!Number.isInteger(parsed) || parsed < 1) return DEFAULT_IMMERSIVE_SLIDE_CONCURRENCY;
  return Math.min(parsed, MAX_IMMERSIVE_SLIDE_CONCURRENCY);
}

function slideContentSummary(slide: SlideContent): string {
  return [
    slide.title,
    (slide.topics ?? []).join("; "),
    slide.explanation,
    slide.visualDescription,
    slide.characterQuote,
  ].filter(Boolean).join("\n");
}

export interface RenderImmersiveSlidesOptions {
  concurrency?: number;
  keysConfig?: ApiKeysConfig;
  generateSlideFn?: (input: ImmersiveSlideInput) => Promise<string>;
}

/**
 * Gera o deck imersivo completo a partir do array de SlideContent já
 * decidido pelo pipeline existente (lotes por bloco, inalterado) — uma
 * chamada Gemini por slide, concorrente com limite (não sequencial: a
 * consistência visual vem do brief de design compartilhado por perfil, não
 * de encadeamento slide-a-slide). Se QUALQUER slide falhar após esgotar as
 * tentativas internas de generateImmersiveSlideHtml, propaga o erro — não
 * existe "deck parcialmente imersivo"; o chamador decide o fallback.
 */
export async function renderImmersiveSlides(
  slides: SlideContent[],
  profile: BrainHexProfile,
  options: RenderImmersiveSlidesOptions = {},
): Promise<string> {
  const generateSlide = options.generateSlideFn ?? generateImmersiveSlideHtml;
  const concurrency = Math.max(1, options.concurrency ?? resolveImmersiveSlideConcurrency());

  const htmls = await mapWithConcurrency(slides, concurrency, async (slide, index) =>
    generateSlide({
      index,
      total: slides.length,
      contentSummary: slideContentSummary(slide),
      profile,
    }));

  return buildImmersiveDeckHtml(htmls, profile);
}
```

Confirme que `buildImmersiveDeckHtml` já está importado no topo do arquivo (de `../lib/slideShell`) — foi adicionado pela Task 2 do plano anterior; se por algum motivo não estiver, adicione:

```typescript
import { buildImmersiveDeckHtml } from "../lib/slideShell";
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `cd microservice && npx tsx --test src/services/geminiImmersiveSlide.test.ts`
Expected: PASS (9 testes — os 6 já existentes da Task 3 anterior + os 3 novos)

- [ ] **Step 5: Rodar a suíte inteira e commitar**

Run: `cd microservice && npm test`
Expected: todos os testes passam (não precisa adicionar nada novo ao `package.json` — o arquivo de teste já está registrado desde o plano anterior).

```bash
git add microservice/src/services/geminiService.ts microservice/src/services/geminiImmersiveSlide.test.ts
git commit -m "feat(microservice): orquestra geracao concorrente do deck imersivo por slide"
```

---

## Task 2: Feature flag + wiring em `runPipeline`/`archiveMultiPartToSupabase`

**Files:**
- Modify: `microservice/server.ts`
- Test: `microservice/src/server.test.ts`

- [ ] **Step 1: Ler o estado atual da função pra confirmar os pontos de inserção**

Leia `microservice/server.ts` nas faixas: `195-263` (`renderAndUploadPresentation`/`buildPresentationMaterialMetadata`), `443-625` (`archiveMultiPartToSupabase`), `742-890` (`runPipeline`). Confirme que o código bate com as citações de linha abaixo antes de editar — se o arquivo tiver mudado, ajuste os pontos de inserção mantendo a mesma lógica.

- [ ] **Step 2: Adicionar o flag e o import**

No topo de `microservice/server.ts`, junto aos outros imports de `./src/services/geminiService`, adicione `renderImmersiveSlides`:

```typescript
import { renderImmersiveSlides } from "./src/services/geminiService";
```

Perto de onde `buildPresentationMaterialMetadata`/`renderAndUploadPresentation` são declaradas (por volta da linha 195, antes dessas funções), adicione:

```typescript
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

- [ ] **Step 3: Estender `buildPresentationMaterialMetadata` com um marcador opcional de variante de motor**

Localize a função `buildPresentationMaterialMetadata` (linha ~242) e troque:

```typescript
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

por (adiciona só o campo `engineVariant` opcional e seu espalhamento condicional — resto idêntico):

```typescript
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

- [ ] **Step 4: Estender `archiveMultiPartToSupabase` pra aceitar um HTML de apresentação pré-montado**

Na assinatura de `archiveMultiPartToSupabase` (linha ~443), adicione o novo parâmetro opcional:

```typescript
async function archiveMultiPartToSupabase(params: {
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
}): Promise<{
```

Dentro do `for (const part of parts)` (linha ~470), troque o bloco que chama `renderAndUploadPresentation`:

```typescript
    const presentationPath = `${storagePath}/apresentacao/material-${refId}${suffix}.html`;
    const presentationResult = await renderAndUploadPresentation({
      slides: part.slides,
      profile,
      presentationTheme,
      bucket,
      presentationPath,
    });
```

por:

```typescript
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

(Isso funciona porque `renderAndUploadPresentation` já aceita `buildHtml?: typeof buildDeckHtml` como override — ver `server.ts:201,204,209` — sem precisar mudar a assinatura dessa função. `prebuiltPresentationHtml` só deve ser passado quando `parts.length === 1`, garantido pelo chamador em `runPipeline`, então o `for` só executa esse ramo uma vez na prática.)

Por fim, no objeto `updates.apresentacao` dentro da mesma função (linha ~589), passe a variante pro metadata:

```typescript
      apresentacao: {
        payload: {
          slides: parts.flatMap((p) => p.slides),
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

- [ ] **Step 5: Ligar no `runPipeline`**

Localize o trecho em `runPipeline` (linha ~793-846, entre a montagem de `partsForAudio` e o recálculo de `finalParts`) e troque:

```typescript
  const assetsPromise = generateFullSlideImages(
    resultado.slides,
    profile,
    presentationPlan,
  );
  const [audioSettled, [assetsResult]] = await Promise.all([
    Promise.allSettled(partsForAudio.map((part) => generatePartAudio(part.audioScript))),
    Promise.allSettled([assetsPromise]),
  ]);

  const audioByPart = audioSettled.map((result, index) => {
    if (result.status === "fulfilled") {
      return { mp3Base64: result.value.mp3 ?? null, wavBase64: result.value.wav ?? null };
    }
    jobLog.error("falha no áudio de uma parte", { parte: index + 1, err: result.reason });
    return { mp3Base64: null, wavBase64: null };
  });

  // Assets de slide (imagens/icones) sao tratados como o audio: uma falha
  // aqui nao pode descartar markdown/audio, que ja podem ter sido gerados
  // com sucesso. Sem isso, um throw aqui abortava a funcao ANTES de chamar
  // archiveMultiPartToSupabase, perdendo midias ja prontas que deveriam ser
  // persistidas independentemente (ver comentario de archiveMultiPartToSupabase).
  let slidesComImagens = resultado.slides;
  if (assetsResult.status === "fulfilled") {
    const assets = assetsResult.value;
    slidesComImagens = enrichSlidesWithImages(resultado.slides, assets.imagem_referencia, assets.icones, assets.renderMode);
  } else {
    jobLog.error("falha nos assets de slide", { err: assetsResult.reason });
  }
```

por:

```typescript
  // So decks de 1 parte usam o motor imersivo - ver decisao 6 no plano
  // desta task (paginacao multi-parte do mobile e incompativel com o
  // documento autocontido do motor imersivo).
  const useImmersiveEngine = PRESENTATION_ENGINE_IMMERSIVE_ENABLED && partsForAudio.length === 1;

  const assetsPromise = useImmersiveEngine
    ? Promise.resolve(null)
    : generateFullSlideImages(resultado.slides, profile, presentationPlan);
  const [audioSettled, [assetsResult]] = await Promise.all([
    Promise.allSettled(partsForAudio.map((part) => generatePartAudio(part.audioScript))),
    Promise.allSettled([assetsPromise]),
  ]);

  const audioByPart = audioSettled.map((result, index) => {
    if (result.status === "fulfilled") {
      return { mp3Base64: result.value.mp3 ?? null, wavBase64: result.value.wav ?? null };
    }
    jobLog.error("falha no áudio de uma parte", { parte: index + 1, err: result.reason });
    return { mp3Base64: null, wavBase64: null };
  });

  // Assets de slide (imagens/icones) sao tratados como o audio: uma falha
  // aqui nao pode descartar markdown/audio, que ja podem ter sido gerados
  // com sucesso. Sem isso, um throw aqui abortava a funcao ANTES de chamar
  // archiveMultiPartToSupabase, perdendo midias ja prontas que deveriam ser
  // persistidas independentemente (ver comentario de archiveMultiPartToSupabase).
  let slidesComImagens = resultado.slides;
  let immersiveDeckHtml: string | null = null;
  if (useImmersiveEngine) {
    try {
      immersiveDeckHtml = await renderImmersiveSlides(resultado.slides, profile);
    } catch (error) {
      jobLog.error("falha no motor imersivo; caindo para o pipeline de imagem+template", { err: error });
    }
  }
  if (!immersiveDeckHtml && !useImmersiveEngine) {
    if (assetsResult.status === "fulfilled" && assetsResult.value) {
      const assets = assetsResult.value;
      slidesComImagens = enrichSlidesWithImages(resultado.slides, assets.imagem_referencia, assets.icones, assets.renderMode);
    } else if (assetsResult.status === "rejected") {
      jobLog.error("falha nos assets de slide", { err: assetsResult.reason });
    }
  } else if (!immersiveDeckHtml && useImmersiveEngine) {
    // motor imersivo falhou (catch acima) - cai pro pipeline de imagem
    // mesmo com o flag ligado, gerando os assets que nao foram pedidos antes.
    const fallbackAssets = await generateFullSlideImages(resultado.slides, profile, presentationPlan)
      .catch((err) => {
        jobLog.error("falha nos assets de slide (fallback do motor imersivo)", { err });
        return null;
      });
    if (fallbackAssets) {
      slidesComImagens = enrichSlidesWithImages(resultado.slides, fallbackAssets.imagem_referencia, fallbackAssets.icones, fallbackAssets.renderMode);
    }
  }
```

Por fim, na chamada de `archiveMultiPartToSupabase` (linha ~863-873), adicione o novo campo:

```typescript
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
  });
```

- [ ] **Step 6: Escrever os testes que faltam em `server.test.ts`**

Adicione ao final de `microservice/src/server.test.ts` (leia o topo do arquivo primeiro pra confirmar o padrão de mock/fixture já usado — provavelmente monta um `app` de teste com `buildApp()` e injeta dependências via `monkeypatch`-like overrides ou variáveis de módulo; siga exatamente o padrão já existente nos testes vizinhos de `runPipeline`/`archiveMultiPartToSupabase`, adaptando os nomes de mock ao que já existe no arquivo em vez de inventar um mecanismo novo):

```typescript
test("archiveMultiPartToSupabase usa o HTML pre-montado quando prebuiltPresentationHtml e informado", async () => {
  // Arrange: 1 parte, prebuiltPresentationHtml definido.
  // Act: chama archiveMultiPartToSupabase com esse parametro.
  // Assert: renderAndUploadPresentation (ou o buildHtml efetivamente usado)
  // recebeu uma funcao que retorna o HTML pre-montado, nao buildDeckHtml
  // default - e materiais.apresentacao.metadata.engine_variant === "immersive".
});

test("runPipeline cai pro pipeline de imagem+template quando o deck tem mais de 1 parte, mesmo com o flag ligado", async () => {
  // Arrange: PRESENTATION_ENGINE_IMMERSIVE_ENABLED=true, conteudo grande o
  // suficiente para splitProcessedContentIntoParts retornar > 1 parte.
  // Assert: generateFullSlideImages foi chamada (pipeline antigo), o motor
  // imersivo (renderImmersiveSlides) NAO foi chamado.
});

test("runPipeline cai pro pipeline de imagem+template se o motor imersivo falhar", async () => {
  // Arrange: flag ligado, 1 parte, renderImmersiveSlides mockado pra rejeitar.
  // Assert: generateFullSlideImages E chamada como fallback (nao propaga o erro
  // do motor imersivo pra fora de runPipeline).
});
```

Escreva o corpo completo de cada teste (arrange/act/assert reais, não os comentários acima) seguindo o padrão exato de mocking/injeção de dependência já usado nos testes vizinhos deste mesmo arquivo para `runPipeline`/`archiveMultiPartToSupabase`/`generateFullSlideImages`. Se o padrão existente não expuser um jeito direto de injetar `renderImmersiveSlides`/`generateFullSlideImages` nesses testes, pare e reporte NEEDS_CONTEXT em vez de inventar um mecanismo de mock novo — este é exatamente o tipo de decisão que deve ser escalada, não resolvida sozinho.

- [ ] **Step 7: Rodar os testes e confirmar que passam**

Run: `cd microservice && npm test`
Expected: todos os testes passam, incluindo os novos.

- [ ] **Step 8: Rodar o typecheck**

Run: `cd microservice && npx tsc --noEmit`
Expected: sem erros.

- [ ] **Step 9: Commitar**

```bash
git add microservice/server.ts microservice/src/server.test.ts
git commit -m "feat(microservice): liga motor imersivo no pipeline atras de feature flag"
```

---

## Task 3: Documentar o flag e a variável de concorrência

**Files:**
- Modify: `microservice/.env.example`

- [ ] **Step 1: Adicionar as novas variáveis**

Abra `microservice/.env.example`, localize a linha de `ENABLE_OPENAI_FULL_SLIDE_IMAGES` (documentando o flag irmão) e adicione logo depois:

```bash
# Motor de slides imersivos (IA gera HTML/CSS/JS por slide em vez de
# template + imagem de cena/icone). Desligado por padrao. So decks de 1
# parte usam o motor imersivo mesmo com isto ligado (decks divididos em
# multiplas partes sempre usam o pipeline atual). NAO muda
# PRESENTATION_ENGINE_VERSION/PRESENTATION_DESIGN_VERSION - ver plano
# docs/superpowers/plans/2026-08-03-slides-imersivos-wiring.md.
PRESENTATION_ENGINE_IMMERSIVE_ENABLED=false
# Chamadas Gemini concorrentes por deck ao gerar slides imersivos (min 1, max 6).
PRESENTATION_IMMERSIVE_SLIDE_CONCURRENCY=3
```

- [ ] **Step 2: Commitar**

```bash
git add microservice/.env.example
git commit -m "docs(microservice): documenta flag e concorrencia do motor imersivo"
```

---

## Riscos aceitos

- **Só decks de 1 parte usam o motor imersivo** (decisão 6). Decks grandes continuam no pipeline atual até uma rodada futura resolver a interação com paginação multi-parte.
- **Bump de versão fica pra depois** (decisão 5) — quando alguém decidir ligar o flag em produção de fato, isso precisa ser coordenado com um deploy simultâneo de `api/app/services/media_contract.py` (mesmos valores literais) pra não gerar 409 em massa.
- **Geração concorrente, não sequencial** (decisão 4) — leve risco de deriva visual entre slides adjacentes, mitigado pelo brief de design compartilhado (mesma decisão já aceita como risco no plano anterior).

## Self-Review

- **Cobertura da spec/decisões:** reuso da decisão de conteúdo (Task 1, `slideContentSummary` deriva do `SlideContent` já existente), eliminação de imagem de cena/ícone no caminho imersivo (Task 2, `assetsPromise` só roda quando `!useImmersiveEngine`), flag desligado por padrão (Task 2 Step 2), concorrência com limite (Task 1, `mapWithConcurrency`), sem bump de versão (Task 2 não toca `pipelineVersions.ts`), limitação de 1 parte (Task 2 Step 5, `partsForAudio.length === 1`), fallback em qualquer falha do motor imersivo (Task 2 Step 5, bloco `catch`/fallback).
- **Sem placeholders de código** — única exceção deliberada: os 3 testes do Step 6 da Task 2 têm arrange/act/assert descritos em prosa em vez de código completo, porque dependem do padrão de mock já existente em `server.test.ts` que eu não tenho em mãos neste momento — o step já instrui explicitamente a escalar (NEEDS_CONTEXT) em vez de inventar um mecanismo, então isso é uma decisão consciente, não um placeholder esquecido.
- **Consistência de tipos:** `ImmersiveSlideInput`/`generateImmersiveSlideHtml` usados em `renderImmersiveSlides` (Task 1) são exatamente os mesmos já definidos/testados no plano anterior — nenhum campo novo inventado.
