import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import path from 'node:path';
/* eslint-disable @typescript-eslint/no-require-imports */
let batch: any = null;
const metrics = new Map<string, any>();
let failMetrics = false;
// Erros que o upsert de `telemetria_lotes` devolve, um por chamada (fila); e as linhas que ele recebeu.
let loteErros: any[] = [];
let loteTentativas: any[] = [];
// Linhas que o upsert de `telemetria_sessoes` recebeu.
let sessaoLinhas: any[] = [];
const client = { from(table: string) {
  const query = {
    select() { return this; }, eq() { return this; },
    async single() { return { data: batch, error: null }; },
    upsert(row: any, options: any) {
      if (table === 'telemetria_lotes') {
        assert.equal(options.onConflict, 'sessao_id,captured_at,flush_reason');
        loteTentativas.push(row);
        const erro = loteErros.shift();
        if (erro) return { select() { return { async maybeSingle() { return { data: null, error: erro }; } }; } };
        const inserted = batch ? null : row;
        batch ??= row;
        return { select() { return { async maybeSingle() { return { data: inserted, error: null }; } }; } };
      }
      if (table === 'telemetria_sessoes') sessaoLinhas.push(row);
      if (table === 'telemetria_time_metric_entries') {
        assert.equal(options.ignoreDuplicates, true);
        for (const value of row) metrics.set(`${value.lote_id}:${value.scope}:${value.entry_key}`, value);
        if (failMetrics) { failMetrics=false; return Promise.resolve({ error: new Error('Response lost after commit') }); }
      }
      return Promise.resolve({ error: null });
    },
  };
  return query;
} };
(require.cache as Record<string,unknown>)[require.resolve('@/database/supabase')] = {
  exports: { supabase: client, getSessionSafe: async () => ({user:{id:'student'}}) },
};
(require.cache as Record<string,unknown>)[require.resolve('@/services/apiBaseUrl')] = {
  exports: { resolveApiBaseCandidates:()=>[], isNetworkRequestFailedError:()=>false },
};
const { enviarLoteTelemetria } = require('./telemetriaApi') as typeof import('./telemetriaApi');

test('resposta perdida e reenvio reutilizam o lote, sem somar o tempo novamente', async () => {
  const payload = {
    sessao_id:'11111111-1111-4111-8111-111111111111', classe_id:54, topico_id:131,
    screen_name:'trilha',route_name:'/trilha/131',flush_reason:'interval',
    captured_at:'2026-09-20T19:00:00Z',session_started_at:'2026-09-20T18:59:00Z',
    study_elapsed_sec:60,screen_dwell_sec:60,active_sec:60,idle_sec:0,
    touch_count:1,scroll_distance_px:0,max_depth_px:0,camera:{enabled:false},
    signals:[],eventos_app:[],touch_samples:[],time_metrics:{
      general:{},topics:[{key:'topic:131',topico_id:131,dwell_sec:60,active_sec:60}],
      contents:[],activities:[],materials:[],
    },
  } as any;
  failMetrics=true;
  await assert.rejects(enviarLoteTelemetria(payload));
  const id=batch.id;
  await enviarLoteTelemetria(payload);
  await enviarLoteTelemetria(payload);
  assert.equal(batch.id,id);
  assert.equal(metrics.size,1);
  assert.equal([...metrics.values()].reduce((sum,row)=>sum+row.active_sec,0),60);
});

test('sem URL configurada grava motivo sem_url e não envia via (é do gatilho)', async () => {
  batch = null;
  metrics.clear();
  const payload = {
    sessao_id:'22222222-2222-4222-8222-222222222222', classe_id:54, topico_id:131,
    screen_name:'trilha',route_name:'/trilha/131',flush_reason:'interval',
    captured_at:'2026-09-20T20:00:00Z',session_started_at:'2026-09-20T19:59:00Z',
    study_elapsed_sec:60,screen_dwell_sec:60,active_sec:60,idle_sec:0,
    touch_count:1,scroll_distance_px:0,max_depth_px:0,camera:{enabled:false},
    signals:[],eventos_app:[],touch_samples:[],time_metrics:{
      general:{},topics:[],contents:[],activities:[],materials:[],
    },
  } as any;
  await enviarLoteTelemetria(payload);
  assert.equal(batch.fallback_motivo,'sem_url');
  assert.equal('via' in batch,false);
});

function payloadDeLote(sessao: string) {
  return {
    sessao_id:sessao, classe_id:54, topico_id:131,
    screen_name:'trilha',route_name:'/trilha/131',flush_reason:'interval',
    captured_at:'2026-09-20T21:00:00Z',session_started_at:'2026-09-20T20:59:00Z',
    study_elapsed_sec:60,screen_dwell_sec:60,active_sec:60,idle_sec:0,
    touch_count:1,scroll_distance_px:0,max_depth_px:0,camera:{enabled:false},
    signals:[],eventos_app:[],touch_samples:[],time_metrics:{
      general:{},topics:[],contents:[],activities:[],materials:[],
    },
  } as any;
}

