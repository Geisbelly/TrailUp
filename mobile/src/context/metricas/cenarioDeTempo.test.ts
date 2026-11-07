import assert from "node:assert/strict";
import test from "node:test";

import {
  buildEmptyBatch,
  EMPTY_STUDY_CONTEXT,
  marcarLinhaDoTempo,
  nextStudyBatch,
  restoreUnsentBatch,
  roundSeconds,
  serializeTimeMetricEntries,
  somarTimeMetrics,
  type BatchAccumulator,
  type CurrentStudyContext,
} from "./acumuladorLote";
import type { TelemetryTimeMetrics } from "../../interfaces/telemetria/TelemetryContracts";

/* eslint-disable @typescript-eslint/no-require-imports */
(require.cache as Record<string, unknown>)[require.resolve("@/database/supabase")] = {
  exports: { supabase: {} },
};
const { buildProfileMetricsViewModel } =
  require("../../components/perfil/profileMetricsViewModel") as typeof import("../../components/perfil/profileMetricsViewModel");

const T0 = 1_800_000_000_000;
const DURACAO_DO_LOTE_MS = 60_000;

/** Marca a linha do tempo como o `syncBatchTimeline` e gira os lotes como o contexto. */
class Sessao {
  agora = T0;
  lote: BatchAccumulator = buildEmptyBatch(T0);
  fechados: TelemetryTimeMetrics | null = null;
  retratos: TelemetryTimeMetrics[] = [];
  contexto: CurrentStudyContext = { ...EMPTY_STUDY_CONTEXT, topicoId: 7 };
  appAtivo = true;
  reproduzindo = false;

  private sincronizar() {
    marcarLinhaDoTempo(this.lote, this.contexto, this.agora, {
      appAtivo: this.appAtivo,
      reproduzindo: this.reproduzindo,
    });
  }

  /** Avança o relógio em passos de 1 s, como o snapshot do contexto. */
  passar(ms: number) {
    for (let restante = ms; restante > 0; restante -= 1000) {
      this.agora += Math.min(1000, restante);
      this.sincronizar();
      if (this.agora - this.lote.batchStartedAtMs >= DURACAO_DO_LOTE_MS) this.girarLote();
    }
  }

  /** O JS dormiu: o relógio pula e a próxima marcação vê o intervalo inteiro. */
  dormir(ms: number) {
    this.agora += ms;
    this.sincronizar();
  }

  tocar() {
    this.sincronizar();
    this.lote.lastInteractionAtMs = this.agora;
  }

  abrir(contexto: Partial<CurrentStudyContext>) {
    this.sincronizar();
    this.contexto = { ...EMPTY_STUDY_CONTEXT, topicoId: 7, ...contexto };
    this.tocar();
  }

  retrato(lote: BatchAccumulator): TelemetryTimeMetrics {
    const dwell = roundSeconds(lote.generalActiveMs + lote.generalIdleMs);
    return {
      general: {
        session_elapsed_sec: 0,
        batch_dwell_sec: dwell,
        batch_active_sec: Math.min(dwell, roundSeconds(lote.generalActiveMs)),
        batch_idle_sec: Math.min(dwell, roundSeconds(lote.generalIdleMs)),
        touch_count: 0,
        scroll_distance_px: 0,
        max_depth_px: 0,
      },
      topics: serializeTimeMetricEntries(lote.timeMetrics.topics),
      contents: serializeTimeMetricEntries(lote.timeMetrics.contents),
      activities: serializeTimeMetricEntries(lote.timeMetrics.activities),
      materials: serializeTimeMetricEntries(lote.timeMetrics.materials),
    };
  }

  girarLote(falhouOEnvio = false) {
    const velho = this.lote;
    const retrato = this.retrato(velho);
    this.fechados = somarTimeMetrics(this.fechados, retrato);
    this.lote = nextStudyBatch(velho, this.agora);
    if (falhouOEnvio) {
      this.fechados = somarTimeMetrics(this.fechados, retrato, -1);
      this.lote = restoreUnsentBatch(velho, this.lote);
      return;
    }
    this.retratos.push(retrato);
  }

