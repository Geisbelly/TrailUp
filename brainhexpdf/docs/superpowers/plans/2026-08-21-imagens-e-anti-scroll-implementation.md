# Imagens Visuais Reais e Fim do Scroll Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Todo deck de apresentação ganha elementos visuais reais (reaproveitando ou reilustrando imagens do material, ou gerando ilustrações novas por subtópico quando não há nenhuma), e o scroll de slides do tipo `cover` — a lacuna real da spec anterior — é eliminado.

**Architecture:** Duas mudanças independentes no pipeline de `POST /api/v1/render-and-store`, ambas depois de `generateDeckSlidesInBatches` e antes de `insertReflectionCheckpoints`/`paginateSlidesByDensity`: (1) `resolveReferenceImages.ts` vira `slideIllustrations.ts`, com um `ImageGenerator` injetado que decide reaproveitar/reilustrar/gerar-por-subtópico; (2) `slidePagination.ts` ganha pesos novos (imagem, capa) e para de excluir `cover` da divisão.

**Tech Stack:** TypeScript, `@google/genai` (Gemini, geração de imagem multimodal já existe via `generateImageWithKeyRotation` — ganha um parâmetro novo), `node:test`.

**Design doc:** `docs/superpowers/specs/2026-08-21-imagens-e-anti-scroll-design.md`

---

## File Structure

| Arquivo | Mudança |
|---|---|
| `server.ts` | Modify — `generateImageWithKeyRotation` aceita imagem de referência; schema/prompt ganham `restyleReferenceImage`; render-and-store usa `resolveSlideIllustrations` |
| `src/utils/resolveReferenceImages.ts`, `.test.ts` | **Delete** — substituídos por `slideIllustrations.ts` |
| `src/utils/slideIllustrations.ts`, `.test.ts` | **Create** |
| `src/utils/slidePagination.ts` | Modify — pesos de imagem/capa, teto menor, capa divisível, downgrade de tipo na parte 2 |
| `src/utils/slidePagination.test.ts` | Modify |

---

### Task 1: `generateImageWithKeyRotation` aceita imagem de referência (image-to-image)

**Files:**
- Modify: `server.ts`

- [ ] **Step 1: Adiciona o parâmetro `referenceImage` e inclui como `inlineData` na chamada ao Gemini**

Encontre:

```ts
async function generateImageWithKeyRotation(
  promptText: string,
  options: {
    aspectRatio?: '16:9' | '1:1' | '4:3' | '3:4' | '9:16';
    preferredModel?: string;
    requestKeys?: string[];
  } = {}
): Promise<{ imageUrl: string; modelUsed: string; keyIndexUsed: number }> {
```

Substitua por:

```ts
async function generateImageWithKeyRotation(
  promptText: string,
  options: {
    aspectRatio?: '16:9' | '1:1' | '4:3' | '3:4' | '9:16';
    preferredModel?: string;
    requestKeys?: string[];
    // Presente quando a geracao deve partir de uma imagem existente do
    // material do professor (reilustrar mantendo o exemplo original como
    // base) em vez de texto->imagem puro.
    referenceImage?: { mimeType: string; data: string };
  } = {}
): Promise<{ imageUrl: string; modelUsed: string; keyIndexUsed: number }> {
```

Encontre:

```ts
      const response = await ai.models.generateContent({
        model: currentModel,
        contents: {
          parts: [
            {
              text: promptText,
            },
          ],
        },
        config: {
          imageConfig: {
            aspectRatio: aspectRatio as any,
          },
        },
      });
```

Substitua por:

```ts
      const response = await ai.models.generateContent({
        model: currentModel,
        contents: {
          parts: [
            ...(options.referenceImage
              ? [{ inlineData: { mimeType: options.referenceImage.mimeType, data: options.referenceImage.data } }]
              : []),
            {
              text: promptText,
            },
          ],
        },
        config: {
          imageConfig: {
            aspectRatio: aspectRatio as any,
          },
        },
      });
```

