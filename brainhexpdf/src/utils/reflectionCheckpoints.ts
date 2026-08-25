import type { SlideData } from '../types';

const DEFAULT_INTERVAL_SLIDES = 4;
const MAX_GUIDING_QUESTIONS = 3;

const NON_CONTENT_TYPES = new Set(['cover', 'epic_conclusion', 'reward_certificate']);

function collectGuidingQuestions(windowSlides: SlideData[]): string[] {
  const takeaways = windowSlides
    .flatMap((slide) => slide.keyTakeaways || [])
    .filter((takeaway): takeaway is string => typeof takeaway === 'string' && takeaway.trim().length > 0);

  return takeaways.slice(0, MAX_GUIDING_QUESTIONS).map((takeaway) => `O que você aprendeu sobre: ${takeaway}`);
}

function buildCheckpointSlide(guidingQuestions: string[], checkpointNumber: number): SlideData {
  return {
    id: `reflection-checkpoint-${checkpointNumber}`,
    type: 'reflection_checkpoint',
    title: 'Ponto de Reflexão',
    contentParagraphs: [],
    layout: 'monumental-card',
    guidingQuestions,
  } as SlideData;
}

/**
 * Inserts a 'reflection_checkpoint' slide after every `intervalSlides`
 * content slides (cover/epic_conclusion/reward_certificate don't count
 * toward the interval). The guiding questions are built from the
 * `keyTakeaways` Gemini already wrote for those slides — no extra LLM call,
 * no generic filler. A checkpoint is skipped if the window produced zero
 * usable takeaways, and never inserted immediately after the final slide.
 */
export function insertReflectionCheckpoints(
  slides: SlideData[],
  intervalSlides: number = DEFAULT_INTERVAL_SLIDES
): SlideData[] {
  if (!Array.isArray(slides) || slides.length === 0) return slides;

  const result: SlideData[] = [];
  let windowSlides: SlideData[] = [];
  let checkpointCount = 0;

  slides.forEach((slide, index) => {
    result.push(slide);
    if (!NON_CONTENT_TYPES.has(slide.type)) {
      windowSlides.push(slide);
    }

    const isLastSlide = index === slides.length - 1;
    const windowFull = windowSlides.length >= intervalSlides;

    if (windowFull && !isLastSlide) {
      const guidingQuestions = collectGuidingQuestions(windowSlides);
      if (guidingQuestions.length > 0) {
        checkpointCount += 1;
        result.push(buildCheckpointSlide(guidingQuestions, checkpointCount));
      }
      windowSlides = [];
    }
  });

  return result;
}
