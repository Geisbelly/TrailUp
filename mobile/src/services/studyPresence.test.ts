import assert from 'node:assert/strict';
import test from 'node:test';
import type { SupabaseClient } from '@supabase/supabase-js';

/* eslint-disable @typescript-eslint/no-require-imports */
(require.cache as Record<string, unknown>)[require.resolve('@/database/supabase')] = { exports: { supabase: {} } };
const { createStudyPresenceLoader } = require('./studyPresence') as typeof import('./studyPresence');
process.env.TZ = 'America/Sao_Paulo';

type Row = Record<string, unknown>;
const validSummary = { dias_ativos: 1, registros_recentes: 1, semana_diaria: [0, 0, 0, 0, 0, 0, 1], ultimo_registro: '2026-09-20T12:00:00Z' };
const missingRpc = { code: 'PGRST202', message: 'Could not find public.trailup_resumo_presenca in the schema cache' };
function time(value: unknown) {
  const raw = String(value ?? '');
  return Date.parse(/(?:Z|[+-]\d{2}:?\d{2})$/i.test(raw) ? raw : raw + 'Z');
}

function setup(rows: Record<string, Row[]> = {}) {
  let now = new Date('2026-09-20T15:00:00Z');
  let rpcError: unknown = missingRpc;
  let rpcData: unknown = validSummary;
  let tableError: unknown = null;
  const rpcCalls: unknown[] = [];
  const reads: { table: string; userId: unknown; from: number; to: number }[] = [];
  const warnings: string[] = [];
  const client = {
    async rpc(name: string, params: unknown) {
      rpcCalls.push({ name, params });
      return { data: rpcError ? null : rpcData, error: rpcError };
    },
    from(table: string) {
      const filters: ((row: Row) => boolean)[] = [];
      let column = '';
      let offset = 0;
      let end = 0;
      let userId: unknown;
      const query = {
        select() { return this; },
        eq(key: string, value: unknown) {
          if (key === 'aluno_id') userId = value;
          filters.push((row) => row[key] === value); return this;
        },
        neq(key: string, value: unknown) { filters.push((row) => row[key] !== value); return this; },
        not(key: string, operator: string, value: unknown) {
          assert.equal(operator, 'is'); assert.equal(value, null);
          filters.push((row) => row[key] != null); return this;
        },
        gt(key: string, value: number) { filters.push((row) => Number(row[key]) > value); return this; },
        lte(key: string, value: string) { filters.push((row) => time(row[key]) <= time(value)); return this; },
        order(key: string, options: { ascending: boolean; nullsFirst: boolean }) {
          assert.equal(options.ascending, false); assert.equal(options.nullsFirst, false);
          column = key; return this;
        },
        or(filter: string) {
          if (table === 'personalizacao_item_progresso') {
            assert.equal(filter, 'percentual_concluido.gt.0,tempo_gasto_min.gt.0');
            filters.push((row) => Number(row.percentual_concluido) > 0 || Number(row.tempo_gasto_min) > 0);
          } else {
            assert.equal(table, 'eventos_aluno');
            assert.match(filter, /tipo\.like\.topico_/);
            filters.push((row) => /^(topico.|conteudo.|atividade.|presenca_aula$|participacao_aula$)/.test(String(row.tipo)));
          }
          return this;
        },
        range(from: number, to: number) { offset = from; end = to; return this; },
        then(resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) {
          reads.push({ table, userId, from: offset, to: end });
          assert.ok(userId, 'toda leitura filtra o aluno atual');
          const data = (rows[table] ?? []).filter((row) => filters.every((filter) => filter(row)))
            .sort((a, b) => time(b[column]) - time(a[column])).slice(offset, end + 1);
          return Promise.resolve({ data, error: tableError }).then(resolve, reject);
        },
      };
      return query;
    },
  } as unknown as SupabaseClient;
  const load = createStudyPresenceLoader(client, { now: () => now, warn: (message) => warnings.push(message) });
  return {
    load, rpcCalls, reads, warnings,
    setRpcError(value: unknown) { rpcError = value; },
    setRpcData(value: unknown) { rpcData = value; },
    setTableError(value: unknown) { tableError = value; },
    advance(ms: number) { now = new Date(now.getTime() + ms); },
  };
}

test('RPC disponível é a fonte principal; chamadas simultâneas do mesmo aluno são unificadas', async () => {
  const service = setup(); service.setRpcError(null);
  const first = service.load('aluno');
  const second = service.load('aluno');
  assert.equal(first, second);
  assert.deepEqual(await first, validSummary);
  assert.deepEqual(service.rpcCalls, [{ name: 'trailup_resumo_presenca', params: { p_timezone: 'America/Sao_Paulo' } }]);
  assert.equal(service.reads.length, 0);
  assert.equal(service.warnings.length, 0);
});

