import assert from "node:assert/strict";
import test from "node:test";

import {
  accumulateContextTime,
  buildEmptyBatch,
  EMPTY_STUDY_CONTEXT,
  markContextVisit,
  serializeTimeMetricEntries,
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

test("TEMPO segue exigindo contexto ativo", () => {
  // O guard saiu da visita, nao do tempo: contar tempo no menu da trilha, onde
  // o aluno nao consome nada, inflaria o tempo de estudo.
  const batch = buildEmptyBatch(T0);

  accumulateContextTime(batch, contexto({ topicoId: 128, studyState: "idle" }), 5_000, 0);
  // `assert.ok` em vez de comparar com `undefined`: o `assert.equal` do modo
  // strict estreita o tipo e o reacesso abaixo viraria `never`.
  assert.ok(
    !("topic:128" in batch.timeMetrics.topics),
    "contexto idle nao pode nem criar a entrada de tempo"
  );

  accumulateContextTime(batch, contexto({ topicoId: 128, studyState: "active" }), 5_000, 0);
  assert.equal(batch.timeMetrics.topics["topic:128"]?.activeMs, 5_000);
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
