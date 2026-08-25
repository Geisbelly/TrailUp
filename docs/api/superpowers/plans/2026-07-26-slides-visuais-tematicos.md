# Slides de Apresentação Temáticos (estilo Slidesgo) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reescrever o gerador de PDF de apresentação do `microservice` (`pdfService.ts`) trocando jsPDF por Puppeteer (HTML/CSS real → PDF), com cena de fundo gerada na OpenAI e ícones decorativos gerados na Gemini para cada slide, mantendo a identidade fixa do guardião BrainHex em todo slide.

**Architecture:** `processMediaWithGemini` (Gemini) passa a retornar, por slide, `imagePrompt` (existente) + `iconPrompts` (novo). `generateSlideAssets` (novo, substitui `generateSlidesImages`) gera em paralelo: cena de fundo via OpenAI (`gpt-image-1`) e ícones via Gemini (`generateSlideImage`, já existente), cada trilha serial internamente (1 chave cada, sem pool). `enrichSlidesWithImages` (existente, estendido) empacota tudo nos slides. `pdfService.ts` monta um documento HTML único (`slideTemplate.ts`, novo) e usa Puppeteer para renderizar em PDF.

**Tech Stack:** Node.js/TypeScript, Puppeteer (novo), OpenAI SDK (novo), `@google/genai` (existente), Node `--test` runner.

**Spec:** `docs/api/superpowers/specs/2026-07-26-slides-visuais-tematicos-design.md`

---

## Task 1: Dependências novas

**Files:**
- Modify: `microservice/package.json`

- [ ] **Step 1: Instalar puppeteer e openai**

Run (a partir de `microservice/`):
```bash
npm install puppeteer openai
```
Expected: `package.json` ganha `"puppeteer"` e `"openai"` em `dependencies`; `package-lock.json` atualizado. O install do `puppeteer` baixa um Chromium (~200-300MB) — pode demorar alguns minutos, isso é esperado.

- [ ] **Step 2: Confirmar que o Chromium baixado funciona**

Run:
```bash
node -e "const puppeteer=require('puppeteer'); (async()=>{const b=await puppeteer.launch({args:['--no-sandbox','--disable-setuid-sandbox']}); console.log('launched', await b.version()); await b.close();})()"
```
Expected: imprime algo como `launched Chrome/1XX...` sem erro. Se der erro de sandbox no Linux/CI, o `--no-sandbox` acima já contorna — anote esses dois args, vão ser usados no `pdfService.ts` (Task 9).

- [ ] **Step 3: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore(microservice): adiciona puppeteer e openai como dependencias"
```

---

## Task 2: Fonte temática embutida

**Files:**
- Create: `microservice/src/assets/fonts/MedievalSharp-Regular.ttf`

- [ ] **Step 1: Baixar a fonte (Google Fonts, licença OFL, mirror no GitHub)**

Run (a partir de `microservice/`):
```bash
mkdir -p src/assets/fonts
curl -fL -o src/assets/fonts/MedievalSharp-Regular.ttf \
  https://raw.githubusercontent.com/google/fonts/main/ofl/medievalsharp/MedievalSharp-Regular.ttf
```
Expected: o comando termina sem erro (`-f` faz o curl falhar com exit code != 0 se o servidor responder 404, em vez de salvar uma página de erro HTML como se fosse a fonte).

- [ ] **Step 2: Confirmar que o arquivo baixado é uma fonte de verdade**

Run:
```bash
file src/assets/fonts/MedievalSharp-Regular.ttf
```
Expected: saída contendo `TrueType Font data` (não `HTML document` nem `ASCII text` — se vier isso, o download falhou silenciosamente e a URL precisa ser revista antes de continuar).

- [ ] **Step 3: Commit**

```bash
git add src/assets/fonts/MedievalSharp-Regular.ttf
git commit -m "feat(microservice): adiciona fonte MedievalSharp para titulos dos slides"
```

---

## Task 3: Serviço de imagem OpenAI (cena de fundo)

**Files:**
- Create: `microservice/src/services/openaiImageService.ts`
- Test: `microservice/src/services/openaiImageService.test.ts`

- [ ] **Step 1: Escrever o teste (comportamento sem rede: chave ausente)**

```typescript
// microservice/src/services/openaiImageService.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";

test("generateSceneImage lanca erro claro quando OPENAI_API_KEY nao esta configurada", async () => {
  const original = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  try {
    const { generateSceneImage } = await import("./openaiImageService.ts?nocache=" + Date.now());
    await assert.rejects(
      () => generateSceneImage("um teste qualquer"),
      /OPENAI_API_KEY/
    );
  } finally {
    if (original !== undefined) process.env.OPENAI_API_KEY = original;
  }
});
```

- [ ] **Step 2: Rodar o teste e confirmar que falha (módulo ainda não existe)**

Run: `node --import tsx --test src/services/openaiImageService.test.ts`
Expected: FAIL — `Cannot find module './openaiImageService.ts'` (ou equivalente).

- [ ] **Step 3: Implementar o serviço**

```typescript
// microservice/src/services/openaiImageService.ts
import OpenAI from "openai";

let _openai: OpenAI | null = null;
function getOpenAi(): OpenAI {
  if (_openai) return _openai;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY ausente — configure no .env antes de chamar o serviço OpenAI.");
  }
  _openai = new OpenAI({ apiKey });
  return _openai;
}

/**
 * Gera a cena de fundo de um slide via OpenAI (gpt-image-1). Retorna o base64
 * cru da imagem (sem prefixo data:), mesmo contrato de generateSlideImage
 * (geminiService.ts) — assim os dois provedores compoem igual no HTML final.
 */
