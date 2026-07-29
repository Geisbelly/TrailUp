# Slide inteiro como imagem única (gpt-image-1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Gerar cada slide da apresentação personalizada como uma única imagem via `gpt-image-1` (fundo + título + corpo + identidade do perfil embutidos no prompt), com fallback automático por slide para o pipeline HTML atual quando a geração falhar.

**Architecture:** Novo caminho `generateFullSlideImages` em `src/lib/slideAssetGenerator.ts` substitui `generateSlideAssets` apenas no fluxo principal (`runPipeline`/`runPersonalizacaoJob`). `slideTemplate.ts` ganha um branch que, quando `renderMode === "full-image"`, renderiza só a imagem full-bleed (sem título/corpo/badge/footer em HTML). O endpoint `/api/v1/archive` (que recebe cenas prontas do cliente) não é tocado — continua exatamente como hoje.

**Tech Stack:** TypeScript, Node.js, `openai` SDK (`gpt-image-1`), Puppeteer (renderização HTML→PDF, inalterada), `node:test` + `node:assert/strict`.

**Spec:** `docs/superpowers/specs/2026-07-28-slide-imagem-unica-design.md`

---

## Contexto para quem for executar

Hoje, `server.ts` gera para cada slide: 1 cena de fundo sem texto via OpenAI
(`generateSceneImage`) + ícones via Gemini com contingência OpenAI
(`generateSlideIconWithFallback`), e `slideTemplate.ts` desenha título/corpo/
ícone/badge em HTML por cima, renderizado a PDF via Puppeteer
(`pdfService.ts`). Isso muda: a IA passa a gerar o slide inteiro (fundo +
título + corpo já embutidos), aceitando o risco de texto sair incorreto em
troca de menos chamadas de imagem por slide.

Um circuito de fail-fast para o hard-limit de billing da OpenAI já existe em
`microservice/src/services/openaiImageService.ts`
(`isOpenAiBillingHardLimitError`, `resetOpenAiImageCircuit`,
`openaiImageUnavailableUntil`) — implementado numa sessão anterior desta
mesma investigação. Este plano reaproveita esse circuito; não o recria.

**Descoberta importante durante o planejamento:** o slide final é
1280×720px (16:9 exato, ver `BASE_CSS` em `slideTemplate.ts:409-411`), mas
`gpt-image-1` só gera em `1024x1024`, `1024x1536` ou `1536x1024` — não em
16:9 exato. `1536x1024` (razão 3:2) é o mais próximo. Ao encaixar essa
imagem num container 1280×720 com `object-fit: cover`, o navegador escala
até a largura bater (1536→1280, fator 0.833), resultando em altura
853px > 720px — ou seja, **~133px de sobra são cortados, ~67px do topo e
~67px da base** (em pixels da tela final; proporcionalmente, os ~8% do
topo e ~8% da base da imagem original de 1024px de altura). Por isso o
prompt do slide cheio precisa instruir o modelo a manter texto/elementos
importantes fora dessas margens.

Existe um SEGUNDO ponto no código que gera assets de slide
(`server.ts:899-925`, dentro da rota `/api/v1/archive`) que já recebe cenas
prontas do frontend e só gera ícones. Esse caminho **não muda neste plano**
— ele continua usando `generateSceneImages`/`generateSlideIcons`/
`generateSlideAssets` exatamente como hoje. Só o `runPipeline` (usado por
`runPersonalizacaoJob`, o fluxo principal do job assíncrono) passa a usar
`generateFullSlideImages`.

---

### Task 1: `openaiImageService.ts` — override de `quality` por chamada

**Files:**
- Modify: `microservice/src/services/openaiImageService.ts:14-90`
- Test: `microservice/src/services/openaiImageService.test.ts`

- [ ] **Step 1: Write the failing test**

Adicione ao final de `microservice/src/services/openaiImageService.test.ts`:

```ts
test("override de quality por chamada tem precedencia sobre OPENAI_IMAGE_QUALITY", async () => {
  resetOpenAiImageCircuit();
  const original = process.env.OPENAI_IMAGE_QUALITY;
  process.env.OPENAI_IMAGE_QUALITY = "low";
  try {
    let receivedQuality: unknown;
    const generate = async (args: { quality?: string }) => {
      receivedQuality = args.quality;
      return { data: [{ b64_json: "abc" }] };
    };
    await generateDecorativeIconImage("icone", 0, 0, { generate, quality: "high" });
    assert.equal(receivedQuality, "high");
  } finally {
    if (original !== undefined) process.env.OPENAI_IMAGE_QUALITY = original;
    else delete process.env.OPENAI_IMAGE_QUALITY;
  }
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd microservice && node --import tsx --import ./src/testSetup.ts --test src/services/openaiImageService.test.ts`

Expected: FAIL — `assert.equal(receivedQuality, "high")` falha porque `receivedQuality` vem `"low"` (o override `quality` ainda não existe no código, então `generateImageBase64` só lê `process.env.OPENAI_IMAGE_QUALITY`).

- [ ] **Step 3: Write minimal implementation**

Em `microservice/src/services/openaiImageService.ts`, no bloco `OpenAiImageOverrides` (linha 23-26), adicione o campo `quality`:

```ts
export interface OpenAiImageOverrides {
  now?: () => number;
  generate?: (args: OpenAiImageGenerateArgs) => Promise<OpenAiImageGenerateResult>;
  quality?: OpenAiImageGenerateArgs["quality"];
}
```

No tipo de parâmetro de `generateImageBase64` (linha 63-71), adicione o mesmo campo:

```ts
async function generateImageBase64(params: {
  prompt: string;
  prefix: string;
  size: "1024x1024" | "1536x1024";
  retries: number;
  attempt: number;
  now?: () => number;
  generate?: (args: OpenAiImageGenerateArgs) => Promise<OpenAiImageGenerateResult>;
  quality?: OpenAiImageGenerateArgs["quality"];
}): Promise<string> {
```

Na linha 81 (leitura da qualidade), troque:

```ts
  const quality = (String(process.env.OPENAI_IMAGE_QUALITY ?? "").trim() || "medium") as OpenAiImageGenerateArgs["quality"];
```

por:

```ts
  const quality = params.quality
    ?? (String(process.env.OPENAI_IMAGE_QUALITY ?? "").trim() || "medium") as OpenAiImageGenerateArgs["quality"];
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd microservice && node --import tsx --import ./src/testSetup.ts --test src/services/openaiImageService.test.ts`

Expected: PASS (todos os testes do arquivo, incluindo os 4 já existentes).

- [ ] **Step 5: Commit**

```bash
git add microservice/src/services/openaiImageService.ts microservice/src/services/openaiImageService.test.ts
git commit -m "feat(microservice): permite override de quality por chamada na geracao de imagem OpenAI"
```

---

### Task 2: `openaiImageService.ts` — `generateFullSlideImage`

**Files:**
- Modify: `microservice/src/services/openaiImageService.ts`
- Test: `microservice/src/services/openaiImageService.test.ts`

- [ ] **Step 1: Write the failing test**

No topo de `microservice/src/services/openaiImageService.test.ts`, adicione `generateFullSlideImage` ao import existente:

```ts
import {
  generateDecorativeIconImage,
  generateFullSlideImage,
  generateSceneImage,
  isOpenAiBillingHardLimitError,
  resetOpenAiImageCircuit,
} from "./openaiImageService";
```

Adicione ao final do arquivo:

```ts
test("generateFullSlideImage usa OPENAI_SLIDE_IMAGE_QUALITY (padrao high) e tamanho 1536x1024", async () => {
  resetOpenAiImageCircuit();
  let receivedArgs: any;
  const generate = async (args: any) => {
    receivedArgs = args;
    return { data: [{ b64_json: "slide-abc" }] };
  };
  const image = await generateFullSlideImage("titulo e corpo do slide", 0, 0, { generate });
  assert.equal(image, "slide-abc");
  assert.equal(receivedArgs.quality, "high");
  assert.equal(receivedArgs.size, "1536x1024");
  assert.ok(receivedArgs.prompt.includes("titulo e corpo do slide"));
});

test("generateFullSlideImage reaproveita o circuito de billing existente", async () => {
  resetOpenAiImageCircuit();
  let calls = 0;
  let now = 10_000;
  const generate = async () => {
    calls += 1;
    const error = new Error("400 Billing hard limit has been reached.");
    Object.assign(error, { status: 400 });
    throw error;
  };
  await assert.rejects(() => generateFullSlideImage("slide 1", 0, 0, { now: () => now, generate }));
  now += 1_000;
  await assert.rejects(
    () => generateFullSlideImage("slide 2", 0, 0, { now: () => now, generate }),
    /circuito/i,
  );
  assert.equal(calls, 1);
  resetOpenAiImageCircuit();
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd microservice && node --import tsx --import ./src/testSetup.ts --test src/services/openaiImageService.test.ts`

Expected: FAIL — `(0 , import_openaiImageService.generateFullSlideImage) is not a function`.

- [ ] **Step 3: Write minimal implementation**

No final de `microservice/src/services/openaiImageService.ts`, adicione:

```ts
/**
 * Gera o slide inteiro (fundo + titulo + corpo + identidade do perfil ja
 * embutidos no prompt) via OpenAI (gpt-image-1). Qualidade default mais alta
 * que cena/icone (OPENAI_SLIDE_IMAGE_QUALITY, nao OPENAI_IMAGE_QUALITY), ja
 * que aqui o texto renderizado depende de nitidez.
 */
export async function generateFullSlideImage(
  prompt: string,
  retries = 3,
  attempt = 0,
  overrides: OpenAiImageOverrides = {},
): Promise<string> {
  const quality = overrides.quality
    ?? (String(process.env.OPENAI_SLIDE_IMAGE_QUALITY ?? "").trim() || "high") as OpenAiImageGenerateArgs["quality"];
  return generateImageBase64({
    prompt,
    prefix:
      "Premium editorial presentation slide, complete and ready to use, for a "
      + "professional 16:9 template. Cohesive art direction, sophisticated "
      + "shapes, clear focal hierarchy, legible high-contrast typography "
      + "rendering the text below exactly as written (no spelling changes, "
      + "no extra words). Slide brief: ",
    size: "1536x1024",
    retries,
    attempt,
    ...overrides,
    quality,
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd microservice && node --import tsx --import ./src/testSetup.ts --test src/services/openaiImageService.test.ts`

