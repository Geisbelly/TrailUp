import assert from 'node:assert/strict';
import test from 'node:test';

import type { SlideData } from '../types';
import {
  MAX_QUIZ_OPTION_EXPLANATION_CHARS,
  MAX_QUIZ_OPTION_TEXT_CHARS,
  MAX_QUIZ_QUESTION_CHARS,
  sanitizeQuizContent,
  shuffleQuizOptions,
} from './quizSanitize';

function slideWithQuiz(overrides: Partial<SlideData['quiz']> = {}): SlideData {
  return {
    id: 'slide-1',
    type: 'interactive_challenge',
    title: 'Título',
    contentParagraphs: [],
    quiz: {
      question: 'Pergunta curta?',
      options: [{ id: 'opt-1', text: 'Opção curta', isCorrect: true, explanation: 'Explicação curta.' }],
      ...overrides,
    },
  } as SlideData;
}

test('nao mexe em quiz ja dentro dos limites', () => {
  const slide = slideWithQuiz();
  const [result] = sanitizeQuizContent([slide]);
  assert.equal(result.quiz?.question, 'Pergunta curta?');
  assert.equal(result.quiz?.options[0].text, 'Opção curta');
  assert.equal(result.quiz?.options[0].explanation, 'Explicação curta.');
});

test('trunca question, options[].text e options[].explanation quando passam do limite', () => {
  const slide = slideWithQuiz({
    question: 'x'.repeat(500),
    options: [{ id: 'opt-1', text: 'y'.repeat(500), isCorrect: true, explanation: 'z'.repeat(500) }],
  });

  const [result] = sanitizeQuizContent([slide]);

  assert.ok(result.quiz!.question.length <= MAX_QUIZ_QUESTION_CHARS);
  assert.ok(result.quiz!.options[0].text.length <= MAX_QUIZ_OPTION_TEXT_CHARS);
  assert.ok(result.quiz!.options[0].explanation.length <= MAX_QUIZ_OPTION_EXPLANATION_CHARS);
  assert.ok(result.quiz!.question.endsWith('…'));
});

test('trunca na ultima palavra completa antes do limite, nao no meio de uma palavra', () => {
  const words = Array.from({ length: 60 }, (_, i) => `palavra${i}`).join(' ');
  const slide = slideWithQuiz({ question: words });

  const [result] = sanitizeQuizContent([slide]);

  const withoutEllipsis = result.quiz!.question.replace(/…$/, '');
  assert.ok(!withoutEllipsis.endsWith(' '));
  // cada "palavraN" e uma unidade atomica - se cortou no meio de uma delas,
  // a ultima "palavra" no resultado nao aparece inteira na lista original.
  const lastToken = withoutEllipsis.split(' ').pop()!;
  assert.ok(words.split(' ').includes(lastToken));
});

test('trunca interactiveElement.quizOptions[] pelos mesmos limites', () => {
  const slide: SlideData = {
    id: 'slide-1',
    type: 'interactive_challenge',
    title: 'Título',
    contentParagraphs: [],
    interactiveElement: {
      id: 'ie-1',
      type: 'mini_quiz',
      title: 'Desafio',
      prompt: 'Prompt',
      xpReward: 100,
      quizOptions: [
        { id: 'opt-1', text: 'a'.repeat(500), isCorrect: true, explanation: 'b'.repeat(500) },
      ],
    },
  } as SlideData;

  const [result] = sanitizeQuizContent([slide]);

  const option = result.interactiveElement!.quizOptions![0];
  assert.ok(option.text.length <= MAX_QUIZ_OPTION_TEXT_CHARS);
  assert.ok((option.explanation ?? '').length <= MAX_QUIZ_OPTION_EXPLANATION_CHARS);
});

test('nao mexe em slides sem quiz nem interactiveElement.quizOptions', () => {
  const slide: SlideData = {
    id: 'slide-1',
    type: 'concept_breakdown',
    title: 'Título',
    contentParagraphs: ['Parágrafo normal.'],
  } as SlideData;

  const [result] = sanitizeQuizContent([slide]);

  assert.equal(result, slide);
});

test('array vazio/nao-array passa direto', () => {
  assert.deepEqual(sanitizeQuizContent([]), []);
  assert.equal(sanitizeQuizContent(null as unknown as SlideData[]), null);
});

