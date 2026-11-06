import assert from "node:assert/strict";
import test from "node:test";

import {
  accumulateContextTime,
  buildEmptyBatch,
  EMPTY_STUDY_CONTEXT,
  intervaloCreditavelMs,
  markContextVisit,
  registraNoConteudo,
  SALTO_MAXIMO_DA_LINHA_DO_TEMPO_MS,
  serializeTimeMetricEntries,
  somarTimeMetrics,
  type CurrentStudyContext,
} from "./acumuladorLote";

const T0 = 1_800_000_000_000;

function contexto(over: Partial<CurrentStudyContext> = {}): CurrentStudyContext {
  return { ...EMPTY_STUDY_CONTEXT, ...over };
}

test("visita ao topico conta mesmo com o contexto idle", () => {
  // O bug: `markContextVisit` exigia `studyState === "active"`, e o unico
  // instante em que a troca de topico e observada e a abertura da sessao, onde
  // o contexto e `idle`. No banco: scope `topic` com 3 linhas e soma de
  // `visits` = 0, contra uma visita por linha em todos os outros escopos.
  const batch = buildEmptyBatch(T0);

  markContextVisit(batch, EMPTY_STUDY_CONTEXT, contexto({ topicoId: 128 }));

  assert.equal(batch.timeMetrics.topics["topic:128"]?.visits, 1);
});

test("visita nao e recontada quando o topico nao mudou", () => {
  const batch = buildEmptyBatch(T0);
  const atual = contexto({ topicoId: 128 });

  markContextVisit(batch, EMPTY_STUDY_CONTEXT, atual);
  markContextVisit(batch, atual, atual);
  markContextVisit(batch, atual, atual);

  assert.equal(batch.timeMetrics.topics["topic:128"]?.visits, 1);
});

test("visita conta para conteudo, atividade e material", () => {
  const batch = buildEmptyBatch(T0);

  markContextVisit(
    batch,
    EMPTY_STUDY_CONTEXT,
    contexto({
      topicoId: 1,
      conteudoId: 87,
      atividadeId: 1063,
      materialKey: "material:content:42",
    })
  );

  assert.equal(batch.timeMetrics.contents["content:87"]?.visits, 1);
  assert.equal(batch.timeMetrics.activities["activity:1063"]?.visits, 1);
  assert.equal(batch.timeMetrics.materials["material:content:42"]?.visits, 1);
});

test("o topico conta fora do item; conteudo, atividade e material exigem item aberto", () => {
  const batch = buildEmptyBatch(T0);

  accumulateContextTime(
    batch,
    contexto({ topicoId: 128, conteudoId: 87, atividadeId: 9, materialKey: "m", studyState: "idle" }),
    5_000,
    0
  );

  assert.equal(batch.timeMetrics.topics["topic:128"]?.activeMs, 5_000);
  assert.deepEqual(batch.timeMetrics.contents, {});
  assert.deepEqual(batch.timeMetrics.activities, {});
  assert.deepEqual(batch.timeMetrics.materials, {});
});

test("atividade vinculada a conteudo nao credita o conteudo: o topico fica maior que a soma", () => {
  const batch = buildEmptyBatch(T0);

  accumulateContextTime(batch, contexto({ topicoId: 7, studyState: "idle" }), 2_000, 0);
  accumulateContextTime(batch, contexto({ topicoId: 7, conteudoId: 87, studyState: "active" }), 10_000, 0);
  accumulateContextTime(
    batch,
    contexto({ topicoId: 7, conteudoId: 87, atividadeId: 9, studyState: "active" }),
    3_000,
    0
  );

  const conteudo = batch.timeMetrics.contents["content:87"]?.activeMs ?? 0;
  const atividade = batch.timeMetrics.activities["activity:9"]?.activeMs ?? 0;
  const topico = batch.timeMetrics.topics["topic:7"]?.activeMs ?? 0;
  assert.equal(conteudo, 10_000);
  assert.equal(atividade, 3_000);
  assert.equal(topico, 15_000);
  assert.ok(topico > conteudo + atividade);
});

test("atividade personalizada (id local negativo) segue creditando o conteudo vinculado", () => {
  const batch = buildEmptyBatch(T0);

  accumulateContextTime(
    batch,
    contexto({ topicoId: 7, conteudoId: 87, atividadeId: -123, studyState: "active" }),
    3_000,
    0
  );

  assert.equal(batch.timeMetrics.contents["content:87"]?.activeMs, 3_000);
});

test("registraNoConteudo: so conteudo real sem atividade real", () => {
  assert.equal(registraNoConteudo(contexto({ conteudoId: 87 })), true);
  assert.equal(registraNoConteudo(contexto({ conteudoId: 87, atividadeId: -1 })), true);
  assert.equal(registraNoConteudo(contexto({ conteudoId: 87, atividadeId: 9 })), false);
  assert.equal(registraNoConteudo(contexto({ atividadeId: 9 })), false);
  assert.equal(registraNoConteudo(contexto()), false);
});