Expected: PASS (6 testes no arquivo).

- [ ] **Step 5: Commit**

```bash
git add microservice/src/services/openaiImageService.ts microservice/src/services/openaiImageService.test.ts
git commit -m "feat(microservice): adiciona generateFullSlideImage (slide inteiro via gpt-image-1)"
```

---

### Task 3: novo `src/lib/slideAssetGenerator.ts` — `buildImageStyleSuffix` + `buildFullSlidePrompt`

**Files:**
- Create: `microservice/src/lib/slideAssetGenerator.ts`
- Create: `microservice/src/lib/slideAssetGenerator.test.ts`
- Modify: `microservice/package.json:13` (adiciona o novo arquivo de teste ao script `test`)

- [ ] **Step 1: Write the failing test**

Crie `microservice/src/lib/slideAssetGenerator.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildFullSlidePrompt, buildImageStyleSuffix } from "./slideAssetGenerator";
import { buildPresentationDesignPlan } from "../constants/presentationThemes";

const PLAN = buildPresentationDesignPlan("seeker", undefined, "Civilização Maia");

test("buildImageStyleSuffix inclui label, guia e cor-assinatura do perfil", () => {
  const suffix = buildImageStyleSuffix("seeker", PLAN);
  assert.ok(suffix.includes("Explorador"));
  assert.ok(suffix.includes("Amara"));
  assert.ok(suffix.includes("#17a398"));
});

test("buildFullSlidePrompt inclui titulo verbatim, topicos e instrucao de area segura", () => {
  const prompt = buildFullSlidePrompt(
    {
      titulo: "A Ascensão dos Templos",
      imagePrompt: "templos maias ao amanhecer",
      topics: ["Templos", "Rituais"],
    },
    "seeker",
    PLAN,
    "cover",
  );
  assert.ok(prompt.includes("A Ascensão dos Templos"));
  assert.ok(prompt.includes("Templos"));
  assert.ok(prompt.includes("Rituais"));
  assert.ok(prompt.includes("84%"));
  assert.ok(prompt.includes("cover"));
  assert.ok(prompt.includes("templos maias ao amanhecer"));
});

test("buildFullSlidePrompt funciona sem topicos/explicacao (campos opcionais)", () => {
  const prompt = buildFullSlidePrompt(
    { titulo: "Slide simples", imagePrompt: "cena qualquer" },
    "mastermind",
    PLAN,
    "spotlight",
  );
  assert.ok(prompt.includes("Slide simples"));
  assert.ok(prompt.includes("cena qualquer"));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd microservice && node --import tsx --import ./src/testSetup.ts --test src/lib/slideAssetGenerator.test.ts`

Expected: FAIL — `Cannot find module './slideAssetGenerator'` (o arquivo ainda não existe).

- [ ] **Step 3: Write minimal implementation**

Crie `microservice/src/lib/slideAssetGenerator.ts`:

```ts
import {
  BRAIN_HEX_CONFIG,
  type BrainHexProfile,
} from "../constants/brainHex";
import {
  presentationImageDirection,
  type PresentationDesignPlan,
} from "../constants/presentationThemes";
import type { SlideForTemplate } from "./slideTemplate";

export interface FullSlideInput extends SlideForTemplate {
  imagePrompt: string;
  iconPrompts?: string[];
}

const SAFE_ZONE_INSTRUCTION =
  "Mantenha todo texto e elementos visuais importantes dentro dos 84% "
  + "centrais verticalmente do quadro — os ~8% superiores e ~8% inferiores "
  + "podem ser cortados quando a imagem for encaixada num slide 16:9.";

// O imagePrompt/iconPrompt (escrito pelo LLM) descreve a CENA/elemento; o
// guardiao, a paleta e a atmosfera do perfil precisam ser reforcados aqui pra
// imagem gerada realmente combinar com o guia/perfil.
export function buildImageStyleSuffix(
  profile: BrainHexProfile,
  plan: PresentationDesignPlan,
): string {
  const cfg = BRAIN_HEX_CONFIG[profile];
  return (
    `. Identidade do perfil: ${cfg.label}, guiado por ${cfg.guideName}. `
    + `Cor de assinatura: ${cfg.color}. ${presentationImageDirection(plan)}`
  );
}

function slideTopicsForPrompt(slide: FullSlideInput): string[] {
  const values = Array.isArray(slide.topics)
    ? slide.topics
    : Array.isArray(slide.pontos)
      ? slide.pontos
      : [];
  return values
    .map((value) => String(value ?? "").replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .slice(0, 5);
}

/** Monta o prompt do slide inteiro: titulo/corpo verbatim + identidade do perfil + area segura. */
export function buildFullSlidePrompt(
  slide: FullSlideInput,
  profile: BrainHexProfile,
  plan: PresentationDesignPlan,
  layout: string,
): string {
  const title = slide.titulo || slide.title || "";
  const topics = slideTopicsForPrompt(slide);
  const explanation = slide.explanation || slide.visualDescription || "";
  const styleSuffix = buildImageStyleSuffix(profile, plan);
  return (
    `Slide de apresentação editorial completo, layout do tipo ${layout}. `
    + `Título (renderize exatamente este texto, em português): "${title}". `
    + (topics.length ? `Tópicos: ${topics.join("; ")}. ` : "")
    + (explanation ? `Texto de apoio: "${explanation}". ` : "")
    + `${slide.imagePrompt}${styleSuffix}. ${SAFE_ZONE_INSTRUCTION}`
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd microservice && node --import tsx --import ./src/testSetup.ts --test src/lib/slideAssetGenerator.test.ts`

