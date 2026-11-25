import assert from 'node:assert/strict';
import test from 'node:test';

import { posicaoDaAlternativa } from './posicaoDaAlternativa';

const alternativas = ['B', 'A e B', 'A', 'Nada'];

test('o texto da alternativa vem antes da letra', () => {
  assert.equal(posicaoDaAlternativa(alternativas, 'B'), 0);
  assert.equal(posicaoDaAlternativa(alternativas, 'b'), 0);
  assert.equal(posicaoDaAlternativa(alternativas, 'A'), 2);
  assert.equal(posicaoDaAlternativa(alternativas, ' A e B '), 1);
});

test('a letra e o índice valem quando nenhum texto casa', () => {
  assert.equal(posicaoDaAlternativa(['x', 'y', 'z'], 'B'), 1);
  assert.equal(posicaoDaAlternativa(['x', 'y', 'z'], '2'), 2);
});

test('fora das alternativas, nada casa', () => {
  assert.equal(posicaoDaAlternativa(['x', 'y'], 'C'), -1);
  assert.equal(posicaoDaAlternativa(['x', 'y'], '7'), -1);
  assert.equal(posicaoDaAlternativa(['x', 'y'], 'outra'), -1);
  assert.equal(posicaoDaAlternativa(['x', 'y'], ''), -1);
  assert.equal(posicaoDaAlternativa([], 'A'), -1);
});
