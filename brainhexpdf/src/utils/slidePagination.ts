import type { SlideData } from '../types';

// Orcamento GROSSEIRO por slide. Quem garante que o slide cabe na tela e' o
// proprio deck, no aparelho (paginateCurrentSlide em deckExportUtils.ts): ele
// mede o palco de verdade e divide em paginas no celular em pe, no tablet ou
// no notebook. Uma conta fixa aqui nunca acerta as tres telas - calibrada
// para 640px de altura (03/11) ela picava o desktop e ainda rolava no
// celular. Esta divisao so' existe para que um slide enorme vire slides de
// verdade (titulo "Parte 1/2", indice e progresso proprios) em vez de muitas
// paginas do mesmo slide. Pesos em ~px de altura numa tela de 640px.
const MAX_CONTENT_WEIGHT = 1200;
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

// ---------------------------------------------------------------- altura --
//
// O slide de conteudo tem DUAS colunas (deckExportUtils.ts): texto a esquerda
// (.slide-main) e imagem + widget empilhados a direita (.slide-aside). A
// altura e' a da coluna MAIS ALTA, nao a soma - e a coluna da direita e' mais
// estreita, entao o mesmo texto ocupa mais linhas la' (ASIDE_FACTOR). Ate
// 04/11 a conta somava tudo e dava peso fixo ao widget: um "Etapas" com tres
// passos longos pesava o mesmo que um widget de duas palavras, e o slide
// rolava (print do Socializer, "Jornada da Construção Coletiva - Parte 1/2").
const ASIDE_FACTOR = 1.6;
const HEADER_BASE = 120;
const GUIDE_CALLOUT_WEIGHT = 180;
const BLOCK_OVERHEAD = 120;
const ITEM_OVERHEAD = 90;
const GRID_ROW_WEIGHT = 300;
const PARAGRAPH_OVERHEAD = 40;
const TEXT_FACTOR = 1.1;
// Cada alternativa do quiz e' um botao de ~56px, por mais curto que seja o texto.
const QUIZ_OPTION_OVERHEAD = 110;

function textLen(value: unknown): number {
  return typeof value === 'string' ? value.length : 0;
}

function headerWeight(slide: SlideData): number {
  const guide = slide.characterGuide?.speechText || slide.thematicStorytelling?.narrativeBeat;
  return (
    HEADER_BASE +
    textLen(slide.title) +
    textLen(slide.subtitle) +
    textLen(slide.pedagogicalObjective) +
    (guide ? GUIDE_CALLOUT_WEIGHT + Math.min(textLen(guide), 240) : 0)
  );
}

/** Peso real do widget estrutural (o texto dele, nao um valor fixo). */
function richWidgetWeight(slide: SlideData): number {
  if (!hasNonQuizRichWidget(slide)) return 0;
  const sum = (items: unknown[] | undefined, len: (item: any) => number) =>
    (items || []).reduce<number>((total, item) => total + ITEM_OVERHEAD + len(item), 0);
  const widget =
    sum(slide.timelineSteps, (i) => textLen(i.title) + textLen(i.description) + textLen(i.badge)) +
    sum(slide.metricCards, (i) => textLen(i.value) + textLen(i.label) + textLen(i.sublabel)) +
    sum(slide.comparisonColumns, (i) =>
      textLen(i.title) + textLen(i.subtitle) + (i.items || []).reduce((t: number, x: string) => t + 40 + textLen(x), 0)) +
    sum(slide.bentoCards, (i) => textLen(i.title) + textLen(i.description) + textLen(i.stat)) +
    sum(slide.checklist, (i) => textLen(i.text)) +
    sum(slide.decisionChoices, (i) => textLen(i.label) + textLen(i.description)) +
    // keyTakeaways so' vira widget quando nao ha outro (deckExportUtils.ts).
    (slide.timelineSteps?.length || slide.metricCards?.length || slide.comparisonColumns?.length ||
     slide.bentoCards?.length || slide.checklist?.length || slide.decisionChoices?.length
      ? 0
      : sum(slide.keyTakeaways, (t) => textLen(t)));
  return BLOCK_OVERHEAD + widget;
}

function interactiveElementWeight(slide: SlideData): number {
  const el: any = slide.interactiveElement;
  if (!el) return 0;
  return BLOCK_OVERHEAD * 2 + textLen(el.title) + textLen(el.prompt) + textLen(el.expectedDeliverable)
    + (el.quizOptions || []).reduce((t: number, o: any) => t + ITEM_OVERHEAD + textLen(o.text), 0);
}

