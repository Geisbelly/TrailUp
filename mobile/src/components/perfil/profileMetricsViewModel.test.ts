import assert from 'node:assert/strict';
import test from 'node:test';
/* eslint-disable @typescript-eslint/no-require-imports */
(require.cache as Record<string, unknown>)[require.resolve('@/database/supabase')] = { exports: { supabase: {} } };
const { buildProfileMetricsViewModel: build } = require('./profileMetricsViewModel') as typeof import('./profileMetricsViewModel');

const input = (): Parameters<typeof build>[0] => ({ classeAtual: {
  classe_id: 54, resumo: { porcentagemConcluida: 21.31, tempoGastoMin: 1 },
  topicos: [
    { id: 131, ordem: 0, nome: 'Introdução', percentual_concluido: 100, next: [133], conteudos: [], atividades: [] },
    { id: 133, ordem: 1, nome: 'Segunda aula', percentual_concluido: 0, depende: [131], conteudos: [], atividades: [] },
  ],
} as any, conquistas: [], eventos: [], posicoesDoAluno: [], perfis: [], lastAnalysis: null,
  cameraOptIn: false, cameraPermission: 'unknown' });

test('presença e último registro usam respostas confirmadas mesmo sem eventos de prêmio', () => {
  const vm = build({ ...input(), presenca: { dias_ativos: 3, registros_recentes: 48,
    semana_diaria: [0, 1, 1, 0, 0, 0, 46], ultimo_registro: '2026-09-20T19:38:39Z' } });
  assert.equal(vm.diasAtivos, 3);
  assert.equal(vm.ultimoEvento, '2026-09-20T19:38:39Z');
  assert.match(vm.proximoMarco, /Segunda aula/);
});

test('próximo movimento respeita bloqueio e progresso canônico', () => {
  const args = input();
  args.classeAtual!.topicos[0].percentual_concluido = 50;
  assert.match(build(args).proximoMarco, /Introdução/);
});

test('perfil não soma a sessão inteira sobre o tempo persistido e agrega bosses dos conteúdos', () => {
  const vm = build({ ...input(), lastBatchTimeMetrics: { general: { session_elapsed_sec: 260 } } as any,
    battleStates: [{ totalDamage: 40 }, { totalDamage: 25 }] as any });
  assert.equal(vm.tempo, 1);
  assert.equal(vm.danoTotal, 65);
});

test('tempo recente soma os itens do mesmo escopo, não tira a média', () => {
  const vm = build({ ...input(), lastBatchTimeMetrics: {
    general: {}, topics: [{ active_sec: 60 }], contents: [{ active_sec: 60 }],
    activities: [{ active_sec: 15 }, { active_sec: 45 }], materials: [],
  } as any });
  assert.equal(vm.tempoTopico, 60);
  assert.equal(vm.tempoConteudo, 60);
  assert.equal(vm.tempoAtividade, 60);
  assert.equal(vm.tempo, 1, 'escopos inclusivos não são somados ao total persistido');
});