- [ ] **Step 2: Roda o typecheck**

Run: `cd BrainHexPDF && npm run lint`
Expected: sem erros.

- [ ] **Step 3: Commit**

```bash
cd BrainHexPDF
git add server.ts
git commit -m "feat: generateImageWithKeyRotation aceita imagem de referencia para reilustrar"
```

---

### Task 2: `slideIllustrations.ts` — reaproveitar, reilustrar ou gerar por subtópico

**Files:**
- Delete: `src/utils/resolveReferenceImages.ts`, `src/utils/resolveReferenceImages.test.ts`
- Create: `src/utils/slideIllustrations.ts`, `src/utils/slideIllustrations.test.ts`

- [ ] **Step 1: Remove os arquivos antigos**

```bash
cd BrainHexPDF
git rm src/utils/resolveReferenceImages.ts src/utils/resolveReferenceImages.test.ts
```

- [ ] **Step 2: Escreve os testes (falhando) do módulo novo**

Create `src/utils/slideIllustrations.test.ts`:

```ts
import assert from 'node:assert/strict';
import test from 'node:test';

import type { SlideData } from '../types';
import { resolveSlideIllustrations } from './slideIllustrations';
import type { GeneratedImage, ImageGenerator } from './slideIllustrations';

function makeSlide(overrides: Partial<SlideData> & Record<string, unknown> = {}): SlideData {
  return {
    id: 'slide-1',
    type: 'concept_breakdown',
    title: 'Slide de teste',
    contentParagraphs: ['Parágrafo.'],
    layout: 'split-character',
    ...overrides,
  } as SlideData;
}

const attachments = [
  { mimeType: 'image/png', dataBase64: 'AAAA', name: 'diagrama.png' },
  { mimeType: 'image/jpeg', dataBase64: 'BBBB', name: 'foto.jpg' },
];

function neverCalledGenerator(): ImageGenerator {
  return async () => {
    throw new Error('generateImage nao deveria ter sido chamado');
  };
}

test('reaproveita a imagem original quando referenceImageIndex esta presente sem restyleReferenceImage', async () => {
  const slides = [makeSlide({ referenceImageIndex: 0 } as any)];

  const result = await resolveSlideIllustrations(slides, attachments, neverCalledGenerator());

  assert.equal(result[0].referenceImageDataUri, 'data:image/png;base64,AAAA');
});

test('chama o gerador COM a imagem de referencia quando restyleReferenceImage=true', async () => {
  const slides = [makeSlide({ referenceImageIndex: 1, restyleReferenceImage: true } as any)];
  const calls: Array<{ prompt: string; referenceImage?: { mimeType: string; data: string } }> = [];
  const generator: ImageGenerator = async (params) => {
    calls.push(params);
    return { mimeType: 'image/png', dataBase64: 'ESTILIZADA' };
  };

  const result = await resolveSlideIllustrations(slides, attachments, generator);

  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].referenceImage, { mimeType: 'image/jpeg', data: 'BBBB' });
  assert.equal(result[0].referenceImageDataUri, 'data:image/png;base64,ESTILIZADA');
});

test('cai de volta pra imagem original quando a reilustracao falha (gerador devolve null)', async () => {
  const slides = [makeSlide({ referenceImageIndex: 0, restyleReferenceImage: true } as any)];
  const generator: ImageGenerator = async () => null;

  const result = await resolveSlideIllustrations(slides, attachments, generator);

  assert.equal(result[0].referenceImageDataUri, 'data:image/png;base64,AAAA');
});

test('ignora indice fora do range sem lancar erro', async () => {
  const slides = [makeSlide({ referenceImageIndex: 5 } as any)];

  const result = await resolveSlideIllustrations(slides, attachments, neverCalledGenerator());

  assert.equal(result[0].referenceImageDataUri, undefined);
});

test('sem attachments: gera 1 ilustracao por subtopico unico, so no primeiro slide do grupo', async () => {
  const slides = [
    makeSlide({ id: 'a', subtopic: 'DNS', title: 'DNS parte 1' }),
    makeSlide({ id: 'b', subtopic: 'DNS', title: 'DNS parte 2' }),
    makeSlide({ id: 'c', subtopic: 'Cache', title: 'Cache' }),
  ];
  const calls: string[] = [];
  const generator: ImageGenerator = async ({ prompt }) => {
    calls.push(prompt);
    return { mimeType: 'image/png', dataBase64: `GERADA-${calls.length}` };
  };

  const result = await resolveSlideIllustrations(slides, [], generator);

  assert.equal(calls.length, 2); // 1 por subtopico unico (DNS, Cache)
  assert.equal(result[0].referenceImageDataUri, 'data:image/png;base64,GERADA-1');
  assert.equal(result[1].referenceImageDataUri, undefined); // mesmo subtopico do slide 'a', nao repete
  assert.equal(result[2].referenceImageDataUri, 'data:image/png;base64,GERADA-2');
});

test('com attachments presentes, NAO gera ilustracao por subtopico (so o caminho 1/2 se aplica)', async () => {
  const slides = [makeSlide({ id: 'a', subtopic: 'DNS' })];

  const result = await resolveSlideIllustrations(slides, attachments, neverCalledGenerator());

  assert.equal(result[0].referenceImageDataUri, undefined);
});

test('slide sem subtopic e sem attachments fica sem imagem, sem quebrar', async () => {
  const slides = [makeSlide({ id: 'a' })];

  const result = await resolveSlideIllustrations(slides, [], neverCalledGenerator());

  assert.equal(result[0].referenceImageDataUri, undefined);
});
```