  publicado(): TelemetryTimeMetrics {
    return somarTimeMetrics(this.fechados, this.retrato(this.lote));
  }
}

const ativoEm = (entradas: { active_sec: number }[]) =>
  entradas.reduce((total, entrada) => total + entrada.active_sec, 0);

/** I2 e I3 da spec de métricas, com as tolerâncias das consultas de lá, lote a lote. */
function conferirInvariantesDoLote(lote: TelemetryTimeMetrics, contexto: string) {
  const escopos = [lote.topics, lote.contents, lote.activities, lote.materials];
  for (const entrada of escopos.flat()) {
    assert.ok(entrada.active_sec >= 0 && entrada.idle_sec >= 0, `${contexto}: tempo negativo`);
    assert.ok(entrada.active_sec <= entrada.dwell_sec + 0.5, `${contexto}: ativo maior que presenca`);
    assert.ok(
      Math.abs(entrada.active_sec + entrada.idle_sec - entrada.dwell_sec) <= 1,
      `${contexto}: ativo + ocioso diferente da presenca`
    );
  }
  assert.ok(ativoEm(lote.contents) <= ativoEm(lote.topics) + 1, `${contexto}: conteudo maior que topico`);
  assert.ok(ativoEm(lote.materials) <= ativoEm(lote.contents) + 1, `${contexto}: material maior que conteudo`);
}

/** Sorteio com semente: a mesma falha se repete em toda execução. */
function sorteador(semente: number) {
  let estado = semente;
  return (limite: number) => {
    estado = (estado * 1_664_525 + 1_013_904_223) % 4_294_967_296;
    return Math.floor((estado / 4_294_967_296) * limite);
  };
}

test("sessao inteira: o perfil mostra a soma dos lotes, e nao o ultimo", () => {
  const sessao = new Sessao();
  sessao.abrir({ conteudoId: 87, studyState: "active" });
  for (let minuto = 0; minuto < 5; minuto += 1) {
    for (let toque = 0; toque < 6; toque += 1) {
      sessao.tocar();
      sessao.passar(10_000);
    }
  }

  const publicado = sessao.publicado();
  assert.equal(ativoEm(publicado.topics), 300);
  assert.equal(ativoEm(publicado.contents), 300);
  assert.equal(publicado.general.batch_active_sec, 300);
  assert.ok(ativoEm(sessao.retrato(sessao.lote).topics) <= 60, "um lote sozinho nao passa de 60 s");
});

test("o que o perfil exibe sai da soma: topico cobre conteudo e atividade", () => {
  const sessao = new Sessao();
  sessao.tocar();
  sessao.passar(10_000);
  sessao.abrir({ conteudoId: 87, studyState: "active" });
  for (let i = 0; i < 12; i += 1) {
    sessao.tocar();
    sessao.passar(10_000);
  }
  sessao.abrir({ conteudoId: 87, atividadeId: 9, studyState: "active" });
  for (let i = 0; i < 6; i += 1) {
    sessao.tocar();
    sessao.passar(10_000);
  }
  sessao.abrir({ studyState: "idle" });
  sessao.passar(10_000);

  const vm = buildProfileMetricsViewModel({
    classeAtual: null,
    conquistas: [],
    eventos: [],
    posicoesDoAluno: [],
    perfis: [],
    lastAnalysis: null,
    cameraOptIn: false,
    cameraPermission: "unknown",
    timeMetricsRecentes: sessao.publicado(),
  } as never);
  assert.equal(vm.tempoConteudo, 120);
  assert.equal(vm.tempoAtividade, 60);
  assert.equal(vm.tempoTopico, 200);
  assert.ok(vm.tempoTopico >= vm.tempoConteudo + vm.tempoAtividade);
});

