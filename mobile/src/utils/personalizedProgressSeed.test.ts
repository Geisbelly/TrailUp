import assert from 'node:assert/strict';
import test from 'node:test';
/* eslint-disable @typescript-eslint/no-require-imports */
const supabaseModulePath = require.resolve('@/database/supabase');
(require.cache as Record<string, unknown>)[supabaseModulePath] = { exports: { supabase: {} } };
const { buildPersonalizedProgressSeed, seedPersonalizedProgress } = require('./personalizedProgressSeed') as typeof import('./personalizedProgressSeed');

function payload() {
  return { classeId: 32, topicoId: 128, planMeta: { recordId: 3608 }, steps: [
    { item_key: 'personalized:128:content:1', kind: 'content', title: 'Texto', metadata: { conteudo_id: 178 } },
    { item_key: 'personalized:128:activity:1', kind: 'activity', title: 'Quiz', metadata: { conteudo_id: 178 } },
  ] } as any;
}

test('denominador inclui todos os passos, mesmo sem nenhuma interação', () => {
  const rows = buildPersonalizedProgressSeed('aluno', payload());
  assert.equal(rows.length, 2);
  assert.ok(rows.every((row) => row.percentual_concluido === 0 && row.status === 'nao_iniciado'));
  assert.equal(rows[0].item_key, 'content:178:personalization:3608:personalized:128:content:1');
});

test('personalizações de conteúdos diferentes não usam o primeiro recordId do agregado', () => {
  const data = payload();
  data.steps[1].metadata = { conteudo_id: 179, personalizacao_id: 4000 };
  const rows = buildPersonalizedProgressSeed('aluno', data);
  assert.equal(rows[1].personalizacao_id, 4000);
  assert.equal(rows[1].item_key, 'content:179:personalization:4000:personalized:128:activity:1');
});

test('seed é idempotente e nunca sobrescreve conclusões existentes', async () => {
  const stored = new Map<string, number>([['content:178:personalization:3608:personalized:128:content:1', 100]]);
  const client = { from(table: string) {
    return { async upsert(rows: Record<string, unknown>[], options: { onConflict: string; ignoreDuplicates?: boolean }) {
      if (table === 'personalizacao_percurso') {
        assert.equal(options.onConflict, 'aluno_id,personalizacao_id');
        assert.equal((rows[0].item_keys as string[]).length, 2);
        return { error: null };
      }
      assert.equal(table, 'personalizacao_item_progresso');
      assert.equal(options.onConflict, 'aluno_id,personalizacao_id,item_key');
      assert.equal(options.ignoreDuplicates, true);
      for (const row of rows) if (!stored.has(String(row.item_key))) stored.set(String(row.item_key), Number(row.percentual_concluido));
      return { error: null };
    } };
  } };
  const rows = buildPersonalizedProgressSeed('aluno', payload());
  await seedPersonalizedProgress(client, rows);
  await seedPersonalizedProgress(client, rows);
  assert.deepEqual([...stored.values()], [100, 0]);
});

test('erro de persistência não é ocultado', async () => {
  const error = new Error('RLS');
  await assert.rejects(seedPersonalizedProgress({ from: () => ({ upsert: async () => ({ error }) }) }, [{}]), /RLS/);
});

test('sem personalização persistida não inventa recordId', () => {
  const data = payload();
  data.planMeta.recordId = null;
  assert.deepEqual(buildPersonalizedProgressSeed('aluno', data), []);
});