function imageWeight(slide: SlideData): number {
  // Grid 2 colunas: ate 2 imagens numa linha; a partir da 3a cresce.
  const total = slide.referenceImageDataUri ? 1 + (slide.additionalReferenceImageDataUris?.length || 0) : 0;
  if (total === 0) return 0;
  // Uma imagem: ate 380px (max-height). Grade: linhas de ate 200px cada.
  return total === 1 ? IMAGE_WEIGHT : Math.ceil(total / 2) * GRID_ROW_WEIGHT;
}

function interactionWeight(slide: SlideData): number {
  const quiz = slide.quiz
    ? BLOCK_OVERHEAD + quizWeight(slide) + (slide.quiz.options || []).length * QUIZ_OPTION_OVERHEAD
    : 0;
  return richWidgetWeight(slide) + quiz + interactiveElementWeight(slide);
}

type MainBlock =
  | { kind: 'paragraph'; text: string }
  | { kind: 'field'; field: 'writtenExample' | 'codeSnippet' | 'stickyNote' | 'secretLore' | 'quote' };

function mainBlockWeight(slide: SlideData, block: MainBlock): number {
  // O espaco entre paragrafos tambem ocupa altura.
  if (block.kind === 'paragraph') return PARAGRAPH_OVERHEAD + block.text.length * TEXT_FACTOR;
  const value: any = (slide as any)[block.field];
  if (block.field === 'writtenExample') return EXAMPLE_WEIGHT + textLen(value?.title) + textLen(value?.explanation) + textLen(value?.code);
  if (block.field === 'codeSnippet') return BLOCK_OVERHEAD + textLen(value?.code) * 1.3;
  return BLOCK_OVERHEAD + JSON.stringify(value || '').length;
}

function mainWeight(slide: SlideData, blocks = mainBlocksOf(slide)): number {
  return blocks.reduce((t, b) => t + mainBlockWeight(slide, b), 0);
}

function asideWeight(slide: SlideData): number {
  // Imagem tem altura fixa (max-height no CSS): nao "quebra linha" na coluna
  // estreita. Widget sozinho, sem texto nem imagem, vai em coluna unica
  // (deckExportUtils.ts) e usa a largura inteira.
  const soloWidget = mainWeight(slide) === 0 && imageWeight(slide) === 0;
  return imageWeight(slide) + interactionWeight(slide) * (soloWidget ? 1 : ASIDE_FACTOR);
}

function estimateSlideWeight(slide: SlideData): number {
  const cover = slide.type === 'cover' ? COVER_OVERHEAD : 0;
  return headerWeight(slide) + cover + Math.max(mainWeight(slide), asideWeight(slide));
}

const MAIN_FIELDS = ['writtenExample', 'codeSnippet', 'stickyNote', 'secretLore', 'quote'] as const;
const INTERACTION_FIELDS: (keyof SlideData)[] = [
  'timelineSteps', 'metricCards', 'comparisonColumns', 'bentoCards', 'checklist',
  'decisionChoices', 'keyTakeaways', 'quiz', 'interactiveElement',
];
// So' fazem sentido uma vez, na primeira parte.
const FIRST_PART_ONLY: (keyof SlideData)[] = ['thematicStorytelling', 'characterGuide'];