Expected: PASS (3 testes).

- [ ] **Step 5: Registre o novo arquivo de teste no script `test`**

Em `microservice/package.json`, no script `"test"` (linha 13), adicione
`src/lib/slideAssetGenerator.test.ts` à lista (pode ir logo após
`src/lib/dedupedTimeoutRunner.test.ts`, que já está lá).

- [ ] **Step 6: Confirme que o test runner completo pega o novo arquivo**

Run: `cd microservice && npm test 2>&1 | tail -20`

Expected: contagem de testes sobe (inclui os 3 novos) e `# fail 0`.

- [ ] **Step 7: Commit**

```bash
git add microservice/src/lib/slideAssetGenerator.ts microservice/src/lib/slideAssetGenerator.test.ts microservice/package.json
git commit -m "feat(microservice): adiciona buildFullSlidePrompt/buildImageStyleSuffix em slideAssetGenerator"
```

---

### Task 4: `slideAssetGenerator.ts` — `generateFullSlideImages` com fallback por slide

**Files:**
- Modify: `microservice/src/lib/slideAssetGenerator.ts`
- Test: `microservice/src/lib/slideAssetGenerator.test.ts`

- [ ] **Step 1: Write the failing test**

Adicione ao topo do import em `slideAssetGenerator.test.ts`:

```ts
import { buildFullSlidePrompt, buildImageStyleSuffix, generateFullSlideImages } from "./slideAssetGenerator";
```

Adicione ao final do arquivo:

```ts
test("todos os slides geram com sucesso via imagem cheia", async () => {
  const slides = [
    { titulo: "Slide 1", imagePrompt: "cena 1" },
    { titulo: "Slide 2", imagePrompt: "cena 2" },
  ];
  const result = await generateFullSlideImages(slides, "seeker", PLAN, {
    generateFullSlideImage: async (prompt) => `full-${prompt.length}`,
  });
  assert.deepEqual(result.renderMode, ["full-image", "full-image"]);
  assert.equal(result.icones[0].length, 0);
  assert.equal(result.icones[1].length, 0);
  assert.equal(result.imagem_referencia.length, 2);
});

test("slide cheio falha e cai para o pipeline legacy so naquele indice", async () => {
  const slides = [
    { titulo: "Slide 1", imagePrompt: "cena 1", iconPrompts: ["icone 1"] },
    { titulo: "Slide 2", imagePrompt: "cena 2", iconPrompts: ["icone 2"] },
  ];
  let fullCalls = 0;
  const result = await generateFullSlideImages(slides, "seeker", PLAN, {
    generateFullSlideImage: async () => {
      fullCalls += 1;
      if (fullCalls === 1) throw new Error("erro qualquer");
      return "full-ok";
    },
    generateSceneImage: async () => "legacy-scene",
    generateSlideIconWithFallback: async () => ({ image: "legacy-icon", provider: "gemini" as const }),
  });
  assert.deepEqual(result.renderMode, ["legacy", "full-image"]);
  assert.equal(result.imagem_referencia[0], "legacy-scene");
  assert.deepEqual(result.icones[0], ["legacy-icon"]);
  assert.equal(result.imagem_referencia[1], "full-ok");
});

test("fallback legacy nao lanca excecao mesmo se cena e icone tambem falharem", async () => {
  const slides = [{ titulo: "Slide 1", imagePrompt: "cena 1", iconPrompts: ["icone 1"] }];
  const result = await generateFullSlideImages(slides, "seeker", PLAN, {
    generateFullSlideImage: async () => { throw new Error("full falhou"); },
    generateSceneImage: async () => { throw new Error("cena falhou"); },
    generateSlideIconWithFallback: async () => { throw new Error("icone falhou"); },
  });
  assert.equal(result.renderMode[0], "legacy");
  assert.equal(result.imagem_referencia[0], "");
  assert.deepEqual(result.icones[0], [""]);
});

test("fallback legacy interrompe icones apos o primeiro vir da contingencia OpenAI", async () => {
  const slides = [{
    titulo: "Slide 1",
    imagePrompt: "cena 1",
    iconPrompts: ["icone 1", "icone 2", "icone 3"],
  }];
  let iconCalls = 0;
  const result = await generateFullSlideImages(slides, "seeker", PLAN, {
    generateFullSlideImage: async () => { throw new Error("full falhou"); },
    generateSceneImage: async () => "legacy-scene",
    generateSlideIconWithFallback: async () => {
      iconCalls += 1;
      return { image: `icon-${iconCalls}`, provider: "openai" as const };
    },
  });
  assert.equal(iconCalls, 1);
  assert.deepEqual(result.icones[0], ["icon-1"]);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd microservice && node --import tsx --import ./src/testSetup.ts --test src/lib/slideAssetGenerator.test.ts`