- [ ] **Step 3: Roda pra confirmar que falha (módulo não existe)**

Run: `cd BrainHexPDF && node --import tsx --test src/utils/slideIllustrations.test.ts`
Expected: FAIL — `Cannot find module './slideIllustrations'`

- [ ] **Step 4: Implementa o módulo**

Create `src/utils/slideIllustrations.ts`:

```ts
import type { SlideData } from '../types';

export interface ImageAttachment {
  mimeType: string;
  dataBase64: string;
  name?: string;
}

export interface GeneratedImage {
  mimeType: string;
  dataBase64: string;
}

export type ImageGenerator = (params: {
  prompt: string;
  referenceImage?: { mimeType: string; data: string };
}) => Promise<GeneratedImage | null>;

function dataUri(mimeType: string, dataBase64: string): string {
  return `data:${mimeType};base64,${dataBase64}`;
}

function buildRestylePrompt(slide: SlideData): string {
  return (
    `Reestilize esta imagem de referência para combinar com o tema "${slide.subtopic || slide.title}" ` +
    'de forma clara e educativa, sem perder o exemplo/conceito original que ela ilustra.'
  );
}

function buildIllustrationPrompt(slide: SlideData): string {
  const firstParagraph = (slide.contentParagraphs || [])[0] || '';
  return (
    `Ilustração educativa e clara representando o conceito: "${slide.subtopic || slide.title}". ` +
    `Contexto: ${firstParagraph.slice(0, 300)}`
  );
}

/**
 * Resolve o referenceImageIndex escolhido pelo Gemini (reaproveita como
 * esta, ou reilustra com base na imagem original quando
 * restyleReferenceImage=true) e, quando o material não tem NENHUMA imagem
 * anexada, gera 1 ilustração por subtópico único — garante que todo deck
 * tenha elemento visual real, não só quando o professor anexou imagem.
 */
export async function resolveSlideIllustrations(
  slides: SlideData[],
  attachments: ImageAttachment[],
  generateImage: ImageGenerator,
): Promise<SlideData[]> {
  if (!Array.isArray(slides)) return slides;

  const resolved: SlideData[] = [];
  for (const slide of slides) {
    const index = (slide as any).referenceImageIndex;
    const restyle = (slide as any).restyleReferenceImage === true;

    if (
      typeof index !== 'number' ||
      !Number.isInteger(index) ||
      index < 0 ||
      index >= attachments.length
    ) {
      resolved.push(slide);
      continue;
    }
    const attachment = attachments[index];
    if (!attachment || !attachment.mimeType || !attachment.dataBase64) {
      resolved.push(slide);
      continue;
    }

    if (!restyle) {
      resolved.push({ ...slide, referenceImageDataUri: dataUri(attachment.mimeType, attachment.dataBase64) });
      continue;
    }

    const styled = await generateImage({
      prompt: buildRestylePrompt(slide),
      referenceImage: { mimeType: attachment.mimeType, data: attachment.dataBase64 },
    });
    resolved.push({
      ...slide,
      referenceImageDataUri: styled
        ? dataUri(styled.mimeType, styled.dataBase64)
        : dataUri(attachment.mimeType, attachment.dataBase64),
    });
  }

  if (attachments.length > 0) return resolved;

  const seenSubtopics = new Set<string>();
  const final: SlideData[] = [];
  for (const slide of resolved) {
    const subtopic = typeof slide.subtopic === 'string' ? slide.subtopic.trim() : '';
    if (!subtopic || seenSubtopics.has(subtopic) || slide.referenceImageDataUri) {
      final.push(slide);
      continue;
    }
    seenSubtopics.add(subtopic);
    const generated = await generateImage({ prompt: buildIllustrationPrompt(slide) });
    final.push(
      generated ? { ...slide, referenceImageDataUri: dataUri(generated.mimeType, generated.dataBase64) } : slide,
    );
  }
  return final;
}
```

