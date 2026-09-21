import assert from 'node:assert/strict';
import test from 'node:test';
/* eslint-disable @typescript-eslint/no-require-imports */
let stored: string | null = null;
let failRead = false;
let failWrite = false;
const storage = {
  async getItem() { if (failRead) throw new Error('read failed'); return stored; },
  async setItem(_key: string, value: string) { if (failWrite) throw new Error('disk full'); stored = value; },
};
(require.cache as Record<string, unknown>)[require.resolve('@react-native-async-storage/async-storage')] = {
  exports: { __esModule: true, default: storage },
};
const { enfileirarLoteTelemetria: enqueue, drenarLotesTelemetria: drain } =
  require('./telemetriaOutbox') as typeof import('./telemetriaOutbox');
const payload = (id: string) => ({ sessao_id: id, captured_at: '2026-09-20T19:00:00Z', flush_reason: 'interval' } as any);
const ids = () => JSON.parse(stored ?? '[]').map((item: any) => item.payload.sessao_id);

test('enqueue simultâneo não perde lotes e deduplica reenvios', async () => {
  stored = null;
  await Promise.all([enqueue(payload('a')), enqueue(payload('b')), enqueue(payload('a'))]);
  assert.deepEqual(ids(), ['a', 'b']);
});

test('drenagem mantém lote adicionado enquanto a rede aguarda', async () => {
  stored = null;
  await enqueue(payload('a'));
  let release!: () => void;
  let started!: () => void;
  const sending = new Promise<void>((resolve) => { started = resolve; });
  const network = new Promise<void>((resolve) => { release = resolve; });
  const first = drain(async () => { started(); await network; return { persisted: true }; });
  await sending;
  assert.equal(drain(async () => assert.fail('não deve enviar duas vezes')), first);
  await enqueue(payload('b'));
  release();
  assert.deepEqual(await first, { enviados: 1, pendentes: 1 });
  assert.deepEqual(ids(), ['b']);
});

test('falha de leitura ou escrita não confirma posse durável nem apaga lotes', async () => {
  stored = null;
  await enqueue(payload('a'));
  failRead = true;
  await assert.rejects(enqueue(payload('b')), /read failed/);
  failRead = false;
  failWrite = true;
  await assert.rejects(enqueue(payload('b')), /disk full/);
  failWrite = false;
  assert.deepEqual(ids(), ['a']);
  await enqueue(payload('b'));
  assert.deepEqual(ids(), ['a', 'b']);
});
