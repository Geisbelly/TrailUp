import assert from 'node:assert/strict';
import test from 'node:test';

import { extractFinalReflectionIntoOwnSlide } from './finalReflectionSlide';
import type { SlideData, UniqueInteractiveElement } from '../types';

function makeSlide(overrides: Partial<SlideData>): SlideData {
  return {
    id: 'slide-1',
    type: 'concept_breakdown',
    title: 'Titulo',
    contentParagraphs: ['Paragrafo'],
    layout: 'monumental-card',
    ...overrides,
  } as SlideData;
}

const interactiveElement: UniqueInteractiveElement = {
  id: 'reflect-1',
  type: 'reflection_point',
  title: 'Reflexão Aplicada',
  prompt: 'Como você aplicaria isso no seu dia a dia?',
  xpReward: 50,
};

test('extrai interactiveElement do ultimo slide (epic_conclusion) para um novo slide antes dele', () => {
  const slides = [
    makeSlide({ id: 'a', type: 'cover' }),
    makeSlide({ id: 'b' }),
    makeSlide({ id: 'c', type: 'epic_conclusion', interactiveElement }),
  ];

  const result = extractFinalReflectionIntoOwnSlide(slides);

  assert.equal(result.length, 4);
  assert.equal(result[0].id, 'a');
  assert.equal(result[1].id, 'b');
  assert.equal(result[2].type, 'pre_conclusion_reflection');
  assert.equal(result[2].title, 'Antes de Concluir...');
  assert.deepEqual(result[2].interactiveElement, interactiveElement);
  assert.equal(result[3].id, 'c');
  assert.equal(result[3].interactiveElement, undefined);
});

test('extrai tambem quando o ultimo slide e reward_certificate', () => {
  const slides = [makeSlide({ id: 'a', type: 'reward_certificate', interactiveElement })];

  const result = extractFinalReflectionIntoOwnSlide(slides);

  assert.equal(result.length, 2);
  assert.equal(result[0].type, 'pre_conclusion_reflection');
  assert.equal(result[1].type, 'reward_certificate');
  assert.equal(result[1].interactiveElement, undefined);
});

test('nao faz nada quando o ultimo slide nao tem interactiveElement', () => {
  const slides = [makeSlide({ id: 'a', type: 'epic_conclusion' })];

  const result = extractFinalReflectionIntoOwnSlide(slides);

  assert.deepEqual(result, slides);
});

test('nao faz nada quando o ultimo slide nao e epic_conclusion/reward_certificate', () => {
  const slides = [makeSlide({ id: 'a', type: 'concept_breakdown', interactiveElement })];

  const result = extractFinalReflectionIntoOwnSlide(slides);

  assert.deepEqual(result, slides);
});

test('lida com lista vazia sem quebrar', () => {
  assert.deepEqual(extractFinalReflectionIntoOwnSlide([]), []);
});
