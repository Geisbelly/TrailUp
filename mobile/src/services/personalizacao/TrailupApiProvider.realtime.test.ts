import assert from 'node:assert/strict';
import test from 'node:test';
/* eslint-disable @typescript-eslint/no-require-imports */
const dbPath = require.resolve('@/database/supabase');
(require.cache as Record<string, unknown>)[dbPath] = { exports: { supabase: {} } };
const apiPath = require.resolve('@/services/apiBaseUrl');
(require.cache as Record<string, unknown>)[apiPath] = { exports: {
  resolveApiBaseCandidates: () => [], isNetworkRequestFailedError: () => false,
} };
const { TrailupApiProvider } = require('./TrailupApiProvider') as typeof import('./TrailupApiProvider');

type Handler = (payload: { eventType: string; new: Record<string, unknown>; old: Record<string, unknown> }) => void;

function assinar(alunoId: string) {
  let handler: Handler | null = null;
  let chamadas = 0;
  const canal = {
    on(_tipo: string, _filtro: unknown, fn: Handler) { handler = fn; return canal; },
    subscribe() { return canal; },
  };
  const provider = new TrailupApiProvider({
    apiBaseCandidates: [],
    supabase: { channel: () => canal } as any,
  });
  provider.subscribePersonalizacoesPersistidasClasse({ classeId: 1, alunoId, onChange: () => { chamadas += 1; } });
  return { disparar: (p: Parameters<Handler>[0]) => handler!(p), chamadas: () => chamadas };
}

test('material-base da turma (aprovado pelo professor) recarrega o aluno', () => {
  const r = assinar('aluno-a');
  r.disparar({ eventType: 'UPDATE', new: { aluno_id: null }, old: {} });
  assert.equal(r.chamadas(), 1);
});

test('registro de outro aluno continua sem recarregar', () => {
  const r = assinar('aluno-a');
  r.disparar({ eventType: 'UPDATE', new: { aluno_id: 'aluno-b' }, old: { aluno_id: 'aluno-b' } });
  assert.equal(r.chamadas(), 0);
  r.disparar({ eventType: 'INSERT', new: { aluno_id: 'aluno-a' }, old: {} });
  assert.equal(r.chamadas(), 1);
});
