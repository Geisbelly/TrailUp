import assert from 'node:assert/strict';
import test from 'node:test';

import type { DeckData, SlideData } from '../types';
import { enrichDeckWithInteractiveElements } from './interactiveElementGenerator';

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

function makeDeck(slides: SlideData[]): DeckData {
  return {
    id: 'deck-teste',
    title: 'Deck de teste',
    subtitle: '',
    subject: 'Testes',
    targetProfile: 'Mastermind',
    rankLevel: 'Guardião',
    slides,
    themeConfig: {} as any,
    createdAt: '2026-08-24',
    author: 'TrailUp',
    estimatedMinutes: 1,
    tags: [],
  } as DeckData;
}

test('remove interactiveElement ja vindo do Gemini quando o slide ja tem timelineSteps (mutuamente exclusivos)', () => {
  const slide = makeSlide({
    timelineSteps: [{ stepNumber: '1', title: 'Etapa', description: 'Desc.' }],
    interactiveElement: {
      id: 'interactive-1',
      type: 'action_prompt',
      title: 'Missão',
      prompt: 'Faça algo.',
      xpReward: 100,
    } as any,
  });

  const result = enrichDeckWithInteractiveElements(makeDeck([slide]));

  assert.equal(result.slides[0].interactiveElement, undefined);
  assert.equal(result.slides[0].timelineSteps?.length, 1);
});

test('remove interactiveElement ja vindo do Gemini quando o slide ja tem keyTakeaways (widget "PONTOS CARDEAIS DE MAESTRIA" - mutuamente exclusivos)', () => {
  const slide = makeSlide({
    keyTakeaways: ['Conceito principal do slide'],
    interactiveElement: {
      id: 'interactive-3',
      type: 'reflection_point',
      title: 'Reflexão Aplicada',
      prompt: 'Reflita sobre isso.',
      xpReward: 185,
    } as any,
  });

  const result = enrichDeckWithInteractiveElements(makeDeck([slide]));

  assert.equal(result.slides[0].interactiveElement, undefined);
  assert.equal(result.slides[0].keyTakeaways?.length, 1);
});

test('nao sintetiza interactiveElement novo quando o slide tem metricCards, checklist, decisionChoices, comparisonColumns, bentoCards ou keyTakeaways', () => {
  const richFields: Array<Partial<SlideData>> = [
    { metricCards: [{ value: '1', label: 'M' }] } as any,
    { checklist: [{ id: 'c1', text: 'Item', xp: 10 }] } as any,
    { decisionChoices: [{ id: 'd1', text: 'Op', outcome: 'x', xpReward: 10 }] } as any,
    { comparisonColumns: [{ title: 'A', items: [] }] } as any,
    { bentoCards: [{ title: 'B', description: 'd' }] } as any,
    { keyTakeaways: ['Aprendizado principal'] } as any,
  ];

  for (const field of richFields) {
    const slide = makeSlide(field);
    const result = enrichDeckWithInteractiveElements(makeDeck([slide]));
    assert.equal(result.slides[0].interactiveElement, undefined, `campo ${Object.keys(field)[0]} deveria bloquear interactiveElement`);
  }
});

test('sintetiza interactiveElement normalmente quando o slide NAO tem nenhum widget estrutural rico', () => {
  const slide = makeSlide({});

  const result = enrichDeckWithInteractiveElements(makeDeck([slide]));

  assert.ok(result.slides[0].interactiveElement);
  assert.ok((result.slides[0].interactiveElement as any).id);
});

test('mantem o interactiveElement do Gemini quando o slide nao tem widget estrutural rico', () => {
  const slide = makeSlide({
    interactiveElement: {
      id: 'interactive-2',
      type: 'reflection_point',
      title: 'Reflexão',
      prompt: 'Pense sobre isso.',
      xpReward: 80,
    } as any,
  });

  const result = enrichDeckWithInteractiveElements(makeDeck([slide]));

  assert.equal((result.slides[0].interactiveElement as any)?.id, 'interactive-2');
});