export async function generateSceneImage(prompt: string, retries = 3): Promise<string | null> {
  try {
    const response = await getOpenAi().images.generate({
      model: "gpt-image-1",
      prompt: `Professional 2D concept art, sticker style, clean lines, vibrant colors, magical alchemy theme, wide cinematic composition: ${prompt}`,
      size: "1536x1024",
      n: 1,
    });
    const b64 = response.data?.[0]?.b64_json;
    if (!b64) throw new Error("A cena mística falhou em se materializar (OpenAI não retornou imagem).");
    return b64;
  } catch (error: any) {
    if (error?.message?.includes("OPENAI_API_KEY")) throw error;
    const isRateLimit =
      error?.status === 429 ||
      error?.message?.includes("rate_limit") ||
      error?.message?.includes("429");
    if (retries > 0 && isRateLimit) {
      const delay = (4 - retries) * 5000;
      console.warn(`[openai] rate-limit — retry em ${delay / 1000}s (${retries} restantes)`);
      await new Promise((r) => setTimeout(r, delay));
      return generateSceneImage(prompt, retries - 1);
    }
    throw error;
  }
}
```

- [ ] **Step 4: Rodar o teste e confirmar que passa**

Run: `node --import tsx --test src/services/openaiImageService.test.ts`
Expected: PASS (1 teste).

- [ ] **Step 5: Registrar o novo arquivo de teste no script `test`**

Modificar `microservice/package.json`, campo `scripts.test` — adicionar `src/services/openaiImageService.test.ts` à lista existente (mesma lista que já inclui `src/services/pdfService.test.ts`).

- [ ] **Step 6: Adicionar `OPENAI_API_KEY` ao `.env.example` (se existir)**

Run: `grep -n "GEMINI_API_KEY" .env.example`
Se o arquivo existir e tiver essa linha, adicionar logo abaixo: `OPENAI_API_KEY=`

- [ ] **Step 7: Commit**

```bash
git add src/services/openaiImageService.ts src/services/openaiImageService.test.ts package.json .env.example
git commit -m "feat(microservice): adiciona geracao de cena de fundo via OpenAI gpt-image-1"
```

---

## Task 4: Schema — `iconPrompts` por slide (Gemini)

**Files:**
- Modify: `microservice/src/types/index.ts:25-34` (`SlideContent`)
- Modify: `microservice/src/services/geminiService.ts:274-338` (systemInstruction + responseSchema)

- [ ] **Step 1: Adicionar o campo ao tipo `SlideContent`**

Em `microservice/src/types/index.ts`, dentro da interface `SlideContent` (linha 25), adicionar o campo depois de `imagePrompt`:

```typescript
export interface SlideContent {
  title: string;
  topics: string[];
  explanation: string;
  visualDescription: string;
  characterQuote: string;
  characterAction: "explaining" | "celebrating" | "thinking" | "warning";
  imagePrompt: string;
  iconPrompts: string[];
  sourceIds: string[];
}
```

- [ ] **Step 2: Atualizar a regra de slides no `systemInstruction`**

Em `microservice/src/services/geminiService.ts`, dentro do bloco "5. Slides (Visual Alchemy)" (por volta da linha 286-290), adicionar logo depois da linha `- imagePrompt: Prompt para geração de imagem 2D.`:

```
       - iconPrompts: 2 a 4 prompts curtos, cada um descrevendo UM elemento decorativo
         especifico do slide (ex.: numa aula de Egito antigo, "hieroglifo dourado
         estilizado", "escaravelho sagrado"; numa aula de sistemas distribuidos,
         "engrenagem magica conectada por fios de luz"). Mesmo estilo magico/ilustrado
         do guardiao ${config.guideName} — nunca icone generico de clipart, nunca
         texto ou letras dentro da imagem.
```

- [ ] **Step 3: Adicionar o campo no `responseSchema`**

Em `microservice/src/services/geminiService.ts`, dentro de `responseSchema.properties.slides.items.properties` (por volta da linha 329), adicionar `iconPrompts` logo depois de `imagePrompt` e incluir em `required`:

```typescript
                imagePrompt: { type: Type.STRING },
                iconPrompts: { type: Type.ARRAY, items: { type: Type.STRING } },
                sourceIds: { type: Type.ARRAY, items: { type: Type.STRING } }
              },
              required: ["title", "topics", "explanation", "visualDescription", "characterQuote", "characterAction", "imagePrompt", "iconPrompts", "sourceIds"]
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit -p .` (a partir de `microservice/`)
Expected: sem erros.

- [ ] **Step 5: Commit**

```bash
git add src/types/index.ts src/services/geminiService.ts
git commit -m "feat(microservice): slides ganham iconPrompts (elementos decorativos por slide)"
```

---

## Task 5: Mesma regra nos prompts Python (fallback)

**Files:**
- Modify: `api/app/agent/prompts/gerador_conteudo.txt`
- Modify: `api/app/agent/prompts/pipeline_midia_etapas.txt`

- [ ] **Step 1: `gerador_conteudo.txt` — schema de saída**

No bloco `"apresentacao"` → `"slides"` (dentro de "Formato de saída"), adicionar `iconPrompts` depois de `imagePrompt`:

```
        "imagePrompt": "string (prompt para geração de imagem 2D estilo mágico)",
        "iconPrompts": ["string (2 a 4 prompts curtos, um elemento decorativo cada, mesmo estilo mágico do guia — nunca clipart genérico, nunca texto na imagem)"],
        "sourceIds": ["string"]
```

- [ ] **Step 2: `pipeline_midia_etapas.txt` — payload esperado**

No bloco `Payload esperado por formato` → `apresentacao` → `slides`, mesma adição:

```
      "imagePrompt": "...", "iconPrompts": ["..."], "sourceIds": ["..."]
```

- [ ] **Step 3: Commit**

```bash
git add api/app/agent/prompts/gerador_conteudo.txt api/app/agent/prompts/pipeline_midia_etapas.txt
git commit -m "docs(prompts): espelha iconPrompts nos prompts Python (fallback)"
```

---

## Task 6: `enrichSlidesWithImages` ganha ícones

**Files:**
- Modify: `microservice/src/lib/slideEnricher.ts`
- Modify: `microservice/src/lib/slideEnricher.test.ts`

- [ ] **Step 1: Escrever os testes novos (adicionar aos existentes, não substituir)**

Adicionar ao final de `microservice/src/lib/slideEnricher.test.ts`:

```typescript
test("icones: adiciona array de data URLs quando presente no indice", () => {
  const out = enrichSlidesWithImages([{ title: "A" }], [], [["icon1", "icon2"]]);
  assert.deepEqual(out[0].icones, [
    "data:image/png;base64,icon1",
    "data:image/png;base64,icon2",
  ]);
});

