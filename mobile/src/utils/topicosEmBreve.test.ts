import assert from 'node:assert/strict';
import test from 'node:test';
import { esperaAteAProximaAbertura, lerEmBreve, rotuloDaAbertura, tituloDoAviso } from './topicosEmBreve';

// Datas montadas no fuso local, como o aparelho mostra.
const agora = new Date(2026, 10, 10, 21, 0);

test('lê só a data; linha estranha conta como "sem data"', () => {
  const lista = lerEmBreve([{ abre_em: new Date(2026, 10, 11, 8, 0).toISOString() }, { abre_em: null }, { abre_em: 'x' }, null]);
  assert.equal(lista.length, 4);
  assert.equal(lista[0].abreEm?.getHours(), 8);
  assert.deepEqual(lista.slice(1).map((i) => i.abreEm), [null, null, null]);
  assert.deepEqual(lerEmBreve(undefined), []);
  assert.deepEqual(lerEmBreve({ abre_em: '2026-11-11' }), []);
});

test('rótulo de quando abre', () => {
  assert.equal(rotuloDaAbertura(null, agora), 'Em preparação');
  assert.equal(rotuloDaAbertura(new Date(2026, 10, 10, 23, 5), agora), 'Abre hoje às 23:05');
  assert.equal(rotuloDaAbertura(new Date(2026, 10, 11, 8, 0), agora), 'Abre amanhã às 08:00');
  assert.equal(rotuloDaAbertura(new Date(2026, 10, 20, 7, 30), agora), 'Abre 20/11 às 07:30');
  assert.equal(rotuloDaAbertura(new Date(2026, 10, 10, 20, 59), agora), 'Abrindo agora');
});

test('amanhã atravessa a virada do mês', () => {
  const fimDoMes = new Date(2026, 10, 30, 22, 0);
  assert.equal(rotuloDaAbertura(new Date(2026, 11, 1, 8, 0), fimDoMes), 'Abre amanhã às 08:00');
});

test('título no singular e no plural', () => {
  assert.equal(tituloDoAviso(1), '1 tópico em breve');
  assert.equal(tituloDoAviso(3), '3 tópicos em breve');
});

test('espera até a próxima abertura, ignorando rascunho e o que já passou, com teto de 24 h', () => {
  const lista = [
    { abreEm: null },
    { abreEm: new Date(2026, 10, 10, 20, 0) },
    { abreEm: new Date(2026, 10, 10, 21, 30) },
    { abreEm: new Date(2026, 10, 10, 22, 0) },
  ];
  assert.equal(esperaAteAProximaAbertura(lista, agora), 30 * 60 * 1000);
  assert.equal(esperaAteAProximaAbertura([{ abreEm: null }], agora), null);
  assert.equal(esperaAteAProximaAbertura([{ abreEm: new Date(2026, 10, 20, 8, 0) }], agora), 24 * 60 * 60 * 1000);
});
