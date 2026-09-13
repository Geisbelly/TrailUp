import type { SlideData } from '../types';

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

// quiz FICA FORA daqui de propósito - ao contrário dos outros widgets ricos
// (sempre um bloco compacto de itens curtos), o texto de um quiz varia
// muito de tamanho (question + N opções + N explanations) e um peso fixo
// escondia quizzes anormalmente longos da paginação (ver quizWeight
// abaixo) - produção real mostrou um quiz com texto repetitivo/degenerado
// (ver src/utils/quizSanitize.ts) nunca disparar split por isso.
// Exportado tambem pra interactiveElementGenerator.ts usar como criterio de
// mutua exclusividade entre o widget estrutural rico e o interactiveElement
// completo (ver enrichDeckWithInteractiveElements) - mesmo conjunto de
// campos, mesma definicao de "ja tem componente rico".
export function hasNonQuizRichWidget(slide: SlideData): boolean {
  return Boolean(
    (slide.timelineSteps && slide.timelineSteps.length > 0) ||
      (slide.metricCards && slide.metricCards.length > 0) ||
      (slide.comparisonColumns && slide.comparisonColumns.length > 0) ||
      (slide.bentoCards && slide.bentoCards.length > 0) ||
      (slide.checklist && slide.checklist.length > 0) ||
      (slide.decisionChoices && slide.decisionChoices.length > 0) ||
      // deckExportUtils.ts usa keyTakeaways como widget de fallback
      // ("PONTOS CARDEAIS DE MAESTRIA") quando nenhum dos campos acima esta
      // presente - faltava aqui, entao um interactiveElement completo
      // (reflection_point/action_prompt) empilhava por cima dele no mesmo
      // slide: dois blocos de widget pesados, mesma causa raiz que os
      // campos acima ja cobrem.
      (slide.keyTakeaways && slide.keyTakeaways.length > 0)
  );
}

function quizWeight(slide: SlideData): number {
  if (!slide.quiz) return 0;
  const questionLen = (slide.quiz.question || '').length;
  const optionsLen = (slide.quiz.options || []).reduce(
    (sum, option) => sum + (option.text || '').length + (option.explanation || '').length,
    0,
  );
  return questionLen + optionsLen;
}

function estimateSlideWeight(slide: SlideData): number {
  const paragraphsWeight = (slide.contentParagraphs || []).reduce((sum, p) => sum + p.length, 0);
  const exampleWeight = slide.writtenExample
    ? EXAMPLE_WEIGHT + (slide.writtenExample.explanation || '').length
    : 0;
  const widgetWeight = hasNonQuizRichWidget(slide) ? RICH_WIDGET_WEIGHT : 0;
  // Grid 2 colunas (referenceImageHtml em deckExportUtils.ts) - com ate 2
  // imagens cabe numa linha so, mesmo peso de sempre; a partir da 2a linha
  // (3+ imagens) cresce em altura de verdade, soma peso proporcional.
  const totalReferenceImages = slide.referenceImageDataUri
    ? 1 + (slide.additionalReferenceImageDataUris?.length || 0)
    : 0;
  const extraImageRows = totalReferenceImages > 0 ? Math.ceil(totalReferenceImages / 2) - 1 : 0;
  const imageWeight = totalReferenceImages > 0 ? IMAGE_WEIGHT + extraImageRows * (IMAGE_WEIGHT / 2) : 0;
  const coverWeight = slide.type === 'cover' ? COVER_OVERHEAD : 0;
  return paragraphsWeight + exampleWeight + widgetWeight + quizWeight(slide) + imageWeight + coverWeight;
}

// Fields that only make sense once per subtopic — dropped from the
// continuation slide(s) so a split slide doesn't duplicate its rich widget
// across parts. referenceImageDataUri NÃO entra aqui (de propósito, desde
// 2026-08-22): a parte 2 de um slide dividido por parágrafo cobre o MESMO
// subtópico da parte 1, então repetir a mesma imagem ilustrativa nas duas
// partes não é duplicação indevida — é o que evita a parte 2 virar um bloco
// de texto minúsculo boiando sozinho num card 9:16 vazio (caso real de
// produção: uma "Parte 2/2" com 1 parágrafo curto e nada mais na tela).
const SINGLE_INSTANCE_FIELDS: (keyof SlideData)[] = [
  'thematicStorytelling',
  'characterGuide',
  'writtenExample',
  'timelineSteps',
  'metricCards',
  'comparisonColumns',
  'bentoCards',
  'quiz',
  'checklist',
  'decisionChoices',
  'interactiveElement',
];

// Bisecta por PESO (soma de caracteres), não por contagem bruta de
// parágrafos - dois parágrafos de tamanhos muito diferentes (ex.: um com
// 1800 chars, outro com 200) split-avam em 1+1 antes, e a parte com o
// parágrafo curto sobrava quase vazia (caso real de produção). Sempre
// deixa pelo menos 1 parágrafo em cada metade.
function splitParagraphsByWeight(paragraphs: string[]): [string[], string[]] {
  const totalWeight = paragraphs.reduce((sum, p) => sum + p.length, 0);
  const halfWeight = totalWeight / 2;

  let running = 0;
  let splitIndex = 1;
  for (let i = 0; i < paragraphs.length; i += 1) {
    running += paragraphs[i].length;
    if (running >= halfWeight) {
      splitIndex = i + 1;
      break;
    }
  }
  splitIndex = Math.min(Math.max(splitIndex, 1), paragraphs.length - 1);

  return [paragraphs.slice(0, splitIndex), paragraphs.slice(splitIndex)];
}

function splitSlide(slide: SlideData): SlideData[] {
  const paragraphs = slide.contentParagraphs || [];
  if (paragraphs.length <= 1) return [slide];

  const [firstParagraphs, secondParagraphs] = splitParagraphsByWeight(paragraphs);
  const firstPart: SlideData = {
    ...slide,
    id: `${slide.id}-parte-1`,
    title: `${slide.title} — Parte 1/2`,
    contentParagraphs: firstParagraphs,
  };

  const secondPart: SlideData = {
    ...slide,
    id: `${slide.id}-parte-2`,
    title: `${slide.title} — Parte 2/2`,
    contentParagraphs: secondParagraphs,
    // Capa dividida: a segunda parte vira um slide de conteúdo padrão (2
    // colunas) em vez de repetir ícone/badge/grade de Rank-XP-Perfil da
    // capa, que só fazem sentido uma vez, no início do deck.
    type: slide.type === 'cover' ? 'story_intro' : slide.type,
  };
  for (const field of SINGLE_INSTANCE_FIELDS) {
    delete (secondPart as any)[field];
  }

  return [firstPart, secondPart];
}

/**
 * Splits any slide whose estimated content weight exceeds the per-slide
 * budget into sequential "Parte 1/2" slides, so the exported deck relies on
 * #slide-stage's overflow-y-auto only as a last-resort safety net instead of
 * the expected way to view a slide. Only splits across paragraph
 * boundaries — a slide with a single oversized paragraph is left as-is
 * (splitting mid-paragraph would need real NLP, out of scope here).
 */
export function paginateSlidesByDensity(slides: SlideData[]): SlideData[] {
  if (!Array.isArray(slides)) return slides;

  return slides.flatMap((slide) => {
    if (NON_SPLITTABLE_TYPES.has(slide.type)) return [slide];
    if (estimateSlideWeight(slide) <= MAX_CONTENT_WEIGHT) return [slide];
    return splitSlide(slide);
  });
}