- [ ] **Step 5: Roda pra confirmar que passa**

Run: `cd BrainHexPDF && node --import tsx --test src/utils/slideIllustrations.test.ts`
Expected: `# tests 7`, `# pass 7`, `# fail 0`

- [ ] **Step 6: Commit**

```bash
cd BrainHexPDF
git add src/utils/slideIllustrations.ts src/utils/slideIllustrations.test.ts src/utils/resolveReferenceImages.ts src/utils/resolveReferenceImages.test.ts
git commit -m "feat: reaproveita, reilustra ou gera ilustracao por subtopico para os slides"
```

---

### Task 3: `slidePagination.ts` — capa entra na paginação, pesos de imagem/capa

**Files:**
- Modify: `src/utils/slidePagination.ts`
- Modify: `src/utils/slidePagination.test.ts`

- [ ] **Step 1: Atualiza constantes, `NON_SPLITTABLE_TYPES` e `estimateSlideWeight`**

Encontre:

```ts
// Heuristic character/weight budget per slide, calibrated against the 16:9
// card (`min-height: 560px` / `max-height: 94vh` in deckExportUtils.ts). Not
// a pixel-exact measurement — same style of estimate as the existing
// SLIDE_COUNT_CHARS_PER_SLIDE constant in server.ts. Tune here if slides are
// still overflowing (raise MAX_CONTENT_WEIGHT) or splitting too eagerly
// (lower it).
const MAX_CONTENT_WEIGHT = 1400;
const RICH_WIDGET_WEIGHT = 500;
const EXAMPLE_WEIGHT = 300;

const NON_SPLITTABLE_TYPES = new Set(['cover', 'epic_conclusion', 'reward_certificate', 'reflection_checkpoint']);

function hasRichWidget(slide: SlideData): boolean {
  return Boolean(
    (slide.timelineSteps && slide.timelineSteps.length > 0) ||
      (slide.metricCards && slide.metricCards.length > 0) ||
      (slide.comparisonColumns && slide.comparisonColumns.length > 0) ||
      (slide.bentoCards && slide.bentoCards.length > 0) ||
      slide.quiz ||
      (slide.checklist && slide.checklist.length > 0) ||
      (slide.decisionChoices && slide.decisionChoices.length > 0)
  );
}

function estimateSlideWeight(slide: SlideData): number {
  const paragraphsWeight = (slide.contentParagraphs || []).reduce((sum, p) => sum + p.length, 0);
  const exampleWeight = slide.writtenExample
    ? EXAMPLE_WEIGHT + (slide.writtenExample.explanation || '').length
    : 0;
  const widgetWeight = hasRichWidget(slide) ? RICH_WIDGET_WEIGHT : 0;
  return paragraphsWeight + exampleWeight + widgetWeight;
}
```

