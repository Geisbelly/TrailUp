import { test } from "node:test";
import assert from "node:assert/strict";

import { buildProfileMetricsViewModel } from "./profileMetricsViewModel";

/**
 * `vm.tempo` é o MESMO número que o rank "Tempo de Estudo" e a trilha mostram
 * -- a tela o rotula como "Tempo de estudo" e "Tempo investido". Então ele vem
 * do banco e só do banco.
 *
 * Havia `+ sessionElapsedSec / 60` no cálculo, e `session_elapsed_sec` é
 * `now - sessionStartedAt`: a sessão INTEIRA, não o lote (ver
 * `MetricasContext.montarTimeMetrics`). O tempo do banco já inclui tudo que os
 * lotes desta mesma sessão gravaram, então somar os dois contava a sessão duas
 * vezes -- e o erro CRESCIA com a duração: 10 min de estudo apareciam como ~20
 * na métrica e como 10 no rank.
 *
 * A correção de `escolherTempoDaClasse` resolveu qual FONTE manda; esta
 * resolve a soma que vinha depois dela.
 */

const TEMPO_DO_BANCO = 2.37;

function paramsMinimos(sessionElapsedSec: number) {
  return {
    classeAtual: {
      id: 32,
      nome: "Sistemas Distribuídos",
      resumo: { tempoGastoMin: TEMPO_DO_BANCO, porcentagemConcluida: 99.06 },
      topicos: [
        {
          id: 125,
          percentual_concluido: 100,
          status: "concluido",
          tempo_gasto_min: 1.85,
          conteudos: [],
          atividades: [],
        },
      ],
    },
    conquistas: [],
    eventos: [],
    posicoesDoAluno: [],
    perfis: [],
    lastAnalysis: null,
    lastBatchTimeMetrics: {
      general: {
        session_elapsed_sec: sessionElapsedSec,
        batch_dwell_sec: 0,
        batch_active_sec: 0,
        batch_idle_sec: 0,
        touch_count: 0,
        scroll_distance_px: 0,
        max_depth_px: 0,
      },
      topics: [],
      contents: [],
      activities: [],
      materials: [],
    },
    cameraOptIn: false,
    cameraPermission: "denied",
  } as unknown as Parameters<typeof buildProfileMetricsViewModel>[0];
}

test("tempo da metrica ignora a sessao ao vivo e fica igual ao do banco", () => {
  const vm = buildProfileMetricsViewModel(paramsMinimos(0));

  assert.equal(vm.tempo, TEMPO_DO_BANCO);
});

test("sessao longa NAO infla o tempo: era o dobro na tela e o certo no rank", () => {
  // Meia hora de sessao: antes da correcao isto somava 30 min ao valor do
  // banco e a metrica divergia do rank em 30 minutos.
  const vm = buildProfileMetricsViewModel(paramsMinimos(1800));

  assert.equal(vm.tempo, TEMPO_DO_BANCO);
});

test("o valor nao muda conforme a sessao cresce", () => {
  const curto = buildProfileMetricsViewModel(paramsMinimos(60)).tempo;
  const longo = buildProfileMetricsViewModel(paramsMinimos(36_000)).tempo;

  assert.equal(curto, longo);
});

test("o dado ao vivo continua exposto, separado, em tempoAtivoMin", () => {
  // A informacao da sessao nao se perde -- ela so deixa de contaminar o
  // numero que tem de casar com o rank.
  const params = paramsMinimos(1800) as unknown as Record<string, unknown>;
  const metrics = params.lastBatchTimeMetrics as {
    general: Record<string, number>;
  };
  metrics.general.batch_active_sec = 120;

  const vm = buildProfileMetricsViewModel(
    params as unknown as Parameters<typeof buildProfileMetricsViewModel>[0],
  );

  assert.equal(vm.tempo, TEMPO_DO_BANCO);
  assert.equal(vm.tempoAtivoMin, 2);
});