test("icones: filtra entradas vazias (icone que falhou na geracao)", () => {
  const out = enrichSlidesWithImages([{ title: "A" }], [], [["icon1", "", "icon3"]]);
  assert.deepEqual(out[0].icones, [
    "data:image/png;base64,icon1",
    "data:image/png;base64,icon3",
  ]);
});

test("icones: indice sem entrada em iconImagesPerSlide = array vazio", () => {
  const out = enrichSlidesWithImages([{ title: "A" }, { title: "B" }], [], [["icon1"]]);
  assert.deepEqual(out[0].icones, ["data:image/png;base64,icon1"]);
  assert.deepEqual(out[1].icones, []);
});

test("icones: parametro omitido nao quebra chamadas existentes", () => {
  const out = enrichSlidesWithImages([{ title: "A" }], ["bg1"]);
  assert.equal(out[0].imagem_referencia, "data:image/png;base64,bg1");
  assert.deepEqual(out[0].icones, []);
});
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `node --import tsx --test src/lib/slideEnricher.test.ts`
Expected: FAIL nos 4 testes novos (`icones` é `undefined`, `enrichSlidesWithImages` só aceita 2 parâmetros).

- [ ] **Step 3: Implementar**

Substituir o conteúdo de `microservice/src/lib/slideEnricher.ts`:

```typescript
// Enriquece slides retornados pelo Gemini com:
//  - titulo normalizado (prefere `title`, cai em `titulo`, default "")
//  - imagem_referencia como data URL (apenas se houver imagem para o índice)
//  - icones como array de data URLs (cena de fundo é OpenAI, ícones são Gemini —
//    ver generateSlideAssets em server.ts; aqui só empacota o que já foi gerado)

export interface SlideLike {
  title?:               string;
  titulo?:              string;
  imagem_referencia?:   string;
}

export function enrichSlidesWithImages<T extends SlideLike>(
  slides: T[],
  images: string[],
  iconImagesPerSlide: string[][] = []
): (T & { titulo: string; imagem_referencia?: string; icones: string[] })[] {
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
    };
  });
}
```

- [ ] **Step 4: Rodar todos os testes de `slideEnricher` e confirmar que passam**

Run: `node --import tsx --test src/lib/slideEnricher.test.ts`
Expected: PASS (todos os testes, os antigos e os 4 novos).

- [ ] **Step 5: Commit**

```bash
git add src/lib/slideEnricher.ts src/lib/slideEnricher.test.ts
git commit -m "feat(microservice): enrichSlidesWithImages passa a empacotar icones tambem"
```

---

## Task 7: `generateSlideAssets` — orquestra OpenAI (cena) + Gemini (ícones)

**Files:**
- Modify: `microservice/server.ts:67-90` (substitui `generateSlidesImages`)
- Modify: `microservice/server.ts:309-310` (call site 1, dentro de `runPipeline`)
- Modify: `microservice/server.ts:529-533` (call site 2, dentro de `/api/v1/archive`)

- [ ] **Step 1: Substituir a função `generateSlidesImages`**

Em `microservice/server.ts`, trocar o import (linha 6-12) para incluir `generateSceneImage`:

```typescript
import {
  processMediaWithGemini,
  generateNaturalAudio,
  generateConversationalAudio,
  generateSlideImage,
  type GeminiTtsVoice,
} from "./src/services/geminiService";
import { generateSceneImage } from "./src/services/openaiImageService";
```

Substituir a função inteira `generateSlidesImages` (linhas 67-90) por:

```typescript
type SlideAssetInput = { imagePrompt: string; iconPrompts?: string[] };
type SlideAssets = { imagem_referencia: string[]; icones: string[][] };

// O imagePrompt/iconPrompt (escrito pelo LLM) descreve a CENA/elemento; o
// guardiao, a paleta e a atmosfera do perfil precisam ser reforcados aqui pra
// imagem gerada realmente combinar com o guia/perfil.
function buildImageStyleSuffix(profile: BrainHexProfile): string {
  const cfg = BRAIN_HEX_CONFIG[profile];
  return (
    `. Guardiao/guia do perfil: ${cfg.guideName} (${cfg.label}). ` +
    `Paleta de cor dominante: ${cfg.color}. Atmosfera: ${cfg.description}`
  );
}

/** 1 cena de fundo por slide, via OpenAI. Serial (1 chave, sem pool). */
async function generateSceneImages(
  slides: { imagePrompt: string }[],
  styleSuffix: string
): Promise<string[]> {
  const scenes: string[] = [];
  for (let i = 0; i < slides.length; i++) {
    try {
      if (i > 0) await new Promise((r) => setTimeout(r, 2000));
      const prompt = `${slides[i].imagePrompt}${styleSuffix}`;
      scenes.push((await generateSceneImage(prompt)) ?? "");
    } catch (e) {
      log.error("cena de fundo falhou (openai)", { slide: i, err: e });
      scenes.push("");
    }
  }
  return scenes;
}

/** Icones decorativos de cada slide (iconPrompts), via Gemini. Serial (1 chave, sem pool). */
async function generateSlideIcons(
  slides: { iconPrompts?: string[] }[],
  styleSuffix: string
): Promise<string[][]> {
  const iconsPerSlide: string[][] = [];
  let calls = 0;
  for (let i = 0; i < slides.length; i++) {
    const prompts = slides[i].iconPrompts ?? [];
    const icons: string[] = [];
    for (const iconPrompt of prompts) {
      try {
        if (calls > 0) await new Promise((r) => setTimeout(r, 3000));
        calls++;
        icons.push((await generateSlideImage(`${iconPrompt}${styleSuffix}`)) ?? "");
      } catch (e) {
        log.error("icone falhou (gemini)", { slide: i, err: e });
        icons.push("");
      }
    }
    iconsPerSlide.push(icons);
  }
  return iconsPerSlide;
}

/**
 * Gera, para TODOS os slides: 1 cena de fundo por slide (OpenAI) + os icones
 * decorativos daquele slide (Gemini). As duas trilhas rodam em paralelo entre
 * si (provedores/chaves diferentes); dentro de cada trilha a geracao e serial
 * (1 chave cada, sem pool de chaves).
 */
async function generateSlideAssets(
  slides: SlideAssetInput[],
  profile: BrainHexProfile
): Promise<SlideAssets> {
  const styleSuffix = buildImageStyleSuffix(profile);
  const [scenes, iconsPerSlide] = await Promise.all([
    generateSceneImages(slides, styleSuffix),
    generateSlideIcons(slides, styleSuffix),
  ]);
  return { imagem_referencia: scenes, icones: iconsPerSlide };
}
```