test("tela desligada no meio do conteudo nao entra em escopo nenhum, nem depois de trocar de item", () => {
  const sessao = new Sessao();
  sessao.abrir({ conteudoId: 87, studyState: "active" });
  sessao.passar(10_000);

  sessao.dormir(20 * 60_000);
  sessao.abrir({ conteudoId: 88, studyState: "active" });
  sessao.passar(10_000);

  const publicado = sessao.publicado();
  assert.equal(ativoEm(publicado.topics), 20);
  assert.equal(ativoEm(publicado.contents), 20);
  assert.equal(publicado.general.batch_dwell_sec, 20);
});

test("app fora de foco nao conta, e o lote que falhou nao conta duas vezes", () => {
  const sessao = new Sessao();
  sessao.abrir({ conteudoId: 87, studyState: "active" });
  sessao.passar(10_000);

  sessao.appAtivo = false;
  sessao.passar(5 * 60_000);
  sessao.appAtivo = true;

  sessao.tocar();
  sessao.passar(10_000);
  sessao.girarLote(true);

  assert.equal(ativoEm(sessao.publicado().topics), 20);
});

test("audio tocando sem toque conta inteiro, e pausado volta a ficar ocioso", () => {
  const sessao = new Sessao();
  sessao.abrir({ conteudoId: 87, materialKey: "audio", studyState: "active" });
  sessao.reproduzindo = true;
  sessao.passar(5 * 60_000);
  assert.equal(ativoEm(sessao.publicado().materials), 300);

  sessao.reproduzindo = false;
  sessao.passar(60_000);
  const publicado = sessao.publicado();
  assert.equal(ativoEm(publicado.materials), 315);
  assert.equal(ativoEm(publicado.topics), 315);
  assert.equal(publicado.general.batch_idle_sec, 45);
});

test("audio tocando com a tela desligada nao conta", () => {
  const sessao = new Sessao();
  sessao.abrir({ conteudoId: 87, materialKey: "audio", studyState: "active" });
  sessao.reproduzindo = true;
  sessao.passar(10_000);

  sessao.dormir(20 * 60_000);
  sessao.appAtivo = false;
  sessao.passar(5 * 60_000);
  sessao.appAtivo = true;
  sessao.passar(10_000);

  assert.equal(ativoEm(sessao.publicado().materials), 20);
});

test("em 500 sessoes sorteadas o topico cobre conteudo + atividade, a menos do arredondamento dos lotes", () => {
  let maiorExcesso = 0;
  for (let semente = 1; semente <= 500; semente += 1) {
    const sorteio = sorteador(semente);
    const sessao = new Sessao();
    let lotes = 1;
    for (let passo = 0; passo < 40; passo += 1) {
      const qual = sorteio(5);
      if (qual === 0) sessao.abrir({ conteudoId: 87, studyState: "active" });
      if (qual === 1) sessao.abrir({ conteudoId: 87, atividadeId: 9, studyState: "active" });
      if (qual === 2) sessao.abrir({ atividadeId: -123, conteudoId: 87, studyState: "active" });
      if (qual === 3) sessao.abrir({ studyState: "idle" });
      if (qual === 4) sessao.abrir({ conteudoId: 87, materialKey: "audio", studyState: "active" });
      const antes = sessao.lote;
      sessao.passar(sorteio(40_000) + 250);
      if (sessao.lote !== antes) lotes += 1;
    }
    for (const lote of [...sessao.retratos, sessao.retrato(sessao.lote)]) {
      conferirInvariantesDoLote(lote, `semente ${semente}`);
    }
    const publicado = sessao.publicado();
    const topico = ativoEm(publicado.topics);
    const itens = ativoEm(publicado.contents) + ativoEm(publicado.activities);
    maiorExcesso = Math.max(maiorExcesso, itens - topico);
    assert.ok(itens - topico <= lotes, `semente ${semente}: itens ${itens}, topico ${topico}, lotes ${lotes}`);
  }
  console.log(`maior excesso de arredondamento: ${maiorExcesso} s`);
});