Expected: FAIL — `generateFullSlideImages is not a function`.

- [ ] **Step 3: Write minimal implementation**

Em `microservice/src/lib/slideAssetGenerator.ts`, adicione os imports que
faltam no topo (junto aos existentes):

```ts
import {
  generateFullSlideImage,
  generateSceneImage,
} from "../services/openaiImageService";
import { generateSlideIconWithFallback } from "../services/slideIconService";
import { presentationLayoutForSlide } from "../constants/presentationThemes";
import { createLogger } from "./logger";
```

(ajuste o import já existente de `presentationImageDirection` +
`PresentationDesignPlan` para incluir `presentationLayoutForSlide` no mesmo
bloco, em vez de um import duplicado)

Adicione ao final do arquivo:

```ts
const log = createLogger({ ctx: "brainhex" });

export interface SlideAssets {
  imagem_referencia: string[];
  icones: string[][];
  renderMode: ("full-image" | "legacy")[];
}

export interface SlideAssetGeneratorOverrides {
  generateFullSlideImage?: typeof generateFullSlideImage;
  generateSceneImage?: typeof generateSceneImage;
  generateSlideIconWithFallback?: typeof generateSlideIconWithFallback;
}

async function generateOneLegacySlide(
  slide: FullSlideInput,
  styleSuffix: string,
  plan: PresentationDesignPlan,
  index: number,
  total: number,
  doGenerateScene: typeof generateSceneImage,
  doGenerateIcon: typeof generateSlideIconWithFallback,
): Promise<{ scene: string; icons: string[] }> {
  let scene = "";
  try {
    const layout = presentationLayoutForSlide(plan, index, total);
    const prompt = (
      `${slide.imagePrompt}${styleSuffix}. `
      + `A composição será usada em um slide editorial do tipo ${layout}; `
      + "preserve áreas de respiro e contraste para títulos e cartões."
    );
    scene = (await doGenerateScene(prompt)) ?? "";
  } catch (e) {
    log.error("cena de fundo falhou (openai)", { slide: index, err: e });
  }

  const icons: string[] = [];
  for (const iconPrompt of slide.iconPrompts ?? []) {
    try {
      const generated = await doGenerateIcon(`${iconPrompt}${styleSuffix}`);
      icons.push(generated.image ?? "");
      // A contingência de imagem OpenAI é mais cara e já existe uma cena
      // OpenAI por slide. Um ícone de contingência por slide preserva o
      // acabamento sem multiplicar custo quando a cota Gemini está zerada.
      if (generated.provider === "openai") break;
    } catch (e) {
      log.error("icone falhou nos dois provedores", { slide: index, err: e });
      icons.push("");
    }
  }
  return { scene, icons };
}

/**
 * Gera, para cada slide, uma unica imagem com titulo+corpo+visual embutidos
 * (gpt-image-1). Quando falha, cai para o pipeline legacy (cena + icones) so
 * para aquele slide — o deck sempre sai completo, misto se necessario.
 */
export async function generateFullSlideImages(
  slides: FullSlideInput[],
  profile: BrainHexProfile,
  plan: PresentationDesignPlan,
  overrides: SlideAssetGeneratorOverrides = {},
): Promise<SlideAssets> {
  const doGenerateFull = overrides.generateFullSlideImage ?? generateFullSlideImage;
  const doGenerateScene = overrides.generateSceneImage ?? generateSceneImage;
  const doGenerateIcon = overrides.generateSlideIconWithFallback ?? generateSlideIconWithFallback;
  const styleSuffix = buildImageStyleSuffix(profile, plan);

  const imagem_referencia: string[] = [];
  const icones: string[][] = [];
  const renderMode: ("full-image" | "legacy")[] = [];

  for (let i = 0; i < slides.length; i++) {
    const layout = presentationLayoutForSlide(plan, i, slides.length);
    try {
      const prompt = buildFullSlidePrompt(slides[i], profile, plan, layout);
      const image = await doGenerateFull(prompt);
      imagem_referencia.push(image);
      icones.push([]);
      renderMode.push("full-image");
    } catch (e) {
      log.warn("slide cheio falhou, caindo pro pipeline legacy", { slide: i, err: e });
      const legacy = await generateOneLegacySlide(
        slides[i],
        styleSuffix,
        plan,
        i,
        slides.length,
        doGenerateScene,
        doGenerateIcon,
      );
      imagem_referencia.push(legacy.scene);
      icones.push(legacy.icons);
      renderMode.push("legacy");
    }
  }

  return { imagem_referencia, icones, renderMode };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd microservice && node --import tsx --import ./src/testSetup.ts --test src/lib/slideAssetGenerator.test.ts`

Expected: PASS (7 testes no arquivo).

- [ ] **Step 5: Rode a suíte inteira e o typecheck**

Run: `cd microservice && npm test 2>&1 | tail -20 && npx tsc --noEmit`

Expected: `# fail 0` e nenhuma saída do `tsc` (exit 0).

