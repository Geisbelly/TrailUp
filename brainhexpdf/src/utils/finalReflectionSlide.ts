import type { SlideData } from '../types';

const FINAL_SLIDE_TYPES = new Set(['epic_conclusion', 'reward_certificate']);

/**
 * Runs after pagination, before generateInteractiveHtml. The final slide's
 * interactiveElement (a reflection/action widget) used to be squeezed into
 * the footer of the conclusion slide alongside the summary cards. It now
 * gets its own slide, in the same spirit as insertReflectionCheckpoints.
 */
export function extractFinalReflectionIntoOwnSlide(slides: SlideData[]): SlideData[] {
  if (!Array.isArray(slides) || slides.length === 0) return slides;

  const lastIndex = slides.length - 1;
  const lastSlide = slides[lastIndex];

  if (!FINAL_SLIDE_TYPES.has(lastSlide.type) || !lastSlide.interactiveElement) {
    return slides;
  }

  const { interactiveElement, ...finalSlideWithoutReflection } = lastSlide;

  const reflectionSlide: SlideData = {
    id: `${lastSlide.id}-reflexao-final`,
    type: 'pre_conclusion_reflection',
    title: 'Antes de Concluir...',
    contentParagraphs: [],
    layout: 'monumental-card',
    interactiveElement,
  } as SlideData;

  return [...slides.slice(0, lastIndex), reflectionSlide, finalSlideWithoutReflection as SlideData];
}