test('PGRST202 lê estudo real em todas as fontes sem transformar login ou tempo ocioso em presença', async () => {
  const service = setup({
    eventos_aluno: [
      { aluno_id: 'aluno', tipo: 'login', criado_em: '2026-09-15T15:00:00' },
      { aluno_id: 'aluno', tipo: 'topico_iniciado', criado_em: '2026-09-18T15:00:00' },
      { aluno_id: 'aluno', tipo: 'topicoX', criado_em: '2026-09-16T15:00:00' },
      { aluno_id: 'aluno', tipo: 'topico_iniciado', criado_em: '2026-09-21T15:00:00' },
    ],
    questao_aluno: [
      { aluno_id: 'aluno', resposta: 'A', criado_em: '2026-09-19T03:30:00Z' },
      { aluno_id: 'aluno', resposta: '  ', criado_em: '2026-09-17T12:00:00Z' },
      { aluno_id: 'aluno', resposta: '', criado_em: '2026-09-17T12:00:00Z' },
    ],
    topico_aluno: [{ aluno_id: 'aluno', ultima_visualizacao: '2026-09-19T03:30:00' }],
    conteudo_aluno: [{ aluno_id: 'aluno', ultima_visualizacao: '2026-09-20T02:30:00' }],
    atividade_aluno: [{ aluno_id: 'aluno', ultima_visualizacao: '2026-09-19T04:00:00' }],
    personalizacao_item_progresso: [
      { aluno_id: 'aluno', percentual_concluido: 0, tempo_gasto_min: 0, updated_at: '2026-09-17T12:00:00Z' },
      { aluno_id: 'aluno', percentual_concluido: 50, tempo_gasto_min: 0, updated_at: '2026-09-20T12:00:00Z' },
    ],
    telemetria_time_metric_entries: [
      { aluno_id: 'aluno', scope: 'topic', active_sec: 0, captured_at: '2026-09-16T12:00:00Z' },
      { aluno_id: 'aluno', scope: 'content', active_sec: 60, captured_at: '2026-09-16T12:00:00Z' },
      { aluno_id: 'aluno', scope: 'topic', active_sec: 60, captured_at: '2026-09-20T12:10:00Z' },
    ],
    estudo_intervalos: [{ aluno_id: 'aluno', criado_em: '2026-09-20T12:15:00Z' }],
  });
  assert.deepEqual(await service.load('aluno'), {
    dias_ativos: 3, registros_recentes: 7, semana_diaria: [0, 0, 0, 0, 1, 3, 3], ultimo_registro: '2026-09-20T12:15:00.000Z',
  });
  assert.equal(service.reads.length, 8);
  assert.equal(service.warnings.length, 1);
});

test('não repete RPC/aviso durante o cooldown e volta à função após o cache se recuperar', async () => {
  const service = setup();
  await service.load('aluno');
  await service.load('aluno');
  assert.equal(service.rpcCalls.length, 1);
  assert.equal(service.warnings.length, 1);
  const reads = service.reads.length;
  service.advance(60_001); service.setRpcError(null);
  assert.deepEqual(await service.load('aluno'), validSummary);
  assert.equal(service.rpcCalls.length, 2);
  assert.equal(service.reads.length, reads);
});

test('presença é isolada por aluno mesmo durante a leitura alternativa', async () => {
  const service = setup({ estudo_intervalos: [{ aluno_id: 'aluno-a', criado_em: '2026-09-20T12:00:00Z' }] });
  const [a, b] = await Promise.all([service.load('aluno-a'), service.load('aluno-b')]);
  assert.equal(a.dias_ativos, 1);
  assert.equal(b.dias_ativos, 0);
  assert.equal(b.ultimo_registro, null);
});

test('pagina os registros para não truncar presença no limite do Supabase', async () => {
  const service = setup({ estudo_intervalos: Array.from({ length: 601 }, (_, i) => ({
    aluno_id: 'aluno', criado_em: new Date(Date.parse('2026-09-20T12:00:00Z') + i * 1000).toISOString(),
  })) });
  const result = await service.load('aluno');
  assert.equal(result.registros_recentes, 601);
  assert.equal(result.dias_ativos, 1);
  assert.deepEqual(service.reads.filter((read) => read.table === 'estudo_intervalos').map((read) => read.from), [0, 500]);
});

test('último estudo anterior à semana não vira presença recente nem desaparece', async () => {
  const service = setup({ estudo_intervalos: [{ aluno_id: 'aluno', criado_em: '2026-09-01T12:00:00Z' }] });
  const result = await service.load('aluno');
  assert.equal(result.dias_ativos, 0);
  assert.equal(result.ultimo_registro, '2026-09-01T12:00:00.000Z');
});

test('falhas de autorização/rede na RPC não são escondidas pelo fallback', async () => {
  for (const code of ['42501', 'PGRST301', 'NETWORK_ERROR']) {
    const service = setup(); const error = { code }; service.setRpcError(error);
    await assert.rejects(service.load('aluno'), (caught) => caught === error);
    assert.equal(service.reads.length, 0);
    assert.equal(service.warnings.length, 0);
  }
});

test('falha em uma fonte não produz resumo parcial ou presença zero', async () => {
  const service = setup(); const error = { code: '42501' }; service.setTableError(error);
  await assert.rejects(service.load('aluno'), (caught) => caught === error);
});

test('sessão ausente e resposta inválida não passam como sucesso', async () => {
  const service = setup();
  await assert.rejects(service.load(''), /não autenticado/);
  assert.equal(service.rpcCalls.length, 0);
  service.setRpcError(null); service.setRpcData({ semana_diaria: [] });
  await assert.rejects(service.load('aluno'), /inválido/);
  assert.equal(service.reads.length, 0);
});
