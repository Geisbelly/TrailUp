import assert from 'node:assert/strict';
import test from 'node:test';
/* eslint-disable @typescript-eslint/no-require-imports */
let batch: any = null;
const metrics = new Map<string, any>();
let failMetrics = false;
const client = { from(table: string) {
  const query = {
    select() { return this; }, eq() { return this; },
    async single() { return { data: batch, error: null }; },
    upsert(row: any, options: any) {
      if (table === 'telemetria_lotes') {
        assert.equal(options.onConflict, 'sessao_id,captured_at,flush_reason');
        const inserted = batch ? null : row;
        batch ??= row;
        return { select() { return { async maybeSingle() { return { data: inserted, error: null }; } }; } };
      }
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