Substitua por:

```ts
// Heuristic character/weight budget per slide, calibrated against the 16:9
// card (`min-height: 560px` / `max-height: 94vh` in deckExportUtils.ts). Not
// a pixel-exact measurement — same style of estimate as the existing
// SLIDE_COUNT_CHARS_PER_SLIDE constant in server.ts. Tune here if slides are
// still overflowing (lower MAX_CONTENT_WEIGHT further) or splitting too
// eagerly (raise it). Teto reduzido de 1400 para 1000: 'cover' agora entra
// na paginação (ver NON_SPLITTABLE_TYPES) e imagens passaram a consumir
// espaço real de coluna, então o orçamento precisa ser mais conservador.
const MAX_CONTENT_WEIGHT = 1000;
const RICH_WIDGET_WEIGHT = 500;
const EXAMPLE_WEIGHT = 300;
// Toda imagem de referência ocupa uma coluna inteira (ver referenceImageHtml
// em deckExportUtils.ts) — nunca contava peso antes, apesar de consumir
// espaço vertical real.
const IMAGE_WEIGHT = 400;
// Slides 'cover' têm overhead fixo que a contagem de parágrafos não capta:
// ícone, badge, divisor e a grade de resumo (Rank/XP/Perfil) no final.
const COVER_OVERHEAD = 350;

// 'cover' saiu daqui — era a lacuna real da versão anterior: o slide
// observado com scroll em produção era exatamente do tipo 'cover'. Ver
// splitSlide abaixo para o rebaixamento de tipo da segunda parte.
const NON_SPLITTABLE_TYPES = new Set(['epic_conclusion', 'reward_certificate', 'reflection_checkpoint']);

function hasRichWidget(slide: SlideData): boolean {
  return Boolean(
    (slide.timelineSteps && slide.timelineSteps.length > 0) ||
      (slide.metricCards && slide.metricCards.length > 0) ||
      (slide.comparisonColumns && slide.comparisonColumns.length > 0) ||
      (slide.bentoCards && slide.bentoCards.length > 0) ||
      slide.quiz ||
      (slide.checklist && slide.checklist.length > 0) ||
      (slide.decisionChoices && slide.decisionChoices.length > 0)
  );
}

function estimateSlideWeight(slide: SlideData): number {
  const paragraphsWeight = (slide.contentParagraphs || []).reduce((sum, p) => sum + p.length, 0);
  const exampleWeight = slide.writtenExample
    ? EXAMPLE_WEIGHT + (slide.writtenExample.explanation || '').length
    : 0;
  const widgetWeight = hasRichWidget(slide) ? RICH_WIDGET_WEIGHT : 0;
  const imageWeight = slide.referenceImageDataUri ? IMAGE_WEIGHT : 0;
  const coverWeight = slide.type === 'cover' ? COVER_OVERHEAD : 0;
  return paragraphsWeight + exampleWeight + widgetWeight + imageWeight + coverWeight;
}
```

- [ ] **Step 2: `splitSlide` rebaixa o tipo da segunda parte quando a original é `cover`**

Encontre:

```ts
  const secondPart: SlideData = {
    ...slide,
    id: `${slide.id}-parte-2`,
    title: `${slide.title} — Parte 2/2`,
    contentParagraphs: paragraphs.slice(mid),
  };
```

Substitua por:

```ts
  const secondPart: SlideData = {
    ...slide,
    id: `${slide.id}-parte-2`,
    title: `${slide.title} — Parte 2/2`,
    contentParagraphs: paragraphs.slice(mid),
    // Capa dividida: a segunda parte vira um slide de conteúdo padrão (2
    // colunas) em vez de repetir ícone/badge/grade de Rank-XP-Perfil da
    // capa, que só fazem sentido uma vez, no início do deck.
    type: slide.type === 'cover' ? 'story_intro' : slide.type,
  };
```

