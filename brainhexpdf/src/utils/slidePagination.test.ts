import assert from 'node:assert/strict';
import test from 'node:test';

import type { SlideData } from '../types';
import { paginateSlidesByDensity } from './slidePagination';

function shortSlide(): SlideData {
  return {
    id: 'short',
    type: 'concept_breakdown',
    title: 'Slide curto',
    contentParagraphs: ['Um parágrafo curto.'],
    layout: 'split-character',
  } as SlideData;
}

function longParagraph(char: string) {
  return char.repeat(400);
}

function heavySlide(): SlideData {
  return {
    id: 'heavy',
    type: 'concept_breakdown',
    title: 'Slide denso',
    contentParagraphs: [longParagraph('a'), longParagraph('b'), longParagraph('c'), longParagraph('d')],
    layout: 'split-character',
    metricCards: [{ value: '10', label: 'Métrica' }],
  } as SlideData;
}

test('slide dentro do orcamento passa direto, sem divisao', () => {
  const result = paginateSlidesByDensity([shortSlide()]);
  assert.equal(result.length, 1);
  assert.equal(result[0].id, 'short');
});

test('slide acima do orcamento com varios paragrafos e dividido em Parte 1/2', () => {
  const result = paginateSlidesByDensity([heavySlide()]);

  assert.equal(result.length, 2);
  assert.equal(result[0].id, 'heavy-parte-1');
  assert.match(result[0].title, /— Parte 1\/2$/);
  assert.equal(result[1].id, 'heavy-parte-2');
  assert.match(result[1].title, /— Parte 2\/2$/);
  assert.equal(result[0].contentParagraphs.length + result[1].contentParagraphs.length, 4);
});

test('a segunda parte nao carrega o componente rico (evita duplicar)', () => {
  const result = paginateSlidesByDensity([heavySlide()]);
  assert.deepEqual(result[1].metricCards, undefined);
});

test('a imagem de referencia PERSISTE nas duas partes de um slide dividido (2026-08-22)', () => {
  // Antes, a imagem era removida da parte 2 igual os componentes ricos -
  // caso real de producao mostrou isso deixando a "Parte 2/2" como um bloco
  // de texto minusculo boiando sozinho num card 9:16 vazio, sem nada pra
  // preencher o espaco. As duas partes cobrem o MESMO subtopico, entao
  // repetir a mesma ilustracao nao e duplicacao indevida.
  const withImage: SlideData = {
    ...heavySlide(),
    id: 'com-imagem',
    referenceImageDataUri: 'data:image/png;base64,AAAA',
  };

  const result = paginateSlidesByDensity([withImage]);

  assert.equal(result.length, 2);
  assert.equal(result[0].referenceImageDataUri, 'data:image/png;base64,AAAA');
  assert.equal(result[1].referenceImageDataUri, 'data:image/png;base64,AAAA');
});

test('divide paragrafos por PESO (caracteres), nao por contagem bruta - metades desiguais ficam equilibradas', () => {
  // 1 paragrafo de 1800 chars + 1 de 200 chars: dividir por CONTAGEM daria
  // 1+1, deixando uma das partes quase vazia (caso real de producao). Por
  // PESO, o paragrafo grande sozinho ja ultrapassa a metade do total, entao
  // fica inteiro numa parte e o pequeno na outra - mas o essencial e que
  // nenhuma parte fica desproporcionalmente mais vazia que a outra em
  // relacao ao conteudo disponivel.
  const desigual: SlideData = {
    id: 'desigual',
    type: 'concept_breakdown',
    title: 'Paragrafos desiguais',
    contentParagraphs: [longParagraph('a').repeat(4) + longParagraph('a'), longParagraph('b').slice(0, 200)],
    layout: 'split-character',
  } as SlideData;

  const result = paginateSlidesByDensity([desigual]);

  assert.equal(result.length, 2);
  assert.equal(result[0].contentParagraphs.length, 1);
  assert.equal(result[1].contentParagraphs.length, 1);
  // A parte com o paragrafo de 2000 chars fica na parte 1 (fecha a metade
  // do peso total sozinha, no primeiro paragrafo iterado).
  assert.equal(result[0].contentParagraphs[0].length, 2000);
  assert.equal(result[1].contentParagraphs[0].length, 200);
});

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

test('imagens adicionais (grid 2a+ linha) somam mais peso que so a primaria - pode empurrar pra divisao', () => {
  const shortParagraph = 'b'.repeat(200);
  const base: SlideData = {
    id: 'com-grid',
    type: 'concept_breakdown',
    title: 'Slide com grid de imagens',
    contentParagraphs: [shortParagraph, shortParagraph],
    layout: 'split-character',
    referenceImageDataUri: 'data:image/png;base64,AAAA',
  } as SlideData;
  const withGrid: SlideData = {
    ...base,
    additionalReferenceImageDataUris: ['B', 'C', 'D', 'E'].map((c) => `data:image/png;base64,${c}`),
  } as SlideData;

  const baseResult = paginateSlidesByDensity([base]);
  const gridResult = paginateSlidesByDensity([withGrid]);

  // so a primaria (1 imagem, 1 linha): 400 (2 paragrafos de 200) + 400 (imagem) = 800, nao divide
  assert.equal(baseResult.length, 1);
  // 5 imagens (3 linhas no grid 2 colunas) somam bem mais peso, ultrapassa o teto
  assert.equal(gridResult.length, 2);
});

test('slide com um unico paragrafo gigante nao e dividido (limitacao conhecida)', () => {
  const oneHugeParagraph: SlideData = {
    id: 'mono',
    type: 'concept_breakdown',
    title: 'Parágrafo único gigante',
    contentParagraphs: [longParagraph('m').repeat(4)],
    layout: 'split-character',
  } as SlideData;

  const result = paginateSlidesByDensity([oneHugeParagraph]);
  assert.equal(result.length, 1);
});

test('peso do quiz escala com o texto real, nao um valor fixo (2026-08-22)', () => {
  // Antes, slide.quiz contribuia um RICH_WIDGET_WEIGHT fixo (500) pro peso
  // do slide, igual qualquer outro widget rico - um quiz com texto
  // repetitivo/degenerado de milhares de caracteres (caso real de
  // producao, ver src/utils/quizSanitize.ts) pesava o MESMO que um quiz
  // objetivo de poucas palavras, escondendo o caso realmente problematico
  // da paginacao por densidade. Dois parágrafos moderados (300 chars cada,
  // 600 no total - abaixo do teto sozinhos) + quiz curto não deveria
  // dividir; o mesmo conteúdo + quiz com uma explanation gigante deveria.
  const paragraphs = [longParagraph('p').slice(0, 300), longParagraph('q').slice(0, 300)];

  const quizCurto: SlideData = {
    id: 'quiz-curto',
    type: 'interactive_challenge',
    title: 'Slide com quiz',
    contentParagraphs: paragraphs,
    layout: 'split-character',
    quiz: {
      question: 'Pergunta objetiva?',
      options: [{ id: 'a', text: 'Opção A', isCorrect: true, explanation: 'Explicação curta.' }],
    },
  } as SlideData;

  const quizLongo: SlideData = {
    ...quizCurto,
    id: 'quiz-longo',
    quiz: {
      question: 'Pergunta objetiva?',
      options: [{ id: 'a', text: 'Opção A', isCorrect: true, explanation: 'x'.repeat(700) }],
    },
  } as SlideData;

  const resultCurto = paginateSlidesByDensity([quizCurto]);
  const resultLongo = paginateSlidesByDensity([quizLongo]);

  assert.equal(resultCurto.length, 1);
  assert.equal(resultLongo.length, 2);
});