test('banco sem a coluna fallback_motivo (PGRST204): regrava uma vez sem ela e não perde o lote', async () => {
  // Build novo contra banco sem a 20261029_01: o upsert falha por coluna inexistente e o lote não pode se perder.
  batch = null;
  metrics.clear();
  loteTentativas = [];
  loteErros = [{ code: 'PGRST204', message: "Could not find the 'fallback_motivo' column of 'telemetria_lotes'" }];
  await enviarLoteTelemetria(payloadDeLote('33333333-3333-4333-8333-333333333333'));
  assert.equal(loteTentativas.length, 2);
  assert.equal(loteTentativas[0].fallback_motivo, 'sem_url');
  assert.equal('fallback_motivo' in loteTentativas[1], false);
  assert.equal(batch.sessao_id, '33333333-3333-4333-8333-333333333333');
  assert.equal('fallback_motivo' in batch, false);
});

test('coluna inexistente do Postgres (42703) também regrava sem fallback_motivo', async () => {
  batch = null;
  metrics.clear();
  loteTentativas = [];
  loteErros = [{ code: '42703', message: 'column "fallback_motivo" of relation "telemetria_lotes" does not exist' }];
  await enviarLoteTelemetria(payloadDeLote('44444444-4444-4444-8444-444444444444'));
  assert.equal(loteTentativas.length, 2);
  assert.equal('fallback_motivo' in loteTentativas[1], false);
});

test('outro erro do upsert do lote continua rejeitando, sem segunda tentativa', async () => {
  batch = null;
  metrics.clear();
  loteTentativas = [];
  loteErros = [{ code: '42501', message: 'permission denied' }];
  await assert.rejects(enviarLoteTelemetria(payloadDeLote('55555555-5555-4555-8555-555555555555')));
  assert.equal(loteTentativas.length, 1);
});

test('se a segunda tentativa sem fallback_motivo também falhar, o erro sobe', async () => {
  batch = null;
  metrics.clear();
  loteTentativas = [];
  loteErros = [{ code: 'PGRST204' }, { code: '42501', message: 'permission denied' }];
  await assert.rejects(enviarLoteTelemetria(payloadDeLote('66666666-6666-4666-8666-666666666666')));
  assert.equal(loteTentativas.length, 2);
});

function payloadComMotivo(sessao: string, motivo: string) {
  return { ...payloadDeLote(sessao), flush_reason: motivo, captured_at: '2026-09-20T21:05:00Z' };
}

test('screen_blur pelo caminho direto fecha a sessão', async () => {
  batch = null;
  metrics.clear();
  sessaoLinhas = [];
  loteErros = [];
  const payload = payloadComMotivo('77777777-7777-4777-8777-777777777777', 'screen_blur');
  await enviarLoteTelemetria(payload);
  assert.equal(sessaoLinhas.length, 1);
  assert.equal(sessaoLinhas[0].ended_at, payload.captured_at);
});

test('lote interval pelo caminho direto não manda ended_at', async () => {
  batch = null;
  metrics.clear();
  sessaoLinhas = [];
  loteErros = [];
  await enviarLoteTelemetria(payloadDeLote('88888888-8888-4888-8888-888888888888'));
  assert.equal(sessaoLinhas.length, 1);
  assert.equal('ended_at' in sessaoLinhas[0], false);
});

test('caminho direto fecha nos três motivos terminais e em nenhum outro', async () => {
  const { TERMINAL_FLUSH_REASONS } =
    require('@/interfaces/telemetria/TelemetryContracts') as typeof import('@/interfaces/telemetria/TelemetryContracts');
  const sessoes = [
    ['screen_blur', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1'],
    ['app_background', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2'],
    ['session_end', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa3'],
    ['interval', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa4'],
    ['activity_complete', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa5'],
    ['topic_complete', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa6'],
  ] as const;
  for (const [motivo, sessao] of sessoes) {
    batch = null;
    metrics.clear();
    sessaoLinhas = [];
    loteErros = [];
    const payload = payloadComMotivo(sessao, motivo);
    await enviarLoteTelemetria(payload);
    assert.equal(sessaoLinhas.length, 1, motivo);
    if (TERMINAL_FLUSH_REASONS.has(motivo)) {
      assert.equal(sessaoLinhas[0].ended_at, payload.captured_at, motivo);
    } else {
      assert.equal('ended_at' in sessaoLinhas[0], false, motivo);
    }
  }
  // a lista do teste cobre exatamente os terminais do aparelho
  assert.deepEqual(
    sessoes.filter(([m]) => TERMINAL_FLUSH_REASONS.has(m)).map(([m]) => m).sort(),
    [...TERMINAL_FLUSH_REASONS].sort(),
  );
});

test('a lista terminal do aparelho é a mesma da API', () => {
  const { TERMINAL_FLUSH_REASONS } =
    require('@/interfaces/telemetria/TelemetryContracts') as typeof import('@/interfaces/telemetria/TelemetryContracts');
  const fonte = readFileSync(path.resolve(__dirname, '../../../api/app/api/v1/telemetria.py'), 'utf8');
  const achado = /^TERMINAL_FLUSH_REASONS\s*=\s*\{([^}]*)\}/m.exec(fonte);
  assert.ok(achado, 'TERMINAL_FLUSH_REASONS não encontrado em telemetria.py');
  const daApi = [...achado[1].matchAll(/["']([a-z_]+)["']/g)].map((m) => m[1]).sort();
  assert.ok(daApi.length > 0);
  assert.deepEqual([...TERMINAL_FLUSH_REASONS].sort(), daApi);
});