- [ ] **Step 3: Roda a suíte pra ver o que quebra**

Run: `cd BrainHexPDF && node --import tsx --test src/utils/slidePagination.test.ts`
Expected: FAIL no teste `"tipos nao divisiveis (cover, epic_conclusion, reflection_checkpoint) nunca sao divididos"` (cover agora É dividido — esse é o comportamento pretendido). Os outros 4 testes devem continuar passando.

- [ ] **Step 4: Atualiza o teste de `cover` pro novo comportamento, adiciona testes dos pesos novos**

Encontre:

```ts
test('tipos nao divisiveis (cover, epic_conclusion, reflection_checkpoint) nunca sao divididos', () => {
  const cover: SlideData = {
    id: 'cover',
    type: 'cover',
    title: 'Capa',
    contentParagraphs: [longParagraph('x'), longParagraph('y'), longParagraph('z')],
    layout: 'full-banner',
  } as SlideData;

  const result = paginateSlidesByDensity([cover]);
  assert.equal(result.length, 1);
});
```

Substitua por:

```ts
test('slide cover pesado E dividido, e a parte 2 vira story_intro (nao repete cabecalho da capa)', () => {
  const cover: SlideData = {
    id: 'cover',
    type: 'cover',
    title: 'Capa',
    contentParagraphs: [longParagraph('x'), longParagraph('y'), longParagraph('z'), longParagraph('w')],
    layout: 'full-banner',
  } as SlideData;

  const result = paginateSlidesByDensity([cover]);

  assert.equal(result.length, 2);
  assert.equal(result[0].type, 'cover');
  assert.equal(result[1].type, 'story_intro');
});

test('tipos ainda nao divisiveis (epic_conclusion, reward_certificate, reflection_checkpoint) nunca sao divididos', () => {
  const conclusion: SlideData = {
    id: 'fim',
    type: 'epic_conclusion',
    title: 'Fim',
    contentParagraphs: [longParagraph('x'), longParagraph('y'), longParagraph('z')],
    layout: 'full-banner',
  } as SlideData;

  const result = paginateSlidesByDensity([conclusion]);
  assert.equal(result.length, 1);
});

test('imagem de referencia soma peso ao slide (pode empurrar pra divisao)', () => {
  const withImage: SlideData = {
    id: 'com-imagem',
    type: 'concept_breakdown',
    title: 'Slide com imagem',
    contentParagraphs: [longParagraph('a'), longParagraph('b')],
    layout: 'split-character',
    referenceImageDataUri: 'data:image/png;base64,AAAA',
  } as SlideData;
  const withoutImage: SlideData = { ...withImage, id: 'sem-imagem', referenceImageDataUri: undefined };

  const withImageResult = paginateSlidesByDensity([withImage]);
  const withoutImageResult = paginateSlidesByDensity([withoutImage]);

  // 2 paragrafos de 400 chars = peso 800, abaixo do teto de 1000 sozinho -
  // só a imagem (peso 400) empurra pra 1200, acima do teto.
  assert.equal(withImageResult.length, 2);
  assert.equal(withoutImageResult.length, 1);
});
```

- [ ] **Step 5: Roda a suíte completa de novo**

Run: `cd BrainHexPDF && node --import tsx --test src/utils/slidePagination.test.ts`
Expected: todos os testes `PASSED`.

- [ ] **Step 6: Commit**

```bash
cd BrainHexPDF
git add src/utils/slidePagination.ts src/utils/slidePagination.test.ts
git commit -m "feat: cover entra na paginacao por densidade, pesos novos de imagem e capa"
```

---

### Task 4: Schema e prompt — `restyleReferenceImage` + limite de reilustrações

**Files:**
- Modify: `server.ts`