test("salto na linha do tempo e JS dormindo, nao tempo de estudo", () => {
  assert.equal(intervaloCreditavelMs(1_000), 1_000);
  assert.equal(intervaloCreditavelMs(SALTO_MAXIMO_DA_LINHA_DO_TEMPO_MS), SALTO_MAXIMO_DA_LINHA_DO_TEMPO_MS);
  assert.equal(intervaloCreditavelMs(30 * 60_000), 0);
  assert.equal(intervaloCreditavelMs(-1), 0);
});

function metricas(activeSec: number, chave = "topic:7") {
  const entrada = {
    key: chave, visits: 1, dwell_sec: activeSec, active_sec: activeSec, idle_sec: 0,
    touch_count: 1, scroll_distance_px: 10, max_depth_px: activeSec,
  };
  return {
    general: {
      session_elapsed_sec: activeSec, batch_dwell_sec: activeSec, batch_active_sec: activeSec,
      batch_idle_sec: 0, touch_count: 1, scroll_distance_px: 10, max_depth_px: activeSec,
    },
    topics: [entrada], contents: [], activities: [], materials: [],
  };
}

test("o recente soma os lotes em vez de ficar com o ultimo", () => {
  const somado = somarTimeMetrics(somarTimeMetrics(null, metricas(60)), metricas(19));

  assert.equal(somado.topics.length, 1);
  assert.equal(somado.topics[0].active_sec, 79);
  assert.equal(somado.topics[0].max_depth_px, 60);
  assert.equal(somado.general.batch_active_sec, 79);
  assert.equal(somado.general.touch_count, 2);
});

test("somar nao altera o acumulado: o lote em andamento nao pode entrar duas vezes", () => {
  const fechados = somarTimeMetrics(null, metricas(60));

  somarTimeMetrics(fechados, metricas(5));
  const publicado = somarTimeMetrics(fechados, metricas(6));

  assert.equal(publicado.topics[0].active_sec, 66);
  assert.equal(fechados.topics[0].active_sec, 60);
});

test("lote devolvido sai do acumulado: ele volta a contar pelo lote em andamento", () => {
  const fechados = somarTimeMetrics(metricas(60), metricas(30));

  const semODevolvido = somarTimeMetrics(fechados, metricas(30), -1);

  assert.equal(semODevolvido.topics[0].active_sec, 60);
  assert.equal(semODevolvido.general.batch_active_sec, 60);
});

test("topicos diferentes ficam em entradas separadas, a maior primeiro", () => {
  const somado = somarTimeMetrics(metricas(10, "topic:1"), metricas(40, "topic:2"));

  assert.deepEqual(somado.topics.map((t) => t.key), ["topic:2", "topic:1"]);
});

test("dwell e a soma de ativo e ocioso", () => {
  const batch = buildEmptyBatch(T0);
  const ativo = contexto({ topicoId: 7, studyState: "active" });

  accumulateContextTime(batch, ativo, 4_000, 1_000);
  accumulateContextTime(batch, ativo, 2_000, 3_000);

  const entrada = batch.timeMetrics.topics["topic:7"];
  assert.equal(entrada?.activeMs, 6_000);
  assert.equal(entrada?.idleMs, 4_000);
  assert.equal(entrada?.dwellMs, 10_000);
});

test("buildEmptyBatch zera o acumulado: o lote carrega o tempo DAQUELE lote", () => {
  // Este invariante e a premissa da migration `20260830_01`, que trocou a soma
  // de incrementos por `sum(dwell_sec)`. Se alguem voltar a acumular entre
  // lotes, a conta no banco passa a somar o mesmo tempo varias vezes.
  const batch = buildEmptyBatch(T0);
  accumulateContextTime(batch, contexto({ topicoId: 9, studyState: "active" }), 60_000, 0);
  assert.equal(batch.timeMetrics.topics["topic:9"]?.dwellMs, 60_000);

  const proximo = buildEmptyBatch(T0 + 60_000);
  assert.deepEqual(proximo.timeMetrics.topics, {});
  assert.equal(proximo.generalActiveMs, 0);
  assert.equal(proximo.generalIdleMs, 0);
  assert.equal(proximo.touchCount, 0);
});

test("serializacao expoe `key` e ordena por tempo ativo", () => {
  // `key` e a identidade que a chave unica `(lote_id, scope, entry_key)` usa no
  // banco; sem ela a dedup de `20260830_01` nao tem por onde casar.
  const batch = buildEmptyBatch(T0);
  accumulateContextTime(batch, contexto({ topicoId: 1, studyState: "active" }), 1_000, 0);
  accumulateContextTime(batch, contexto({ topicoId: 2, studyState: "active" }), 9_000, 0);

  const linhas = serializeTimeMetricEntries(batch.timeMetrics.topics);

  assert.deepEqual(
    linhas.map((l) => l.key),
    ["topic:2", "topic:1"],
    "maior tempo ativo primeiro"
  );
  assert.equal(linhas[0].dwell_sec, 9);
  assert.equal(linhas[0].topico_id, 2);
});

test("tempo negativo nao subtrai do acumulado", () => {
  const batch = buildEmptyBatch(T0);
  accumulateContextTime(batch, contexto({ topicoId: 3, studyState: "active" }), -5_000, -1_000);

  const entrada = batch.timeMetrics.topics["topic:3"];
  assert.equal(entrada?.activeMs, 0);
  assert.equal(entrada?.idleMs, 0);
  assert.equal(entrada?.dwellMs, 0);
});
