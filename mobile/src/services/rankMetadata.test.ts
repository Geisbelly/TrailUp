import assert from 'node:assert/strict';
import test from 'node:test';
import { loadRankMetadata, RANK_METADATA_SELECT } from './rankMetadata';

function client(rows: unknown[], error: unknown = null) {
  const calls: unknown[] = [];
  const query = {
    select(value: string) { calls.push(value); return this; },
    eq(key: string, value: number) { calls.push([key, value]); return this; },
    async order() { return { data: rows, error }; },
  };
  return { calls, db: { from(table: string) { assert.equal(table, 'ranks'); return query; } } as any };
}

test('rank usa nome/descrição/ícone de rank_tipo, não colunas inexistentes em ranks', async () => {
  const { db, calls } = client([{ id: 5, classe_id: 54, rank_tipo: {
    nome: 'Pontuação', descricao: 'XP da turma', criterio: 'pontuacao', icone: 3,
  } }]);
  assert.deepEqual(await loadRankMetadata(db, { classeId: 54 }), [{
    rank_id: 5, classe_id: 54, nome_rank: 'Pontuação', descricao: 'XP da turma', criterio: 'pontuacao', icone: '3',
  }]);
  assert.deepEqual(calls, [RANK_METADATA_SELECT, ['classe_id', 54]]);
});

test('consulta por rankId também tolera metadados ausentes', async () => {
  const { db, calls } = client([{ id: 5, classe_id: 54, rank_tipo: null }]);
  const [row] = await loadRankMetadata(db, { rankId: 5 });
  assert.equal(row.nome_rank, 'Rank 5');
  assert.equal(row.icone, null);
  assert.deepEqual(calls[1], ['id', 5]);
});

test('erro de leitura de rank continua sendo reportado', async () => {
  const error = new Error('offline');
  await assert.rejects(loadRankMetadata(client([], error).db, { classeId: 54 }), error);
});