- [ ] **Step 1: Adiciona `restyleReferenceImage` ao schema, ao lado de `referenceImageIndex`**

Encontre:

```ts
          referenceImageIndex: {
            type: Type.NUMBER,
            description: 'Índice (0-based) da imagem de referência anexada (ver seção "IMAGENS DE REFERÊNCIA ANEXADAS" no prompt) que é diretamente relevante a este slide. Omita este campo se não houver imagem relevante — não invente um índice.',
          },
```

Substitua por:

```ts
          referenceImageIndex: {
            type: Type.NUMBER,
            description: 'Índice (0-based) da imagem de referência anexada (ver seção "IMAGENS DE REFERÊNCIA ANEXADAS" no prompt) que é diretamente relevante a este slide. Omita este campo se não houver imagem relevante — não invente um índice.',
          },
          restyleReferenceImage: {
            type: Type.BOOLEAN,
            description: 'Só relevante junto com referenceImageIndex. true quando a imagem original se beneficia de uma versão nova estilizada pro perfil BrainHex (ex.: foto genérica, fora do tom do perfil); false ou omitido quando a imagem original já serve como exemplo visual direto (ex.: diagrama técnico já claro).',
          },
```

- [ ] **Step 2: Atualiza a instrução 7 do prompt com o limite de reilustrações**

Encontre:

```ts
7. IMAGENS DE REFERÊNCIA: Se houver imagens listadas em "IMAGENS DE REFERÊNCIA ANEXADAS" e alguma for diretamente relevante ao subtópico de um slide, preencha "referenceImageIndex" com o índice correspondente em vez de inventar uma descrição visual genérica para aquele slide. Se nenhuma imagem for relevante, omita o campo — não force um índice arbitrário.
```

Substitua por:

```ts
7. IMAGENS DE REFERÊNCIA: Se houver imagens listadas em "IMAGENS DE REFERÊNCIA ANEXADAS" e alguma for diretamente relevante ao subtópico de um slide, preencha "referenceImageIndex" com o índice correspondente em vez de inventar uma descrição visual genérica para aquele slide. Se nenhuma imagem for relevante, omita o campo — não force um índice arbitrário. Quando a imagem original já é um bom exemplo visual (ex.: diagrama técnico já claro), deixe "restyleReferenceImage" de fora. Quando a imagem se beneficia de uma versão estilizada pro perfil (ex.: foto genérica, ilustração fora do tom do perfil), preencha "restyleReferenceImage": true — no máximo em 2-3 slides do deck inteiro, não em todos.
```

- [ ] **Step 3: Roda o typecheck e a suíte completa**

Run: `cd BrainHexPDF && npm run lint`
Expected: sem erros.

- [ ] **Step 4: Commit**

```bash
cd BrainHexPDF
git add server.ts
git commit -m "feat(prompt): restyleReferenceImage decide reaproveitar ou reilustrar, limite de 2-3 por deck"
```

---

### Task 5: Liga `resolveSlideIllustrations` no `/api/v1/render-and-store`

**Files:**
- Modify: `server.ts`

- [ ] **Step 1: Troca o import**

Encontre:

```ts
import { resolveReferenceImageDataUris, type ImageAttachment } from './src/utils/resolveReferenceImages';
```

Substitua por:

```ts
import { resolveSlideIllustrations, type ImageAttachment, type GeneratedImage } from './src/utils/slideIllustrations';
```

- [ ] **Step 2: Adiciona o adaptador que liga `resolveSlideIllustrations` a `generateImageWithKeyRotation`**

Encontre (logo depois da declaração de `generateImageWithKeyRotation`, antes da rota `/api/generate-ambient-background`):

```ts
// API Microservice: POST /api/generate-ambient-background
```

Insira imediatamente antes:

```ts
// Adaptador entre resolveSlideIllustrations (puro, testável com um
// ImageGenerator fake) e generateImageWithKeyRotation (chamada real ao
// Gemini). Falha de geração de imagem nunca derruba o slide inteiro - só
// resulta em nenhuma ilustração pra aquele slide (mesma filosofia de
// resiliência do fallback de SVG em createFallbackAmbientSvg).
async function generateSlideIllustration(params: {
  prompt: string;
  referenceImage?: { mimeType: string; data: string };
}): Promise<GeneratedImage | null> {
  try {
    const result = await generateImageWithKeyRotation(params.prompt, {
      aspectRatio: '4:3',
      referenceImage: params.referenceImage,
    });
    const match = /^data:([^;]+);base64,(.+)$/.exec(result.imageUrl);
    if (!match) return null;
    return { mimeType: match[1], dataBase64: match[2] };
  } catch (err: any) {
    console.warn('[SlideIllustrations] geração de imagem falhou:', err?.message);
    return null;
  }
}

// API Microservice: POST /api/generate-ambient-background
```

- [ ] **Step 3: Troca a chamada dentro de `/api/v1/render-and-store`**

Encontre:

```ts
      deckMeta = batched.deckMeta;
      generatedSlides = resolveReferenceImageDataUris(batched.slides, imageAttachments);
      modelUsed = batched.modelUsed;
```

Substitua por:

```ts
      deckMeta = batched.deckMeta;
      generatedSlides = await resolveSlideIllustrations(batched.slides, imageAttachments, generateSlideIllustration);
      modelUsed = batched.modelUsed;
```

- [ ] **Step 4: Roda o typecheck**

Run: `cd BrainHexPDF && npm run lint`
Expected: sem erros. Se `generateImageWithKeyRotation` estiver declarada DEPOIS do novo `generateSlideIllustration` no arquivo (ordem de declaração de function declarations não importa em JS/TS por hoisting, mas confirme que não há erro de referência).

- [ ] **Step 5: Roda a suíte completa do BrainHexPDF**

Run: `cd BrainHexPDF && npm test`
Expected: `# fail 0`. Se algum teste em `deckExportUtils.test.ts` ou outro arquivo quebrar por causa da assinatura nova, ajuste a fixture seguindo o mesmo princípio das mudanças anteriores (dependências injetadas, sem chamada de rede real em teste).

- [ ] **Step 6: Registra os testes novos em `package.json` (se `slideIllustrations.test.ts` não usar o mesmo nome de `resolveReferenceImages.test.ts`)**

Encontre, no script `test` de `package.json`:

```
src/utils/resolveReferenceImages.test.ts
```

Substitua por:

```
src/utils/slideIllustrations.test.ts
```

- [ ] **Step 7: Roda `npm test` via script pra confirmar**

Run: `cd BrainHexPDF && npm test`
Expected: `# fail 0`.

- [ ] **Step 8: Commit**

```bash
cd BrainHexPDF
git add server.ts package.json
git commit -m "feat: liga resolveSlideIllustrations no render-and-store, com adaptador pro Gemini real"
```

---

## Self-Review

**Spec coverage:**
- Reaproveitar vs. reilustrar (decisão do Gemini) → Task 2 (`resolveSlideIllustrations`) + Task 4 (schema/prompt `restyleReferenceImage`).
- Sem imagem nenhuma → 1 ilustração por subtópico → Task 2 (agrupamento por `subtopic`).
- `cover` entra na paginação, downgrade pra `story_intro` na parte 2 → Task 3.
- Peso de imagem/capa no orçamento, teto mais rigoroso → Task 3.
- Sem Puppeteer/Chrome headless → decisão explícita, nenhuma tarefa introduz renderização headless.

**Placeholder scan:** sem TBD/TODO. Todo passo tem código completo e caminho de arquivo exato.

**Type consistency:** `ImageAttachment`/`GeneratedImage`/`ImageGenerator` (Task 2) são os mesmos tipos usados no adaptador (Task 5) e no import atualizado. `restyleReferenceImage`/`referenceImageIndex` lidos via `(slide as any)` em `resolveSlideIllustrations`, mesmo padrão já usado no módulo anterior (não exige mudança em `types.ts`).