- [ ] **Step 6: Commit**

```bash
git add microservice/src/lib/slideAssetGenerator.ts microservice/src/lib/slideAssetGenerator.test.ts
git commit -m "feat(microservice): generateFullSlideImages com fallback por slide pro pipeline legacy"
```

---

### Task 5: `slideEnricher.ts` — carrega `renderMode` por slide

**Files:**
- Modify: `microservice/src/lib/slideEnricher.ts`
- Test: `microservice/src/lib/slideEnricher.test.ts`

- [ ] **Step 1: Write the failing test**

Adicione ao final de `microservice/src/lib/slideEnricher.test.ts`:

```ts
test("renderMode: usa o valor informado no indice", () => {
  const out = enrichSlidesWithImages([{ title: "A" }], ["img"], [], ["full-image"]);
  assert.equal(out[0].renderMode, "full-image");
});

test("renderMode: default 'legacy' quando parametro omitido", () => {
  const out = enrichSlidesWithImages([{ title: "A" }], ["img"]);
  assert.equal(out[0].renderMode, "legacy");
});

test("renderMode: default 'legacy' quando indice fora do array informado", () => {
  const out = enrichSlidesWithImages(
    [{ title: "A" }, { title: "B" }],
    ["img", "img2"],
    [],
    ["full-image"],
  );
  assert.equal(out[0].renderMode, "full-image");
  assert.equal(out[1].renderMode, "legacy");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd microservice && node --import tsx --import ./src/testSetup.ts --test src/lib/slideEnricher.test.ts`

Expected: FAIL — `assert.equal(out[0].renderMode, "full-image")` falha porque
`out[0].renderMode` é `undefined` (a função ainda não aceita/emite esse
campo).

- [ ] **Step 3: Write minimal implementation**

Substitua o conteúdo de `microservice/src/lib/slideEnricher.ts` por:

```ts
// Enriquece slides retornados pelo Gemini com:
//  - titulo normalizado (prefere `title`, cai em `titulo`, default "")
//  - imagem_referencia como data URL (apenas se houver imagem para o índice)
//  - icones como array de data URLs (cena de fundo é OpenAI, ícones são Gemini —
//    ver generateSlideAssets em server.ts; aqui só empacota o que já foi gerado)
//  - renderMode: "full-image" quando o slide inteiro veio de uma unica imagem
//    (ver generateFullSlideImages em slideAssetGenerator.ts), "legacy" (default)
//    quando veio do pipeline cena+icone+HTML de sempre.

export interface SlideLike {
  title?:               string;
  titulo?:              string;
  imagem_referencia?:   string;
}

export function enrichSlidesWithImages<T extends SlideLike>(
  slides: T[],
  images: string[],
  iconImagesPerSlide: string[][] = [],
  renderModes: ("full-image" | "legacy")[] = [],
): (T & {
  titulo: string;
  imagem_referencia?: string;
  icones: string[];
  renderMode: "full-image" | "legacy";
})[] {
  return slides.map((s, i) => {
    const img = i < images.length ? images[i] : "";
    const icons = (i < iconImagesPerSlide.length ? iconImagesPerSlide[i] : [])
      .filter((icon) => icon)
      .map((icon) => `data:image/png;base64,${icon}`);
    return {
      ...s,
      titulo: s.title ?? s.titulo ?? "",
      ...(img ? { imagem_referencia: `data:image/png;base64,${img}` } : {}),
      icones: icons,
      renderMode: renderModes[i] ?? "legacy",
    };
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd microservice && node --import tsx --import ./src/testSetup.ts --test src/lib/slideEnricher.test.ts`

Expected: PASS (todos os testes do arquivo, os antigos + os 3 novos).

- [ ] **Step 5: Commit**

```bash
git add microservice/src/lib/slideEnricher.ts microservice/src/lib/slideEnricher.test.ts
git commit -m "feat(microservice): enrichSlidesWithImages carrega renderMode por slide"
```

---

### Task 6: `slideTemplate.ts` — renderiza slide `full-image` como imagem única

**Files:**
- Modify: `microservice/src/lib/slideTemplate.ts:17-29` (interface), `:361-403` (`slideHtml`), `:405-878` (`BASE_CSS`)
- Test: `microservice/src/lib/slideTemplate.test.ts`

- [ ] **Step 1: Write the failing test**

Adicione ao final de `microservice/src/lib/slideTemplate.test.ts`:

```ts
test("slide com renderMode full-image renderiza somente a imagem, sem titulo/badge/footer em HTML", () => {
  const fullImageSlide = {
    ...FAKE_SLIDE,
    renderMode: "full-image" as const,
    imagem_referencia: "data:image/png;base64,ZZZZ",
  };
  const html = buildDeckHtml([fullImageSlide], "seeker");
  assert.ok(html.includes("data:image/png;base64,ZZZZ"));
  assert.ok(html.includes('class="full-slide-image"'));
  assert.ok(!html.includes("guide-badge"));
  assert.ok(!html.includes("<footer>"));
  assert.ok(!html.includes("<h1>"));
});

test("slide com renderMode full-image usa titulo+explicacao como alt da imagem", () => {
  const fullImageSlide = {
    ...FAKE_SLIDE,
    renderMode: "full-image" as const,
    imagem_referencia: "data:image/png;base64,ZZZZ",
  };
  const html = buildDeckHtml([fullImageSlide], "seeker");
  assert.ok(html.includes('alt="Título de Teste. Explicação de teste."'));
});

test("slide sem renderMode (undefined) mantem o comportamento legacy inalterado", () => {
  const html = buildDeckHtml([FAKE_SLIDE], "seeker");
  assert.ok(html.includes("guide-badge"));
  assert.ok(html.includes("<footer>"));
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd microservice && node --import tsx --import ./src/testSetup.ts --test src/lib/slideTemplate.test.ts`