/** Paragrafo grande demais vira frases (o corte e' sempre entre frases). */
function splitLongParagraph(text: string, maxLen: number): string[] {
  if (text.length <= maxLen) return [text];
  const sentences = text.match(/[^.!?…]+[.!?…]+["')\]]*\s*|[^.!?…]+$/g) || [text];
  const out: string[] = [];
  let current = '';
  for (const sentence of sentences) {
    if (current && (current + sentence).length > maxLen) {
      out.push(current.trim());
      current = '';
    }
    current += sentence;
  }
  if (current.trim()) out.push(current.trim());
  return out;
}

function mainBlocksOf(slide: SlideData, maxParagraph = Infinity): MainBlock[] {
  const blocks: MainBlock[] = [];
  for (const paragraph of slide.contentParagraphs || []) {
    for (const piece of splitLongParagraph(paragraph, maxParagraph)) blocks.push({ kind: 'paragraph', text: piece });
  }
  for (const field of MAIN_FIELDS) {
    if ((slide as any)[field]) blocks.push({ kind: 'field', field });
  }
  return blocks;
}

function withBlocks(slide: SlideData, blocks: MainBlock[], keepInteraction: boolean, keepImage: boolean): SlideData {
  const part: any = { ...slide, contentParagraphs: blocks.filter((b) => b.kind === 'paragraph').map((b: any) => b.text) };
  for (const field of MAIN_FIELDS) {
    if (!blocks.some((b) => b.kind === 'field' && b.field === field)) delete part[field];
  }
  if (!keepInteraction) for (const field of INTERACTION_FIELDS) delete part[field];
  if (!keepImage) {
    delete part.referenceImageDataUri;
    delete part.additionalReferenceImageDataUris;
  }
  return part as SlideData;
}

/**
 * Divide o slide em quantas partes precisar para nenhuma rolar, por blocos:
 * texto (paragrafos, exemplo, codigo...) empacotado em ordem; a imagem se
 * repete em toda parte (as duas colunas ficam simetricas, e a parte 2 nao vira
 * texto boiando num card vazio); o widget vai junto do ultimo texto se couber,
 * senao ganha uma parte propria.
 */
function splitSlide(slide: SlideData): SlideData[] {
  const head = headerWeight({ ...slide, title: `${slide.title} — Parte 9/9` });
  const cover = slide.type === 'cover' ? COVER_OVERHEAD : 0;
  const capacity = Math.max(300, MAX_CONTENT_WEIGHT - head);
  const imageAside = imageWeight(slide);
  const blocks = mainBlocksOf(slide, capacity);

  // 1. Texto empacotado em partes; a primeira paga o cabecalho da capa.
  const groups: MainBlock[][] = [];
  let current: MainBlock[] = [];
  let used = 0;
  for (const block of blocks) {
    const w = mainBlockWeight(slide, block);
    const room = capacity - (groups.length === 0 ? cover : 0);
    if (current.length > 0 && used + w > room) {
      groups.push(current);
      current = [];
      used = 0;
    }
    current.push(block);
    used += w;
  }
  if (current.length > 0) groups.push(current);

  // 2. O widget: junto do ultimo texto, sem imagem, ou numa parte so' dele.
  const interaction = interactionWeight(slide) * ASIDE_FACTOR;
  const hasInteraction = interaction > 0;
  const parts: Array<{ blocks: MainBlock[]; interaction: boolean; image: boolean }> = groups.map((g) => ({
    blocks: g,
    interaction: false,
    image: imageAside > 0,
  }));
  if (hasInteraction) {
    const last = parts[parts.length - 1];
    const lastMain = last ? mainWeight(slide, last.blocks) : 0;
    if (last && Math.max(lastMain, imageAside + interaction) <= capacity) {
      last.interaction = true;
    } else if (last && Math.max(lastMain, interaction) <= capacity && parts.length > 1) {
      last.interaction = true;
      last.image = false;
    } else {
      // Parte so' do widget: sem imagem ele vai em coluna unica, mais largo.
      parts.push({ blocks: [], interaction: true, image: imageAside + interaction <= capacity });
    }
  }
  if (parts.length <= 1) return [slide];

  const total = parts.length;
  return parts.map((part, index) => {
    const piece = withBlocks(slide, part.blocks, part.interaction, part.image);
    const out: any = {
      ...piece,
      id: `${slide.id}-parte-${index + 1}`,
      title: `${slide.title} — Parte ${index + 1}/${total}`,
    };
    if (index > 0) {
      for (const field of FIRST_PART_ONLY) delete out[field];
      // Capa dividida: as partes seguintes viram conteudo padrao, sem repetir
      // icone/badge da capa.
      if (slide.type === 'cover') out.type = 'story_intro';
    }
    return out as SlideData;
  });
}

/**
 * Divide todo slide cuja altura estimada passa do orcamento em partes
 * sequenciais ("Parte 1/N"), para o deck nunca depender do scroll do palco.
 */
export function paginateSlidesByDensity(slides: SlideData[]): SlideData[] {
  if (!Array.isArray(slides)) return slides;

  return slides.flatMap((slide) => {
    if (NON_SPLITTABLE_TYPES.has(slide.type)) return [slide];
    if (estimateSlideWeight(slide) <= MAX_CONTENT_WEIGHT) return [slide];
    return splitSlide(slide);
  });
}

export const __paginacaoInterna = { estimateSlideWeight, MAX_CONTENT_WEIGHT };
