import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DEFAULT_SLIDES_PER_BATCH,
  describeGenerationFailure,
  isTruncationFailure,
  planejarRetomada,
  planSlideBatches,
  splitBatch,
} from './slideBatchPlanner';

test('divide o deck em blocos do tamanho pedido, cobrindo todos os slides', () => {
  const blocos = planSlideBatches(15, 4);

  assert.deepEqual(blocos, [
    { start: 0, count: 4 },
    { start: 4, count: 4 },
    { start: 8, count: 4 },
    { start: 12, count: 3 },
  ]);
  assert.equal(blocos.reduce((soma, b) => soma + b.count, 0), 15);
});

test('nao deixa buraco nem sobreposicao entre blocos', () => {
  let esperado = 0;
  for (const bloco of planSlideBatches(23, 5)) {
    assert.equal(bloco.start, esperado);
    esperado += bloco.count;
  }
  assert.equal(esperado, 23);
});

test('deck menor que um bloco vira um bloco so', () => {
  assert.deepEqual(planSlideBatches(3, 4), [{ start: 0, count: 3 }]);
});

test('total zero ou negativo nao gera bloco nenhum', () => {
  assert.deepEqual(planSlideBatches(0), []);
  assert.deepEqual(planSlideBatches(-5), []);
});

test('tamanho invalido cai no minimo, em vez de gerar bloco vazio (loop infinito)', () => {
  const blocos = planSlideBatches(3, 0);
  assert.equal(blocos.length, 3);
  assert.ok(blocos.every((b) => b.count >= 1));
});

test('o padrao de slides por bloco e conservador', () => {
  assert.equal(DEFAULT_SLIDES_PER_BATCH, 4);
});

test('splitBatch parte o bloco ao meio, preservando inicio e total', () => {
  const partes = splitBatch({ start: 4, count: 5 });

  assert.deepEqual(partes, [
    { start: 4, count: 2 },
    { start: 6, count: 3 },
  ]);
});

test('splitBatch de 2 slides vira dois de 1', () => {
  assert.deepEqual(splitBatch({ start: 0, count: 2 }), [
    { start: 0, count: 1 },
    { start: 1, count: 1 },
  ]);
});

test('bloco de 1 slide nao da pra dividir (desiste dele, nao do deck)', () => {
  assert.equal(splitBatch({ start: 7, count: 1 }), null);
});

test('reconhece truncamento por finishReason', () => {
  assert.equal(isTruncationFailure({ finishReason: 'MAX_TOKENS' }), true);
  assert.equal(isTruncationFailure({ finishReason: 'max_tokens' }), true);
});

test('reconhece truncamento pela mensagem do JSON.parse (caso real do log)', () => {
  assert.equal(
    isTruncationFailure({ errorMessage: 'Unterminated string in JSON at position 145811' }),
    true,
  );
  assert.equal(isTruncationFailure({ errorMessage: 'Unexpected end of JSON input' }), true);
});

test('nao confunde erro comum com truncamento (senao dividiria a toa)', () => {
  assert.equal(isTruncationFailure({ finishReason: 'STOP' }), false);
  assert.equal(isTruncationFailure({ errorMessage: '429 Quota exceeded' }), false);
  assert.equal(isTruncationFailure({}), false);
});

test('a mensagem de falha aponta a causa real, nao as chaves', () => {
  const porTamanho = describeGenerationFailure({ truncou: true, cotaEsgotada: false });
  assert.match(porTamanho, /limite de resposta/i);
  assert.ok(!/chaves/i.test(porTamanho), 'nao pode culpar as chaves quando o problema e tamanho');
});

test('cota esgotada tem mensagem propria', () => {
  const porCota = describeGenerationFailure({ truncou: false, cotaEsgotada: true });
  assert.match(porCota, /cota/i);
  assert.match(porCota, /aguarde|chaves adicionais/i);
});

test('sem causa identificada, mantem a orientacao sobre configuracao', () => {
  assert.match(describeGenerationFailure({ truncou: false, cotaEsgotada: false }), /chaves/i);
});

test('bloco de 1 slide que trunca sem nada recuperado é descartado (regra antiga preservada)', () => {
  const plano = planejarRetomada({ bloco: { start: 6, count: 1 }, recuperados: 0, truncou: true });

  assert.equal(plano.aproveitar, 0);
  assert.deepEqual(plano.reenfileirar, []);
});

test('bloco de 1 slide COM o slide recuperado nao volta pra fila', () => {
  // Era o furo: splitBatch(count=1) devolve null, o slide ia pro lixo e o deck
  // saia sem ele. Recuperado, o bloco esta completo.
  const plano = planejarRetomada({ bloco: { start: 6, count: 1 }, recuperados: 1, truncou: true });

  assert.equal(plano.aproveitar, 1);
  assert.deepEqual(plano.reenfileirar, []);
});

test('bloco de 4 que truncou no terceiro reenfileira SO os 2 que faltam', () => {
  const plano = planejarRetomada({ bloco: { start: 4, count: 4 }, recuperados: 2, truncou: true });

  assert.equal(plano.aproveitar, 2);
  assert.deepEqual(plano.reenfileirar, [{ start: 6, count: 2 }]);
});

test('sem nada recuperado, segue dividindo ao meio como antes', () => {
  const plano = planejarRetomada({ bloco: { start: 0, count: 4 }, recuperados: 0, truncou: true });

  assert.equal(plano.aproveitar, 0);
  assert.deepEqual(plano.reenfileirar, [
    { start: 0, count: 2 },
    { start: 2, count: 2 },
  ]);
});

test('erro que nao e de tamanho nao volta pra fila', () => {
  // Repetir o mesmo prompt depois de um 429 so' queima cota.
  const plano = planejarRetomada({ bloco: { start: 0, count: 4 }, recuperados: 0, truncou: false });

  assert.deepEqual(plano.reenfileirar, []);
});

test('nunca aproveita mais slides do que o bloco pediu', () => {
  const plano = planejarRetomada({ bloco: { start: 0, count: 2 }, recuperados: 9, truncou: true });

  assert.equal(plano.aproveitar, 2);
  assert.deepEqual(plano.reenfileirar, []);
});