Expected: FAIL — os dois primeiros testes falham (`class="full-slide-image"`
e o `alt` não existem ainda no HTML gerado; o slide cai no layout normal
porque `slideHtml` ignora `renderMode` hoje).

- [ ] **Step 3: Write minimal implementation**

Em `microservice/src/lib/slideTemplate.ts`, adicione `renderMode` à interface
`SlideForTemplate` (linha 17-29):

```ts
export interface SlideForTemplate {
  titulo?: string;
  title?: string;
  subtitulo?: string;
  topics?: string[];
  pontos?: string[];
  explanation?: string;
  visualDescription?: string;
  characterQuote?: string;
  characterAction?: string;
  imagem_referencia?: string;
  icones?: string[];
  renderMode?: "full-image" | "legacy";
}
```

Troque a função `slideHtml` (linha 361-403) por:

```ts
function slideHtml(
  slide: SlideForTemplate,
  index: number,
  total: number,
  profile: BrainHexProfile,
  plan: PresentationDesignPlan,
  portraitDataUrl: string | null,
): string {
  if (slide.renderMode === "full-image" && slide.imagem_referencia) {
    const title = slide.titulo || slide.title || "";
    const explanation = slide.explanation || slide.visualDescription || "";
    const alt = escapeHtml(`${title}. ${explanation}`.trim());
    return `
    <section
      class="slide profile-${profile} slide-full-image"
      data-layout="full-image"
      data-design-system="${plan.version}"
    >
      <img class="full-slide-image" src="${slide.imagem_referencia}" alt="${alt}" />
    </section>
  `;
  }

  const layout = presentationLayoutForSlide(plan, index, total);
  const progress = Math.max(7, Math.round(((index + 1) / total) * 100));
  return `
    <section
      class="slide profile-${profile} layout-${layout}"
      data-layout="${layout}"
      data-design-system="${plan.version}"
      style="
        --accent:${plan.palette.accent};
        --accent-soft:${plan.palette.accentSoft};
        --highlight:${plan.palette.highlight};
        --background:${plan.palette.background};
        --surface:${plan.palette.surface};
        --ink:${plan.palette.ink};
        --progress:${progress}%;
      "
    >
      <div class="texture-layer"></div>
      ${slideBodyHtml({
        slide,
        profile,
        plan,
        layout,
        index,
        total,
        portraitDataUrl,
      })}
      <footer>
        <span>${escapeHtml(plan.subject)}</span>
        <div class="progress"><i></i></div>
        <strong>${String(index + 1).padStart(2, "0")} / ${String(total).padStart(2, "0")}</strong>
      </footer>
    </section>
  `;
}
```

Em `BASE_CSS` (dentro do template string, logo após a regra `.scene { ... }`,
por volta da linha 440), adicione:

```css
  .slide-full-image { padding: 0; }
  .full-slide-image {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd microservice && node --import tsx --import ./src/testSetup.ts --test src/lib/slideTemplate.test.ts`

Expected: PASS (todos os testes do arquivo, os antigos + os 3 novos).

- [ ] **Step 5: Commit**

```bash
git add microservice/src/lib/slideTemplate.ts microservice/src/lib/slideTemplate.test.ts
git commit -m "feat(microservice): slideTemplate renderiza slide full-image como imagem unica"
```

---

### Task 7: `server.ts` — liga `generateFullSlideImages` no `runPipeline`

**Files:**
- Modify: `microservice/server.ts:11-20` (imports), `:84-99` (remove `buildImageStyleSuffix` local), `:599-603` e `:622` (call sites dentro de `runPipeline`)

Este task não introduz lógica nova (já testada nos tasks 1-6) — é só
religação. Não precisa de teste novo; a verificação é a suíte completa +
typecheck ao final.

- [ ] **Step 1: Atualize os imports**

Em `microservice/server.ts`, troque a linha 11:

```ts
import { generateSceneImage } from "./src/services/openaiImageService";
```

por:

```ts
import { generateSceneImage } from "./src/services/openaiImageService";
import { generateFullSlideImages, buildImageStyleSuffix } from "./src/lib/slideAssetGenerator";
```

Na linha 14-20 (import de `presentationThemes`), remova
`presentationImageDirection` da lista (deixa de ser usado diretamente em
`server.ts` — quem usa agora é `slideAssetGenerator.ts`):

```ts
import {
  buildPresentationDesignPlan,
  presentationLayoutForSlide,
  type PresentationDesignPlan,
  type PresentationThemeInput,
} from "./src/constants/presentationThemes";
```

