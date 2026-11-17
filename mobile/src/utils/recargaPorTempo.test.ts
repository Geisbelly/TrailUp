import assert from 'node:assert/strict';
import test from 'node:test';
import {
  INTERVALO_RECARGA_POR_TEMPO_MS,
  chaveRecargaClasse,
  chaveRecargaTopico,
  criarLimitadorDeRecarga,
} from './recargaPorTempo';

const MIN = 60_000;

test('a primeira visita relê na hora', () => {
  const pode = criarLimitadorDeRecarga();
  assert.equal(pode(chaveRecargaClasse('a', 68), 0), true);
});

test('com o material aberto, o relógio de minuto em minuto relê no máximo uma vez a cada 5 min', () => {
  const pode = criarLimitadorDeRecarga();
  const chave = chaveRecargaClasse('a', 68);
  // Uma hora parado no mesmo texto: 60 flushes do relógio de estudo.
  let recargas = 0;
  for (let minuto = 0; minuto < 60; minuto += 1) {
    if (pode(chave, minuto * MIN)) recargas += 1;
  }
  assert.equal(INTERVALO_RECARGA_POR_TEMPO_MS, 5 * MIN);
  assert.equal(recargas, 12);
});

test('conteúdo e tópico no mesmo flush não somam duas recargas da turma', () => {
  const pode = criarLimitadorDeRecarga();
  const chave = chaveRecargaClasse('a', 68);
  assert.equal(pode(chave, 10 * MIN), true); // registrarTempoConteudo
  assert.equal(pode(chave, 10 * MIN + 300), false); // registrarTempoTopico, mesmo minuto
});

test('chaves diferentes não se bloqueiam', () => {
  const pode = criarLimitadorDeRecarga();
  assert.equal(pode(chaveRecargaTopico('a', 68, 1), 0), true);
  assert.equal(pode(chaveRecargaTopico('a', 68, 2), 0), true);
  assert.equal(pode(chaveRecargaTopico('b', 68, 1), 0), true);
  assert.equal(pode(chaveRecargaClasse('a', 68), 0), true);
  assert.notEqual(chaveRecargaClasse('a', 68), chaveRecargaTopico('a', 68, 68));
});

test('relógio que volta não trava a chave', () => {
  const pode = criarLimitadorDeRecarga();
  const chave = chaveRecargaClasse('a', 68);
  assert.equal(pode(chave, 100 * MIN), true);
  assert.equal(pode(chave, 50 * MIN), true);
  assert.equal(pode(chave, 51 * MIN), false);
});
