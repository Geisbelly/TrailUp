import assert from 'node:assert/strict';
import test from 'node:test';

import type { SlideData } from '../types';
import { __paginacaoInterna, paginateSlidesByDensity } from './slidePagination';

const { estimateSlideWeight, MAX_CONTENT_WEIGHT } = __paginacaoInterna;

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

test('o componente rico aparece numa parte so - a ultima, depois do texto (evita duplicar)', () => {
  const result = paginateSlidesByDensity([heavySlide()]);
  assert.equal(result.filter((part) => part.metricCards).length, 1);
  assert.ok(result[result.length - 1].metricCards);
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

test('slide cover pesado E dividido, e as partes seguintes viram story_intro (nao repetem a capa)', () => {
  const cover: SlideData = {
    id: 'cover',
    type: 'cover',
    title: 'Capa',
    contentParagraphs: [longParagraph('x'), longParagraph('y'), longParagraph('z'), longParagraph('w')],
    layout: 'full-banner',
  } as SlideData;

  const result = paginateSlidesByDensity([cover]);

  assert.ok(result.length >= 2);
  assert.equal(result[0].type, 'cover');
  for (const part of result.slice(1)) assert.equal(part.type, 'story_intro');
  assert.equal(result.reduce((t, part) => t + part.contentParagraphs.length, 0), 4);
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

test('imagem AO LADO do texto nao soma altura (sao colunas); empilhada com o widget, soma', () => {
  // Ate 04/11 a conta somava tudo: 2 paragrafos + imagem dividia, mesmo com
  // a imagem na outra coluna. A altura e' a da coluna mais alta.
  const textoEImagem: SlideData = {
    id: 'com-imagem',
    type: 'concept_breakdown',
    title: 'Slide com imagem',
    contentParagraphs: [longParagraph('a'), longParagraph('b')],
    layout: 'split-character',
    referenceImageDataUri: 'data:image/png;base64,AAAA',
  } as SlideData;
  assert.equal(paginateSlidesByDensity([textoEImagem]).length, 1);

  const comEtapas: SlideData = {
    ...textoEImagem,
    timelineSteps: [1, 2, 3].map((n) => ({ stepNumber: n, title: `Etapa ${n}`, description: 'd'.repeat(120) })),
  };
  assert.ok(paginateSlidesByDensity([comEtapas]).length >= 2);
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

  // so a primaria (1 imagem): cabe ao lado do texto, nao divide
  assert.equal(baseResult.length, 1);
  assert.equal(gridResult.length, 1);
  // 5 imagens (3 linhas no grid 2 colunas) pesam mais que so a primaria.
  // Dividir o TEXTO nao resolve uma coluna alta de imagens (elas se repetem
  // em toda parte), entao o peso cresce mas a divisao nao acontece.
  assert.ok(estimateSlideWeight(withGrid) > estimateSlideWeight(base));
});

test('paragrafo gigante sem fim de frase nao e cortado (nunca no meio de palavra)', () => {
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

// Caso do print de 04/11 (Socializer, "Jornada da Construção Coletiva -
// Parte 1/2"): texto + "Na prática" + imagem + "Etapas" num slide so', e o
// slide rolava.
function slideDoPrint(): SlideData {
  return {
    id: 'print',
    type: 'concept_breakdown',
    title: 'Jornada da Construção Coletiva',
    subtopic: 'Comparação de frações',
    pedagogicalObjective: 'Dominar o método de comparação de frações através da equalização de denominadores.',
    contentParagraphs: ['Quando os denominadores são idênticos, a comparação é direta. '.repeat(6), 'A fração com o maior numerador é a maior. '.repeat(6)],
    layout: 'split-character',
    writtenExample: { title: 'Comparando 1/2 e 3/4', explanation: '1/2 = 2/4. Como 3/4 > 2/4, concluímos que 3/4 é maior.', code: '1/2 * (2/2) = 2/4. Comparando: 3/4 > 2/4.' },
    referenceImageDataUri: 'data:image/png;base64,AAAA',
    timelineSteps: [
      { stepNumber: 1, title: 'Verificação', description: 'Checar se os denominadores são iguais.' },
      { stepNumber: 2, title: 'Equivalência', description: 'Se diferentes, encontrar o denominador comum para igualar as partes.' },
      { stepNumber: 3, title: 'Ordenação', description: 'Comparar os numeradores e definir a maior fração.' },
    ],
  } as SlideData;
}

test('o slide do print vira partes que cabem todas no card, sem perder nada', () => {
  const original = slideDoPrint();
  const result = paginateSlidesByDensity([original]);

  assert.ok(result.length >= 2);
  for (const part of result) {
    assert.ok(estimateSlideWeight(part) <= MAX_CONTENT_WEIGHT, `${part.title}: ${estimateSlideWeight(part)}`);
    assert.match(part.title, new RegExp(`— Parte \\d+/${result.length}$`));
  }
  assert.equal(result.filter((part) => part.writtenExample).length, 1);
  assert.equal(result.filter((part) => part.timelineSteps).length, 1);
  assert.equal(result.flatMap((part) => part.contentParagraphs).join(''), original.contentParagraphs.join(''));
  // A imagem acompanha toda parte de texto: as duas colunas ficam simetricas.
  for (const part of result.filter((p) => p.contentParagraphs.length > 0)) {
    assert.equal(part.referenceImageDataUri, original.referenceImageDataUri);
  }
});

test('divide em quantas partes precisar (nao para em 2)', () => {
  const longo: SlideData = {
    id: 'longo',
    type: 'concept_breakdown',
    title: 'Muito texto',
    contentParagraphs: Array.from({ length: 8 }, (_, i) => `Frase ${i}. `.repeat(45)),
    layout: 'split-character',
  } as SlideData;
  const result = paginateSlidesByDensity([longo]);
  assert.ok(result.length >= 3);
  for (const part of result) assert.ok(estimateSlideWeight(part) <= MAX_CONTENT_WEIGHT);
});

test('paragrafo gigante com frases e cortado entre frases', () => {
  const texto = 'Esta é uma frase completa sobre frações. '.repeat(60);
  const result = paginateSlidesByDensity([
    { id: 'g', type: 'concept_breakdown', title: 'G', contentParagraphs: [texto], layout: 'split-character' } as SlideData,
  ]);
  assert.ok(result.length >= 2);
  for (const part of result) {
    for (const p of part.contentParagraphs) assert.match(p, /\.$/);
  }
  assert.equal(result.flatMap((part) => part.contentParagraphs).join(' ').replace(/\s+/g, ' '), texto.trim().replace(/\s+/g, ' '));
});

test('so a primeira parte leva o guia (fala do personagem)', () => {
  const comGuia = { ...slideDoPrint(), characterGuide: { name: 'Guia', speechText: 'Vamos lá!' } } as SlideData;
  const result = paginateSlidesByDensity([comGuia]);
  assert.ok(result[0].characterGuide);
  for (const part of result.slice(1)) assert.equal(part.characterGuide, undefined);
});