test('shuffleQuizOptions e deterministico: mesma entrada produz sempre a mesma ordem', () => {
  const slide = slideWithQuiz({
    options: [
      { id: 'a', text: 'A', isCorrect: false, explanation: '' },
      { id: 'b', text: 'B', isCorrect: true, explanation: '' },
      { id: 'c', text: 'C', isCorrect: false, explanation: '' },
      { id: 'd', text: 'D', isCorrect: false, explanation: '' },
    ],
  });

  const primeiraChamada = shuffleQuizOptions([slide])[0].quiz!.options.map((o) => o.id);
  const segundaChamada = shuffleQuizOptions([slide])[0].quiz!.options.map((o) => o.id);

  assert.deepEqual(primeiraChamada, segundaChamada);
});

test('shuffleQuizOptions preserva todas as opcoes, so muda a ordem', () => {
  const slide = slideWithQuiz({
    options: [
      { id: 'a', text: 'A', isCorrect: false, explanation: '' },
      { id: 'b', text: 'B', isCorrect: true, explanation: '' },
      { id: 'c', text: 'C', isCorrect: false, explanation: '' },
      { id: 'd', text: 'D', isCorrect: false, explanation: '' },
    ],
  });

  const resultado = shuffleQuizOptions([slide])[0].quiz!.options;

  assert.deepEqual(new Set(resultado.map((o) => o.id)), new Set(['a', 'b', 'c', 'd']));
  assert.equal(resultado.length, 4);
});

test('shuffleQuizOptions nao deixa a resposta correta sempre no indice 0 para varios slides', () => {
  const slides = Array.from({ length: 20 }, (_, i) =>
    slideWithQuiz({
      question: `Pergunta ${i}`,
      options: [
        { id: 'correta', text: 'Correta', isCorrect: true, explanation: '' },
        { id: 'errada-1', text: 'Errada 1', isCorrect: false, explanation: '' },
        { id: 'errada-2', text: 'Errada 2', isCorrect: false, explanation: '' },
        { id: 'errada-3', text: 'Errada 3', isCorrect: false, explanation: '' },
      ],
    }),
  );
  // slideWithQuiz usa sempre id 'slide-1' - precisamos de ids distintos pra
  // seeds distintas, senao todos embaralham igual.
  const slidesComIdsDistintos = slides.map((s, i) => ({ ...s, id: `slide-${i}` }));

  const resultado = shuffleQuizOptions(slidesComIdsDistintos);
  const indicesDaCorreta = resultado.map((s) => s.quiz!.options.findIndex((o) => o.id === 'correta'));

  assert.ok(indicesDaCorreta.some((idx) => idx !== 0), 'esperava que ao menos um slide tivesse a resposta correta fora do indice 0');
});

test('shuffleQuizOptions tambem embaralha interactiveElement.quizOptions', () => {
  const slide: SlideData = {
    id: 'slide-quiz-unico',
    type: 'interactive_challenge',
    title: 'Título',
    contentParagraphs: [],
    interactiveElement: {
      id: 'ie-1',
      type: 'mini_quiz',
      title: 'Desafio',
      prompt: 'Prompt',
      xpReward: 100,
      quizOptions: [
        { id: 'correta', text: 'Correta', isCorrect: true, explanation: '' },
        { id: 'errada-1', text: 'Errada 1', isCorrect: false, explanation: '' },
        { id: 'errada-2', text: 'Errada 2', isCorrect: false, explanation: '' },
      ],
    },
  } as SlideData;

  const resultado = shuffleQuizOptions([slide])[0].interactiveElement!.quizOptions!;

  assert.equal(resultado.length, 3);
  assert.deepEqual(new Set(resultado.map((o) => o.id)), new Set(['correta', 'errada-1', 'errada-2']));
});

test('shuffleQuizOptions nao mexe em slides sem quiz', () => {
  const slide: SlideData = {
    id: 'slide-1',
    type: 'concept_breakdown',
    title: 'Título',
    contentParagraphs: ['Parágrafo normal.'],
  } as SlideData;

  const [result] = shuffleQuizOptions([slide]);

  assert.equal(result, slide);
});
