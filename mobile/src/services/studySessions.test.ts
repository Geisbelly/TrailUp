import assert from 'node:assert/strict';
import test from 'node:test';
import { saveStudySession } from './studySessions';

const params = {
  alunoId: 'student', scope: 'content' as const, topicoId: 131, conteudoId: 192,
  atividadeId: null, startedAtMs: 1_700_000_000_000, endedAtMs: 1_700_000_060_000,
};

test('retentativa de sessão conserva o identificador de idempotência', async () => {
  const calls: any[] = [];
  const client = {
    async rpc(name: string, payload: any) {
      assert.equal(name, 'trailup_registrar_sessao_estudo');
      calls.push(payload);
      return { error: calls.length === 1 ? { message: 'Network request failed' } : null };
    },
  };
  await saveStudySession(client as any, params);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].p_sessao, calls[1].p_sessao);
  assert.equal(calls[0].p_aberto_em, new Date(params.startedAtMs).toISOString());
  assert.equal(calls[0].p_fechado_em, new Date(params.endedAtMs).toISOString());
  assert.equal(calls[0].p_scope, 'content');
  assert.equal(calls[0].p_conteudo, 192);
  assert.equal(calls[0].p_atividade, null);
});

test('RLS não é ignorada ou retentada como problema de rede', async () => {
  let calls = 0;
  const client = { async rpc() { calls++; return { error: { code: '42501' } }; } };
  await assert.rejects(saveStudySession(client as any, params));
  assert.equal(calls, 1);
});
