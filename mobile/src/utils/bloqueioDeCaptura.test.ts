import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deveBloquearCaptura } from './bloqueioDeCaptura';

const respondendo = { plataforma: 'android', componente: 'question', revisao: false, mostrandoResumo: false };

test('bloqueia enquanto o aluno responde questões, no Android e no iOS', () => {
  assert.equal(deveBloquearCaptura(respondendo), true);
  assert.equal(deveBloquearCaptura({ ...respondendo, plataforma: 'ios' }), true);
});

test('na web nunca bloqueia: o navegador não deixa', () => {
  assert.equal(deveBloquearCaptura({ ...respondendo, plataforma: 'web' }), false);
});

test('material de estudo continua capturável', () => {
  assert.equal(deveBloquearCaptura({ ...respondendo, componente: 'texto' }), false);
  assert.equal(deveBloquearCaptura({ ...respondendo, componente: 'video' }), false);
  assert.equal(deveBloquearCaptura({ ...respondendo, componente: null }), false);
});

test('revisar as respostas e o resumo da atividade concluída não bloqueiam', () => {
  assert.equal(deveBloquearCaptura({ ...respondendo, revisao: true }), false);
  assert.equal(deveBloquearCaptura({ ...respondendo, mostrandoResumo: true }), false);
});