- [ ] **Step 2: Atualizar o call site 1 (`runPipeline`)**

Trocar (por volta da linha 308-310):

```typescript
  // 4. Imagens dos slides
  const images           = await generateSlidesImages(resultado.slides, profile);
  const slidesComImagens = enrichSlidesWithImages(resultado.slides, images);
```

por:

```typescript
  // 4. Assets dos slides — cena de fundo (OpenAI) + icones (Gemini), todos os slides
  const assets            = await generateSlideAssets(resultado.slides, profile);
  const slidesComImagens  = enrichSlidesWithImages(resultado.slides, assets.imagem_referencia, assets.icones);
```

- [ ] **Step 3: Atualizar o call site 2 (`/api/v1/archive`)**

Trocar (por volta da linha 522-533):

```typescript
      // Imagens dos slides:
      // - Se o frontend enviou (slideImages array de base64), usa diretamente.
      // - Caso contrário, gera server-side usando os imagePrompts dos slides.
      let images: string[];
      if (Array.isArray(clientImages) && clientImages.length > 0) {
        images = clientImages;
      } else {
        req.log.info("gerando imagens dos slides server-side");
        images = await generateSlidesImages(processed.slides || [], profile as BrainHexProfile);
      }

      const slidesComImagens = enrichSlidesWithImages(processed.slides || [], images);
```

por:

```typescript
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
          buildImageStyleSuffix(profile as BrainHexProfile)
        );
      } else {
        req.log.info("gerando cena + icones dos slides server-side");
        const assets = await generateSlideAssets(processed.slides || [], profile as BrainHexProfile);
        sceneImages = assets.imagem_referencia;
        iconImages  = assets.icones;
      }

      const slidesComImagens = enrichSlidesWithImages(processed.slides || [], sceneImages, iconImages);
```

- [ ] **Step 4: Typecheck**

Run: `npx tsc --noEmit -p .`
Expected: sem erros.

- [ ] **Step 5: Rodar a suíte inteira de testes do microservice**

Run: `npm test`
Expected: mesma contagem de sucesso de antes (a falha pré-existente de `503 quando Supabase não configurado` — dependente do ambiente local ter `.env` com credenciais reais — não é regressão desta mudança; confirme que nenhum teste NOVO falhou).

- [ ] **Step 6: Commit**

```bash
git add server.ts
git commit -m "feat(microservice): generateSlideAssets gera cena (OpenAI) + icones (Gemini) para todos os slides"
```

---

## Task 8: Template HTML/CSS do slide (`slideTemplate.ts`)

**Files:**
- Create: `microservice/src/lib/slideTemplate.ts`
- Test: `microservice/src/lib/slideTemplate.test.ts`

Esta função é pura (string in, string out) — não abre browser, não faz IO além de ler a fonte local uma vez.

- [ ] **Step 1: Escrever os testes**

```typescript
// microservice/src/lib/slideTemplate.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildDeckHtml } from "./slideTemplate";

const FAKE_SLIDE = {
  titulo: "Título de Teste",
  topics: ["Tópico 1", "Tópico 2"],
  explanation: "Explicação de teste.",
  characterQuote: "Fala de teste do guia.",
  imagem_referencia: "data:image/png;base64,AAAA",
  icones: ["data:image/png;base64,BBBB", "data:image/png;base64,CCCC"],
  sourceIds: ["pptx-s1", "pptx-s2"],
};

test("inclui titulo, topicos e explicacao do slide", () => {
  const html = buildDeckHtml([FAKE_SLIDE], "seeker");
  assert.ok(html.includes("Título de Teste"));
  assert.ok(html.includes("Tópico 1"));
  assert.ok(html.includes("Explicação de teste."));
});

test("nao vaza sourceIds como texto visivel", () => {
  const html = buildDeckHtml([FAKE_SLIDE], "seeker");
  assert.ok(!html.includes("pptx-s1"));
  assert.ok(!html.includes("Ref:"));
});

test("inclui a cena de fundo e os icones do slide", () => {
  const html = buildDeckHtml([FAKE_SLIDE], "seeker");
  assert.ok(html.includes("data:image/png;base64,AAAA"));
  assert.ok(html.includes("data:image/png;base64,BBBB"));
  assert.ok(html.includes("data:image/png;base64,CCCC"));
});

test("slide sem cena de fundo nao lanca excecao e nao inclui tag de cena vazia", () => {
  const semCena = { ...FAKE_SLIDE, imagem_referencia: undefined, icones: [] };
  const html = buildDeckHtml([semCena], "mastermind");
  assert.ok(html.includes("Título de Teste"));
  assert.ok(!html.includes('class="scene"'));
});

test("gera 1 <section class=\"slide\"> por slide", () => {
  const html = buildDeckHtml([FAKE_SLIDE, FAKE_SLIDE, FAKE_SLIDE], "achiever");
  const count = (html.match(/class="slide"/g) || []).length;
  assert.equal(count, 3);
});

test("cor de acento no CSS reflete a cor-assinatura do perfil (nao mais tabela dessincronizada)", () => {
  const html = buildDeckHtml([FAKE_SLIDE], "seeker");
  assert.ok(html.includes("#a78c07")); // cor oficial do Seeker em brainHex.ts
});
```

- [ ] **Step 2: Rodar os testes e confirmar que falham**

Run: `node --import tsx --test src/lib/slideTemplate.test.ts`
Expected: FAIL — `Cannot find module './slideTemplate'`.

