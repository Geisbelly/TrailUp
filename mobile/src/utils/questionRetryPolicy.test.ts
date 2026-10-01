import assert from 'node:assert/strict';
import { test } from 'node:test';
import { restaApenasUmaAlternativa } from './questionRetryPolicy';

test('V ou F: uma tentativa ja esgota a escolha, a outra opcao e a resposta', () => {
  assert.equal(restaApenasUmaAlternativa(2, []), false);
  assert.equal(restaApenasUmaAlternativa(2, [0]), true);
  assert.equal(restaApenasUmaAlternativa(2, [1]), true);
});

test('multipla escolha so bloqueia quando sobra uma alternativa', () => {
  assert.equal(restaApenasUmaAlternativa(4, []), false);
  assert.equal(restaApenasUmaAlternativa(4, [0]), false);
  assert.equal(restaApenasUmaAlternativa(4, [0, 1]), false);
  assert.equal(restaApenasUmaAlternativa(4, [0, 1, 2]), true);
});

test('repetir a mesma alternativa nao consome opcao', () => {
  assert.equal(restaApenasUmaAlternativa(4, [1, 1, 1]), false);
  assert.equal(restaApenasUmaAlternativa(2, [0, 0]), true);
});

test('indice invalido ou fora da faixa e ignorado', () => {
  assert.equal(restaApenasUmaAlternativa(4, [-1, 9, 1.5, 0]), false);
  assert.equal(restaApenasUmaAlternativa(2, [-1]), false);
});

test('dissertativa e lacuna (sem alternativas) nunca entram na regra', () => {
  assert.equal(restaApenasUmaAlternativa(0, []), false);
  assert.equal(restaApenasUmaAlternativa(1, [0]), false);
  assert.equal(restaApenasUmaAlternativa(Number.NaN, [0]), false);
});

test('tentativas registradas cobrem o estado perdido ao reabrir a atividade', () => {
  // Sem opcoes em memoria, mas a questao ja tem uma tentativa gravada.
  assert.equal(restaApenasUmaAlternativa(2, [], 1), true);
  assert.equal(restaApenasUmaAlternativa(4, [], 1), false);
  assert.equal(restaApenasUmaAlternativa(4, [], 3), true);
});

test('vale o sinal mais alto entre opcoes distintas e tentativas', () => {
  assert.equal(restaApenasUmaAlternativa(4, [0, 1, 2], 0), true);
  assert.equal(restaApenasUmaAlternativa(4, [0], 3), true);
  assert.equal(restaApenasUmaAlternativa(4, [0], 1), false);
});

test('tentativas invalidas nao bloqueiam sozinhas', () => {
  assert.equal(restaApenasUmaAlternativa(4, [], Number.NaN), false);
  assert.equal(restaApenasUmaAlternativa(4, [], -5), false);
});
