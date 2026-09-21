import assert from 'node:assert/strict';
import test from 'node:test';
import { buildEmptyBatch, nextStudyBatch, restoreUnsentBatch } from './acumuladorLote';

test('tempo coletado durante envio lento fica no lote novo, sem perder ou duplicar', async () => {
  const old = buildEmptyBatch(0);
  old.generalActiveMs=60000; old.lastInteractionAtMs=45000;
  const next = nextStudyBatch(old,60000);
  const sending = Promise.resolve(old.generalActiveMs);
  next.generalActiveMs += 30000;
  assert.equal(await sending,60000);
  assert.equal(next.generalActiveMs,30000);
  assert.equal(next.lastInteractionAtMs,45000);
});

test('falha no banco e armazenamento restaura o lote sem apagar tempo novo', () => {
  const old = buildEmptyBatch(0); old.generalActiveMs=60000;
  const current = nextStudyBatch(old,60000); current.generalActiveMs=15000;
  assert.equal(restoreUnsentBatch(old,current).generalActiveMs,75000);
});

test('flush não equivale a interação e não cria 15 segundos ativos falsos', () => {
  const old = buildEmptyBatch(0);
  assert.equal(nextStudyBatch(old,60000).lastInteractionAtMs,0);
});