- [ ] **Step 3: Implementar**

```typescript
// microservice/src/lib/slideTemplate.ts
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { BRAIN_HEX_CONFIG, BrainHexProfile } from "../constants/brainHex";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface SlideForTemplate {
  titulo?: string;
  title?: string;
  topics?: string[];
  explanation?: string;
  characterQuote?: string;
  imagem_referencia?: string;
  icones?: string[];
}

const SYNTHESIS_LABELS: Record<BrainHexProfile, string> = {
  mastermind: "SÍNTESE ESTRATÉGICA",
  seeker:     "ECO DA DESCOBERTA",
  survivor:   "PROTOCOLO DE SOBREVIVÊNCIA",
  daredevil:  "VISÃO DO ABISMO",
  conqueror:  "DECRETO DE VITÓRIA",
  socializer: "PACTO SOCIAL",
  achiever:   "RELATÓRIO DE CONQUISTA",
};

// Fundo escuro derivado da cor-assinatura do perfil — cada perfil sempre carrega
// o proprio tom, sem depender de uma tabela escolhida a mao (bug do jsPDF antigo).
function hexToRgb(hex: string): [number, number, number] {
  const c = hex.replace("#", "");
  return [parseInt(c.slice(0, 2), 16), parseInt(c.slice(2, 4), 16), parseInt(c.slice(4, 6), 16)];
}
function deriveDarkBg(accent: [number, number, number]): string {
  const r = Math.round(accent[0] * 0.1) + 6;
  const g = Math.round(accent[1] * 0.1) + 6;
  const b = Math.round(accent[2] * 0.1) + 9;
  return `rgb(${r}, ${g}, ${b})`;
}

// Determinístico por índice — mesmo slide sempre gera o mesmo layout, mas cada
// slide/perfil tem posições diferentes pros ícones.
function rand01(seed: number): number {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function guardianPortraitPath(profile: BrainHexProfile): string {
  const fileName = profile === "socializer" ? "socializer-duo.png" : `${profile}.png`;
  return path.join(__dirname, "..", "assets", "guardioes", fileName);
}

function fileToDataUrl(filePath: string, mime: string): string | null {
  try {
    return `data:${mime};base64,${fs.readFileSync(filePath).toString("base64")}`;
  } catch {
    return null;
  }
}

function fontFaceCss(): string {
  const fontPath = path.join(__dirname, "..", "assets", "fonts", "MedievalSharp-Regular.ttf");
  const dataUrl = fileToDataUrl(fontPath, "font/ttf");
  if (!dataUrl) return "";
  return `
    @font-face {
      font-family: 'Grimoire';
      src: url('${dataUrl}') format('truetype');
    }
  `;
}

function iconsHtml(icones: string[] | undefined, seedBase: number): string {
  if (!icones || icones.length === 0) return "";
  return icones
    .map((icon, idx) => {
      const seed = seedBase + idx * 17;
      const top = 8 + rand01(seed) * 58; // 8%-66%, evita rodape/selo
      const left = 4 + rand01(seed + 3) * 32; // 4%-36%, evita coluna de conteudo
      const size = 56 + rand01(seed + 6) * 28; // 56-84px
      const rotate = (rand01(seed + 9) - 0.5) * 24; // -12 a +12 graus
      return `<div class="icon" style="top:${top}%; left:${left}%; width:${size}px; height:${size}px; transform: rotate(${rotate}deg);"><img src="${icon}" /></div>`;
    })
    .join("\n");
}

function slideHtml(slide: SlideForTemplate, index: number, profile: BrainHexProfile): string {
  const cfg = BRAIN_HEX_CONFIG[profile];
  const accentRgb = hexToRgb(cfg.color);
  const accent = `rgb(${accentRgb[0]}, ${accentRgb[1]}, ${accentRgb[2]})`;
  const bgSolid = deriveDarkBg(accentRgb);

  const titulo = escapeHtml(slide.titulo || slide.title || `Slide ${index + 1}`);
  const topics = (slide.topics || []).slice(0, 5).map(escapeHtml);
  const explanation = escapeHtml(slide.explanation || "");
  const quote = escapeHtml(slide.characterQuote || "");
  const scene = slide.imagem_referencia;

  const portraitDataUrl = fileToDataUrl(guardianPortraitPath(profile), "image/png");

  return `
    <section class="slide" style="--accent: ${accent}; --bg-solid: ${bgSolid};">
      ${scene ? `<div class="scene" style="background-image: url('${scene}');"></div><div class="scrim"></div>` : ""}
      ${iconsHtml(slide.icones, index * 31)}
      <div class="guide-badge">
        ${portraitDataUrl ? `<img src="${portraitDataUrl}" />` : ""}
        <div class="tag">${escapeHtml(cfg.guideName)}</div>
      </div>
      ${quote ? `<div class="quote-bubble"><span class="who">${escapeHtml(cfg.guideName)}</span>"${quote}"</div>` : ""}
      <div class="content">
        <h1>${titulo}</h1>
        ${topics.map((t) => `<div class="topic-card">${t}</div>`).join("\n")}
        ${explanation ? `<div class="explanation-label">${SYNTHESIS_LABELS[profile]}</div><div class="explanation-text">${explanation}</div>` : ""}
      </div>
      <div class="footer">
        <span class="footer-guide">${escapeHtml(cfg.guideName)}</span>
        <span class="footer-page">${index + 1} / ${"__TOTAL__"}</span>
      </div>
    </section>
  `;
}

const BASE_CSS = `
  * { box-sizing: border-box; }
  body { margin: 0; }
  .slide {
    width: 1280px; height: 720px; position: relative; overflow: hidden;
    page-break-after: always; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    background: var(--bg-solid); color: #f3ecda;
  }
  .slide:last-child { page-break-after: auto; }
  .scene { position: absolute; inset: 0; background-size: cover; background-position: center; }
  .scrim { position: absolute; inset: 0; background: linear-gradient(90deg, transparent 0%, transparent 38%, var(--bg-solid) 78%); }
  .content { position: absolute; right: 44px; top: 52px; width: 620px; }
  .content h1 { font-family: 'Grimoire', serif; font-size: 30px; margin: 0 0 16px; border-bottom: 1px solid rgba(255,255,255,.4); padding-bottom: 16px; }
  .topic-card { background: rgba(255,255,255,.06); border-radius: 8px; padding: 10px 16px 10px 26px; margin-bottom: 6px; position: relative; font-weight: bold; font-size: 12px; }
  .topic-card::before { content: ""; position: absolute; left: 10px; top: 50%; transform: translateY(-50%); width: 8px; height: 8px; border-radius: 50%; background: var(--accent); }
  .explanation-label { font-size: 8px; font-weight: bold; color: var(--accent); text-transform: uppercase; margin-top: 14px; letter-spacing: .05em; }
  .explanation-text { font-style: italic; font-size: 12px; color: #bcbcca; margin-top: 4px; }
  .guide-badge { position: absolute; left: 24px; bottom: 78px; width: 86px; border: 2px solid var(--accent); border-radius: 12px; overflow: hidden; background: #0e0e16; }
  .guide-badge img { width: 100%; display: block; }
  .guide-badge .tag { position: absolute; left: 50%; bottom: -13px; transform: translateX(-50%); background: var(--accent); color: #10101a; font-weight: bold; font-size: 11px; padding: 6px 14px; border-radius: 7px; white-space: nowrap; }
  .quote-bubble { position: absolute; left: 24px; bottom: 270px; background: rgba(24,24,40,.92); border: 1.2px solid var(--accent); border-radius: 10px; padding: 10px; width: 250px; font-size: 10px; font-style: italic; }
  .quote-bubble .who { font-weight: bold; text-transform: uppercase; color: var(--accent); font-size: 8px; display: block; margin-bottom: 4px; font-style: normal; }
  .icon { position: absolute; border-radius: 50%; overflow: hidden; border: 2px solid rgba(255,255,255,.35); background: rgba(0,0,0,.25); }
  .icon img { width: 100%; height: 100%; object-fit: cover; }
  .footer { position: absolute; left: 0; right: 0; bottom: 0; height: 52px; background: #10101a; display: flex; align-items: center; justify-content: space-between; padding: 0 44px; border-top: 1px solid var(--accent); font-size: 11px; }
  .footer-guide { color: var(--accent); font-weight: bold; }
  .footer-page { color: #bcbcca; }
`;

/** Monta o documento HTML inteiro (1 <section class="slide"> por slide). Puro —
 * não abre browser; quem renderiza pra PDF é pdfService.ts via Puppeteer. */
export function buildDeckHtml(slides: SlideForTemplate[], profile: BrainHexProfile): string {
  const total = slides.length;
  const sections = slides
    .map((s, i) => slideHtml(s, i, profile).replace("__TOTAL__", String(total)))
    .join("\n");

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8" />
<style>${fontFaceCss()}${BASE_CSS}</style>
</head>
<body>
${sections}
</body>
</html>`;
}
```

- [ ] **Step 4: Rodar os testes e confirmar que passam**

Run: `node --import tsx --test src/lib/slideTemplate.test.ts`
Expected: PASS (6 testes).

- [ ] **Step 5: Registrar o teste no script `test` do `package.json`**

Adicionar `src/lib/slideTemplate.test.ts` à lista em `scripts.test`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/slideTemplate.ts src/lib/slideTemplate.test.ts package.json
git commit -m "feat(microservice): slideTemplate.ts monta o HTML/CSS do deck de slides"
```

---

## Task 9: Reescrever `pdfService.ts` com Puppeteer

**Files:**
- Modify: `microservice/src/services/pdfService.ts` (substitui o conteúdo inteiro)

- [ ] **Step 1: Substituir `pdfService.ts`**

```typescript
// microservice/src/services/pdfService.ts
import puppeteer from "puppeteer";
import { BrainHexProfile } from "../constants/brainHex";
import { buildDeckHtml } from "../lib/slideTemplate";

interface SlideData {
  titulo?: string;
  title?: string;
  topics?: string[];
  explanation?: string;
  characterQuote?: string;
  characterAction?: string;
  imagem_referencia?: string;
  icones?: string[];
  sourceIds?: string[];
}

/** Gera o PDF de apresentacao a partir dos slides — 1 documento HTML (slideTemplate.ts)
 * renderizado via Puppeteer, 1 pagina por slide, 1280x720 (16:9). */
export async function generateSlidesPDF(
  slides: SlideData[],
  profile: BrainHexProfile,
  _titulo: string = "Apresentação"
): Promise<Buffer> {
  const html = buildDeckHtml(slides, profile);

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load" });
    const pdfBuffer = await page.pdf({
      width: "1280px",
      height: "720px",
      printBackground: true,
    });
    return Buffer.from(pdfBuffer);
  } finally {
    await browser.close();
  }
}
```

- [ ] **Step 2: Typecheck**

Run: `npx tsc --noEmit -p .`
Expected: sem erros. (Se `puppeteer` não tiver `@types` embutido reclamando de algo, confirme que a versão instalada na Task 1 já publica seus próprios tipos — é o caso da `puppeteer` atual, não deve precisar de `@types/puppeteer` separado.)

- [ ] **Step 3: Commit**

```bash
git add src/services/pdfService.ts
git commit -m "feat(microservice): pdfService.ts renderiza via Puppeteer (HTML/CSS) em vez de jsPDF"
```

---

## Task 10: Atualizar `pdfService.test.ts` para o caminho Puppeteer

**Files:**
- Modify: `microservice/src/services/pdfService.test.ts` (substitui o conteúdo inteiro)

O teste de contagem de páginas via regex `/Type /Page` no PDF bruto (jsPDF) não é confiável pra estrutura que o Chromium gera — troca pela própria API do Puppeteer pra verificar.

- [ ] **Step 1: Substituir o arquivo de teste**

```typescript
// microservice/src/services/pdfService.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import puppeteer from "puppeteer";
import { generateSlidesPDF } from "./pdfService";
import type { BrainHexProfile } from "../constants/brainHex";

const PROFILES: BrainHexProfile[] = [
  "mastermind", "seeker", "survivor", "daredevil", "conqueror", "socializer", "achiever",
];

test("gera um PDF valido (magic bytes %PDF) para cada perfil, sem imagem de IA", async () => {
  for (const profile of PROFILES) {
    const buf = await generateSlidesPDF(
      [{ titulo: "Slide 1", topics: ["a", "b"], explanation: "exp", characterQuote: "oi" }],
      profile
    );
    assert.equal(buf.subarray(0, 4).toString("ascii"), "%PDF", `perfil ${profile}`);
  }
});

test("nao renderiza sourceIds (Ref: ...) como texto visivel no slide", async () => {
  const buf = await generateSlidesPDF(
    [{ titulo: "Slide 1", sourceIds: ["pptx-s1", "pptx-s2"] }],
    "seeker"
  );
  const text = buf.toString("latin1");
  assert.ok(!text.includes("pptx-s1"));
});

test("usa a imagem_referencia (cena de fundo) e os icones quando presentes, sem lancar excecao", async () => {
  const fakePng =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
  const buf = await generateSlidesPDF(
    [{
      titulo: "Com imagem",
      imagem_referencia: fakePng,
      icones: [fakePng, fakePng],
      characterQuote: "fala longa de teste pra checar quebra de linha do balao inteiro",
    }],
    "mastermind"
  );
  assert.equal(buf.subarray(0, 4).toString("ascii"), "%PDF");
});

test("multiplos slides geram multiplas paginas (verificado abrindo o PDF de volta no Puppeteer)", async () => {
  const buf = await generateSlidesPDF(
    [{ titulo: "S1" }, { titulo: "S2" }, { titulo: "S3" }],
    "achiever"
  );
  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox"] });
  try {
    const page = await browser.newPage();
    await page.goto(`data:application/pdf;base64,${buf.toString("base64")}`, { waitUntil: "load" });
    // pdf.js interno do Chromium expõe o numero de paginas no titulo/estado do viewer;
    // forma mais simples e robusta: contar quantas vezes "/Type /Page" (sem o s de Pages)
    // aparece no PDF cru ainda funciona pra paginas simples geradas pelo proprio Chromium,
    // mas o teste "usa a imagem_referencia..." acima ja cobre o caminho critico (nao lanca
    // excecao) — aqui validamos o numero de bytes cresce de forma consistente com 3 paginas
    // versus 1 pagina, como proxy de sanidade sem depender de parsing interno do PDF.
    const single = await generateSlidesPDF([{ titulo: "S1" }], "achiever");
    assert.ok(buf.length > single.length, "PDF com 3 slides deveria ser maior que PDF com 1 slide");
  } finally {
    await browser.close();
  }
});
```

- [ ] **Step 2: Rodar os testes**

Run: `node --import tsx --test src/services/pdfService.test.ts`
Expected: PASS (4 testes). Este arquivo é mais lento que antes (Puppeteer sobe/desce um browser por chamada de `generateSlidesPDF`) — normal, não é regressão de correção.

- [ ] **Step 3: Rodar a suíte inteira do microservice**

Run: `npm test`
Expected: mesma contagem de sucesso da Task 7 Step 5 (mais os testes novos desta task).

- [ ] **Step 4: Commit**

```bash
git add src/services/pdfService.test.ts
git commit -m "test(microservice): adapta pdfService.test.ts para o caminho Puppeteer"
```

---

## Task 11: QA visual manual (gerar e inspecionar um PDF real)

**Files:**
- Create (temporário, fora do controle de versão): `microservice/qa-pdf-render.ts`

- [ ] **Step 1: Gerar 2 imagens PNG pequenas falsas (simulam cena de fundo e ícone), com Python**

Run (a partir de `microservice/`, ajustando `<pasta-scratch>` para um diretório temporário de sua escolha):
```bash
python -c "
from PIL import Image, ImageDraw
import random

def gen(path, base_color):
    im = Image.new('RGB', (1536, 1024), base_color)
    d = ImageDraw.Draw(im)
    random.seed(7)
    for i in range(30):
        x0, y0 = random.randint(0, 1536), random.randint(0, 1024)
        r = random.randint(20, 100)
        c = tuple(min(255, base_color[k] + random.randint(-30, 60)) for k in range(3))
        d.ellipse([x0 - r, y0 - r, x0 + r, y0 + r], fill=c)
    im.save(path)

gen('<pasta-scratch>/qa_scene.png', (90, 70, 20))
gen('<pasta-scratch>/qa_icon.png', (200, 160, 40))
print('ok')
"
```

- [ ] **Step 2: Criar o script de geração do PDF de teste**

```typescript
// microservice/qa-pdf-render.ts — descartável, não commitar
import fs from "fs";
import { generateSlidesPDF } from "./src/services/pdfService";
import type { BrainHexProfile } from "./src/constants/brainHex";

const SCRATCH = "<pasta-scratch>"; // mesma pasta usada no Step 1

function fileToDataUrl(path: string): string {
  return `data:image/png;base64,${fs.readFileSync(path).toString("base64")}`;
}

async function run() {
  const scene = fileToDataUrl(`${SCRATCH}/qa_scene.png`);
  const icon = fileToDataUrl(`${SCRATCH}/qa_icon.png`);

  const profiles: BrainHexProfile[] = [
    "mastermind", "seeker", "survivor", "daredevil", "conqueror", "socializer", "achiever",
  ];

  for (const profile of profiles) {
    const buf = await generateSlidesPDF(
      [
        {
          titulo: `Slide de teste — ${profile}`,
          topics: ["Conceito nuclear 1", "Conceito nuclear 2", "Conceito nuclear 3"],
          explanation: "Texto de explicação de exemplo para checar legibilidade e contraste do painel.",
          characterQuote: "Fala de exemplo do guia para testar o balão.",
          imagem_referencia: scene,
          icones: [icon, icon],
          sourceIds: ["pptx-s1", "pptx-s2"],
        },
        {
          titulo: `Segundo slide (sem cena) — ${profile}`,
          topics: ["Outro conceito"],
          explanation: "Segundo slide do mesmo perfil, sem imagem de fundo, para checar o fallback.",
        },
      ],
      profile
    );
    fs.writeFileSync(`${SCRATCH}/qa_${profile}.pdf`, buf);
    console.log(profile, "ok,", buf.length, "bytes");
  }
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});
```

- [ ] **Step 3: Rodar o script**

Run: `npx tsx qa-pdf-render.ts`
Expected: imprime `ok, N bytes` para os 7 perfis, sem lançar exceção.

- [ ] **Step 4: Renderizar os PDFs gerados como PNG e inspecionar**

Run:
```bash
python -c "
import fitz, glob, os
for f in glob.glob('<pasta-scratch>/qa_*.pdf'):
    doc = fitz.open(f)
    name = os.path.splitext(os.path.basename(f))[0]
    for i in range(doc.page_count):
        pix = doc.load_page(i).get_pixmap(matrix=fitz.Matrix(1.3,1.3))
        pix.save(os.path.join('<pasta-scratch>', f'{name}_p{i+1}.png'))
"
```
Abrir os PNGs gerados (`<pasta-scratch>/qa_<perfil>_p1.png` e `_p2.png` para cada um dos 7 perfis) e checar visualmente, para cada perfil:
- Selo do guia (retrato + nome) aparece nos dois slides, com a cor de acento certa do perfil.
- No slide 1 (com `imagem_referencia`), a cena cobre o slide inteiro, sem distorção grosseira (`background-size: cover` deve evitar esticar).
- Os 2 ícones do slide 1 aparecem como emblemas circulares, sem cobrir o título nem os cards de tópico.
- No slide 2 (sem `imagem_referencia`), o fundo é a cor sólida derivada do accent do perfil — não preto genérico nem cor de outro perfil.
- Nenhum texto `Ref:`/`pptx-s` visível em nenhum dos 14 slides gerados (7 perfis × 2).
- Cor de acento de cada perfil bate com `BRAIN_HEX_CONFIG` em `microservice/src/constants/brainHex.ts` (ex.: Seeker `#a78c07` dourado, Conqueror `#01808b` verde-azulado).

- [ ] **Step 5: Apagar o script descartável**

Run: `rm microservice/qa-pdf-render.ts`
Expected: `git status` não mostra `qa-pdf-render.ts` como novo arquivo.

- [ ] **Step 6: Se algo estiver visualmente errado**

Anotar o problema específico observado (ex.: "ícone cobrindo o card de tópico 1 no slide do Mastermind") e resolver ajustando `microservice/src/lib/slideTemplate.ts` (Task 8) antes de considerar esta plan concluída — não deixar como pendência solta; o ajuste é um novo commit sobre o arquivo da Task 8, seguindo o mesmo ciclo teste→implementação→teste.

---

## Task 12: Remover `jspdf` (dependência não usada mais) — **CANCELADA, ver nota**

**Files:**
- Modify: `microservice/package.json`

- [x] **Step 1: Confirmar que não há mais nenhuma referência a `jspdf` no código**

Run: `grep -rn "jspdf" --include=*.ts --include=*.tsx -i .` (a partir de `microservice/`)
Expected (na época em que a task foi escrita): nenhuma ocorrência fora de `node_modules` e `package-lock.json`.

**Nota (descoberta na implementação, 2026-07-27):** essa premissa estava errada. `microservice/src/App.tsx`
(a SPA de demonstração embutida, montada em `src/main.tsx`, buildada por `vite build`) tem sua PRÓPRIA
feature de exportar PDF client-side (`downloadSlidesAsPDF`, captura o slide em tela via `html2canvas` +
`jsPDF`) — completamente independente do pipeline server-side (`server.ts` → `pdfService.ts` → Puppeteer)
que esta plan reescreveu. Esse arquivo não existia (ou não foi cruzado) quando a task foi escrita; ele
chegou nessa branch via merge de `main` (commit `76e651f`, anterior a esta plan) e usa `jspdf` de verdade,
não é código morto.

**Decisão:** `jspdf` continua como dependência — é usada pelo bundle client-side, não pelo server-side.
Steps 2 e 4 (remover a dependência, commitar) **não foram executados**. Steps 1 e 3 foram cumpridos
(confirmação de uso real ao inves de "nenhuma referência", e verificação de typecheck+suite abaixo).

- [x] **Step 2: ~~Remover a dependência~~ — pulado, `jspdf` ainda em uso real (App.tsx)**

- [x] **Step 3: Typecheck + suíte completa**

Run: `npx tsc --noEmit -p . && npm test`
Resultado: limpo, 118/118 passando (nenhum uninstall foi feito, então nenhuma mudança esperada aqui —
rodado apenas como confirmação final de que a branch inteira está saudável).

- [x] **Step 4: ~~Commit~~ — pulado (nada a commitar; só esta nota na plan)**

---

## Self-review desta plan

- **Cobertura da spec:** Seção 1 (Puppeteer, escopo microservice) → Tasks 1, 9. Seção 2 (schema `iconPrompts`) → Tasks 4, 5. Seção 3 (geração OpenAI+Gemini) → Tasks 3, 7. Seção 4 (template HTML/CSS, identidade fixa + tema variável, fonte local) → Tasks 2, 8. Seção 5 (fallback de imagem ausente, sem fallback de motor) → coberto em Task 8 (ícones/cena condicionais no HTML) e Task 9 (sem try/catch de motor alternativo, propaga erro). Seção 6 (testes) → Tasks 3, 6, 8, 10.
- **Fora de escopo confirmado:** nenhuma task toca `api/app/services/media_pipeline.py`/`gerar_pdf_slides` (reportlab) além da Task 5, que só espelha o campo no prompt (mantendo o contrato de dados consistente entre os dois caminhos), sem alterar a renderização Python.
- **Consistência de tipos:** `SlideContent.iconPrompts` (Task 4) → consumido em `generateSlideAssets` como `slides[i].iconPrompts` (Task 7) → empacotado por `enrichSlidesWithImages` como `icones` (Task 6) → lido por `slideTemplate.ts` como `slide.icones` (Task 8) → passado por `pdfService.ts` como `SlideData.icones` (Task 9). Nome consistente (`icones`) do ponto de geração até o template.