- [ ] **Step 2: Remova a `buildImageStyleSuffix` local (linhas 90-99)**

Delete o bloco:

```ts
// O imagePrompt/iconPrompt (escrito pelo LLM) descreve a CENA/elemento; o
// guardiao, a paleta e a atmosfera do perfil precisam ser reforcados aqui pra
// imagem gerada realmente combinar com o guia/perfil.
function buildImageStyleSuffix(
  profile: BrainHexProfile,
  plan: PresentationDesignPlan,
): string {
  const cfg = BRAIN_HEX_CONFIG[profile];
  return (
    `. Identidade do perfil: ${cfg.label}, guiado por ${cfg.guideName}. `
    + `Cor de assinatura: ${cfg.color}. ${presentationImageDirection(plan)}`
  );
}
```

(`generateSceneImages`/`generateSlideIcons`/`generateSlideAssets` continuam
logo abaixo, inalteradas — agora usam o `buildImageStyleSuffix` importado do
Step 1. Se `BRAIN_HEX_CONFIG` deixar de ser usado em algum outro ponto de
`server.ts`, mantenha o import mesmo assim — ele ainda é usado por outras
rotas do arquivo.)

- [ ] **Step 3: Troque o call site dentro de `runPipeline`**

Por volta da linha 599-603, troque:

```ts
  const assetsPromise = generateSlideAssets(
    resultado.slides,
    profile,
    presentationPlan,
  );
```

por:

```ts
  const assetsPromise = generateFullSlideImages(
    resultado.slides,
    profile,
    presentationPlan,
  );
```

- [ ] **Step 4: Passe o `renderMode` para `enrichSlidesWithImages`**

Por volta da linha 622, troque:

```ts
  const slidesComImagens  = enrichSlidesWithImages(resultado.slides, assets.imagem_referencia, assets.icones);
```

por:

```ts
  const slidesComImagens  = enrichSlidesWithImages(resultado.slides, assets.imagem_referencia, assets.icones, assets.renderMode);
```

- [ ] **Step 5: Rode a suíte completa e o typecheck**

Run: `cd microservice && npm test 2>&1 | tail -20 && npx tsc --noEmit`

Expected: `# fail 0` e `tsc` sem saída (exit 0). Preste atenção especial a
qualquer erro de tipo em `server.ts` sobre `resultado.slides` não satisfazer
`FullSlideInput[]` — se acontecer, o tipo real de `resultado.slides` (vindo
de `processMediaWithGemini`) precisa de um campo opcional que
`FullSlideInput`/`SlideForTemplate` não previu; adicione o campo em
`SlideForTemplate` (`slideTemplate.ts`) em vez de duplicar em
`slideAssetGenerator.ts`.

- [ ] **Step 6: Commit**

```bash
git add microservice/server.ts
git commit -m "feat(microservice): runPipeline usa generateFullSlideImages no lugar de generateSlideAssets"
```

---

### Task 8: `.env.example` + verificação final

**Files:**
- Modify: `microservice/.env.example`

- [ ] **Step 1: Documente a nova env var**

Em `microservice/.env.example`, logo após a linha
`# CONTENT_GENERATION_OPENAI_IMAGE_COOLDOWN_MS=1800000` (adicionada numa
sessão anterior), adicione:

```
# OPENAI_SLIDE_IMAGE_QUALITY=high
```

- [ ] **Step 2: Rode a suíte completa + typecheck uma última vez**

Run: `cd microservice && npm test 2>&1 | tail -30`

Expected: `# fail 0`.

Run: `cd microservice && npx tsc --noEmit`

Expected: sem saída, exit 0.

- [ ] **Step 3: Revise manualmente o resultado (checklist rápido)**

Confirme, lendo os arquivos alterados:
- `openaiImageService.ts`: `quality` override e `generateFullSlideImage`
  presentes, circuito de billing reaproveitado (não há um segundo
  `openaiImageUnavailableUntil`).
- `slideAssetGenerator.ts`: `generateFullSlideImages` nunca deixa uma
  exceção escapar (todo slide recebe algum valor em
  `imagem_referencia`/`icones`/`renderMode`, mesmo que vazio).
- `slideTemplate.ts`: slide `full-image` não inclui `guide-badge`, `<h1>`
  nem `<footer>`; slide sem `renderMode` continua idêntico a antes.
- `server.ts`: a rota `/api/v1/archive` (por volta da linha 899-925) **não**
  foi tocada — ainda chama `generateSlideIcons`/`generateSlideAssets`
  diretamente.

- [ ] **Step 4: Commit**

```bash
git add microservice/.env.example
git commit -m "docs(microservice): documenta OPENAI_SLIDE_IMAGE_QUALITY no .env.example"
```

---

## Fora de escopo (não fazer neste plano)

- QA/detecção automática de texto ilegível na imagem gerada.
- Consistência visual entre slides do mesmo deck via imagem de referência
  (image-to-image).
- Qualquer mudança na rota `/api/v1/archive` (`server.ts:899-925`) ou na
  granularidade de cache/geração por tópico × perfil.
- Mudança de schema no Supabase.
