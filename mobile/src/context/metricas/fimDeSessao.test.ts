import assert from 'node:assert/strict';
import test from 'node:test';
import { decidirTransicaoAppState, eventoDeFim, podeCapturarQuadro } from './fimDeSessao';

function percurso(estados: string[]) {
  const decisoes: string[] = [];
  for (let i = 1; i < estados.length; i += 1) {
    decisoes.push(decidirTransicaoAppState(estados[i - 1], estados[i]));
  }
  return decisoes;
}

test('iOS active→inactive→background encerra uma vez', () => {
  assert.deepEqual(percurso(['active', 'inactive', 'background']), ['salvar', 'encerrar']);
});

test('Android active→background encerra', () => {
  assert.deepEqual(percurso(['active', 'background']), ['encerrar']);
});

test('central de controle active→inactive→active não encerra', () => {
  const decisoes = percurso(['active', 'inactive', 'active']);
  assert.deepEqual(decisoes, ['salvar', 'retomar']);
  assert.ok(!decisoes.includes('encerrar'));
});

test('volta do background retoma', () => {
  assert.deepEqual(percurso(['background', 'active']), ['retomar']);
  assert.deepEqual(percurso(['background', 'inactive', 'active']), ['nada', 'retomar']);
});

test('active→inactive salva sem encerrar', () => {
  assert.equal(decidirTransicaoAppState('active', 'inactive'), 'salvar');
  // inactive→background encerra; inactive→inactive e background→inactive não salvam
  assert.equal(decidirTransicaoAppState('inactive', 'background'), 'encerrar');
  assert.equal(decidirTransicaoAppState('inactive', 'inactive'), 'nada');
  assert.equal(decidirTransicaoAppState('background', 'inactive'), 'nada');
});

test('background repetido não encerra de novo', () => {
  assert.equal(decidirTransicaoAppState('background', 'background'), 'nada');
});

test('estado desconhecido não faz nada', () => {
  assert.equal(decidirTransicaoAppState('active', 'unknown'), 'nada');
  assert.equal(decidirTransicaoAppState('active', 'active'), 'nada');
});

test('sair da tela é session_end', () => {
  assert.equal(eventoDeFim('screen_blur'), 'session_end');
  assert.equal(eventoDeFim('session_end'), 'session_end');
  assert.equal(eventoDeFim('app_background'), 'session_interrupt');
});

test('eventoDeFim: todo motivo que não é app_background é session_end', () => {
  for (const motivo of ['interval', 'activity_complete', 'topic_complete', 'screen_blur', 'session_end'] as const) {
    assert.equal(eventoDeFim(motivo), 'session_end', motivo);
  }
  assert.equal(eventoDeFim('app_background'), 'session_interrupt');
});

test('câmera só captura quadro com o app em primeiro plano', () => {
  assert.equal(podeCapturarQuadro('active'), true);
  assert.equal(podeCapturarQuadro('inactive'), false);
  assert.equal(podeCapturarQuadro('background'), false);
  assert.equal(podeCapturarQuadro('unknown'), false);
});
