import assert from 'node:assert/strict';
import test from 'node:test';

import type { SlideData } from '../types';
import { insertReflectionCheckpoints } from './reflectionCheckpoints';

function contentSlide(id: string, keyTakeaways: string[] = []): SlideData {
  return {
    id,
    type: 'concept_breakdown',
    title: `Slide ${id}`,
    contentParagraphs: ['Parágrafo.'],
    layout: 'split-character',
    keyTakeaways,
  } as SlideData;
}

test('insere um checkpoint apos N slides de conteudo, com perguntas vindas de keyTakeaways reais', () => {
  const slides = [
    contentSlide('1', ['Conceito A']),
    contentSlide('2', ['Conceito B']),
    contentSlide('3', ['Conceito C']),
    contentSlide('4', ['Conceito D']),
    contentSlide('5', ['Conceito E']),
  ];

  const result = insertReflectionCheckpoints(slides, 4);

  assert.equal(result.length, 6);
  assert.equal(result[4].type, 'reflection_checkpoint');
  assert.deepEqual(result[4].guidingQuestions, [
    'O que você aprendeu sobre: Conceito A',
    'O que você aprendeu sobre: Conceito B',
    'O que você aprendeu sobre: Conceito C',
  ]);
  assert.equal(result[5].id, '5');
});

test('nao insere checkpoint logo apos o ultimo slide', () => {
  const slides = [
    contentSlide('1', ['A']),
    contentSlide('2', ['B']),
    contentSlide('3', ['C']),
    contentSlide('4', ['D']),
  ];

  const result = insertReflectionCheckpoints(slides, 4);

  assert.equal(result.length, 4);
  assert.ok(result.every((s) => s.type !== 'reflection_checkpoint'));
});

test('nao conta cover/epic_conclusion/reward_certificate pra intervalo', () => {
  const slides: SlideData[] = [
    { id: 'cover', type: 'cover', title: 'Capa', contentParagraphs: [], layout: 'full-banner' } as SlideData,
    contentSlide('1', ['A']),
    contentSlide('2', ['B']),
    contentSlide('3', ['C']),
    contentSlide('4', ['D']),
    contentSlide('5', ['E']),
  ];

  const result = insertReflectionCheckpoints(slides, 4);

  const checkpointIndex = result.findIndex((s) => s.type === 'reflection_checkpoint');
  assert.equal(checkpointIndex, 5);
});

test('pula insercao quando a janela nao tem nenhum keyTakeaway', () => {
  const slides = [contentSlide('1'), contentSlide('2'), contentSlide('3'), contentSlide('4'), contentSlide('5')];

  const result = insertReflectionCheckpoints(slides, 4);

  assert.equal(result.length, 5);
  assert.ok(result.every((s) => s.type !== 'reflection_checkpoint'));
});
