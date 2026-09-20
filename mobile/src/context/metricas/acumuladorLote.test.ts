import assert from "node:assert/strict";
import test from "node:test";

import {
  accumulateContextTime,
  buildEmptyBatch,
  EMPTY_STUDY_CONTEXT,
  markContextVisit,
  proximoContextoDeEstudo,
  registerContextScroll,
  registerContextTouch,
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

test("a entrada de conteudo nao recebe a item_key da atividade aberta dentro dela", () => {
  // O contexto carrega UMA `itemKey`, a do bloco aberto. Dentro de uma
  // atividade ela vale `activity:<id>`, e o escopo `content` a recebia junto —
  // dai o gatilho `telemetria_resolver_entidade` lia `activity:1063` e
  // carimbava `atividade_id = 1063` numa linha que AGREGA as atividades do
  // conteudo. Nove linhas assim na base, cada uma com a ultima atividade do
  // lote.
  const batch = buildEmptyBatch(T0);
  const dentroDaAtividade = contexto({
    topicoId: 125,
    conteudoId: 174,
    atividadeId: 1063,
    itemKey: "activity:1063",
    studyState: "active",
  });

  accumulateContextTime(batch, dentroDaAtividade, 5_000, 0);

  assert.equal(batch.timeMetrics.contents["content:174"]?.itemKey, null);
  assert.equal(batch.timeMetrics.contents["content:174"]?.atividadeId, null);
  assert.equal(batch.timeMetrics.activities["activity:1063"]?.itemKey, "activity:1063");
  assert.equal(batch.timeMetrics.activities["activity:1063"]?.conteudoId, 174);
});

test("a entrada de atividade nao recebe a item_key da questao aberta dentro dela", () => {
  const batch = buildEmptyBatch(T0);

  accumulateContextTime(
    batch,
    contexto({
      topicoId: 125,
      atividadeId: 1063,
      questaoId: 1049,
      itemKey: "question:1049",
      studyState: "active",
    }),
    5_000,
    0
  );

  assert.equal(batch.timeMetrics.activities["activity:1063"]?.itemKey, null);
  assert.equal(batch.timeMetrics.questions["question:1049"]?.itemKey, "question:1049");
});

test("tempo e visita por QUESTAO, o escopo que nao existia", () => {
  // Uma atividade de varias questoes era um numero so: o escopo mais fino
  // parava na atividade.
  const batch = buildEmptyBatch(T0);
  const base = { topicoId: 125, atividadeId: 1063, studyState: "active" as const };

  markContextVisit(batch, EMPTY_STUDY_CONTEXT, contexto({ ...base, questaoId: 1049 }));
  accumulateContextTime(batch, contexto({ ...base, questaoId: 1049 }), 30_000, 0);

  markContextVisit(
    batch,
    contexto({ ...base, questaoId: 1049 }),
    contexto({ ...base, questaoId: 1050 })
  );
  accumulateContextTime(batch, contexto({ ...base, questaoId: 1050 }), 12_000, 0);

  assert.equal(batch.timeMetrics.questions["question:1049"]?.activeMs, 30_000);
  assert.equal(batch.timeMetrics.questions["question:1050"]?.activeMs, 12_000);
  assert.equal(batch.timeMetrics.questions["question:1049"]?.visits, 1);
  assert.equal(batch.timeMetrics.questions["question:1050"]?.visits, 1);

  // A atividade continua somando as duas: o aninhamento e inclusivo.
  assert.equal(batch.timeMetrics.activities["activity:1063"]?.activeMs, 42_000);

  const linhas = serializeTimeMetricEntries(batch.timeMetrics.questions);
  assert.equal(linhas[0].questao_id, 1049);
  assert.equal(linhas[0].atividade_id, 1063);
});

test("sair da questao nao derruba o tempo da atividade", () => {
  const batch = buildEmptyBatch(T0);
  const naQuestao = contexto({
    topicoId: 125,
    atividadeId: 1063,
    questaoId: 1049,
    studyState: "active",
  });
  const foraDaQuestao = contexto({ topicoId: 125, atividadeId: 1063, studyState: "active" });

  accumulateContextTime(batch, naQuestao, 10_000, 0);
  accumulateContextTime(batch, foraDaQuestao, 7_000, 0);

  assert.equal(batch.timeMetrics.questions["question:1049"]?.activeMs, 10_000);
  assert.equal(batch.timeMetrics.activities["activity:1063"]?.activeMs, 17_000);
});

test("o relogio do ocio atravessa o flush, em vez de fabricar uma interacao", () => {
  // `buildEmptyBatch` zerava `lastInteractionAtMs` para o instante do flush, e
  // o limiar de ocio conta a partir dele: cada lote comecava com um credito de
  // tempo ativo que o aluno nao produziu. E `active_sec` e o que vira
  // `tempo_gasto_min` — `trailup_tempo_telemetria_min` nao soma mais nada.
  const ultimaInteracao = T0 - 90_000;
  const proximo = buildEmptyBatch(T0, ultimaInteracao);

  assert.equal(proximo.lastInteractionAtMs, ultimaInteracao);
  assert.equal(proximo.batchStartedAtMs, T0);

  // Sem o argumento o comportamento antigo se mantem, para quem abre a sessao.
  assert.equal(buildEmptyBatch(T0).lastInteractionAtMs, T0);

  // E nunca no futuro: um relogio adiantado daria tempo ativo infinito.
  assert.equal(buildEmptyBatch(T0, T0 + 60_000).lastInteractionAtMs, T0);
});

test("toque e scroll usam as MESMAS sementes que tempo e visita", () => {
  // As quatro contas percorriam os cinco escopos em copias separadas do mesmo
  // `if`, e as copias divergiram — as de toque e scroll nem sabiam da questao.
  const batch = buildEmptyBatch(T0);
  const ctx = contexto({
    topicoId: 125,
    conteudoId: 174,
    atividadeId: 1063,
    questaoId: 1049,
    itemKey: "question:1049",
    materialKey: "material:content:174:markdown:x",
    studyState: "active",
  });

  registerContextTouch(batch, ctx);
  registerContextScroll(batch, ctx, 40, 120);

  for (const colecao of [
    batch.timeMetrics.topics,
    batch.timeMetrics.contents,
    batch.timeMetrics.activities,
    batch.timeMetrics.questions,
    batch.timeMetrics.materials,
  ]) {
    const entrada = Object.values(colecao)[0];
    assert.equal(entrada?.touchCount, 1);
    assert.equal(entrada?.scrollDistancePx, 40);
    assert.equal(entrada?.maxDepthPx, 120);
  }

  assert.equal(batch.timeMetrics.contents["content:174"]?.itemKey, null);
  assert.equal(batch.timeMetrics.questions["question:1049"]?.itemKey, "question:1049");
});

test("toque e scroll seguem vetados fora de um item", () => {
  const batch = buildEmptyBatch(T0);
  const ocioso = contexto({ topicoId: 125, studyState: "idle" });

  registerContextTouch(batch, ocioso);
  registerContextScroll(batch, ocioso, 40, 120);

  assert.deepEqual(batch.timeMetrics.topics, {});
});

test("campo omitido preserva o anterior; idle zera tudo abaixo do topico", () => {
  const atual = contexto({
    topicoId: 125,
    conteudoId: 174,
    atividadeId: 1063,
    questaoId: 1049,
    itemKey: "question:1049",
    materialKey: "material:x",
    studyState: "active",
  });

  // Reenviar so o material nao pode apagar o resto: o efeito que abre o bloco
  // reroda no retorno do foco e nem sempre conhece tudo.
  const soMaterial = proximoContextoDeEstudo(atual, { materialKey: "material:y" });
  assert.equal(soMaterial.conteudoId, 174);
  assert.equal(soMaterial.atividadeId, 1063);
  assert.equal(soMaterial.questaoId, 1049);
  assert.equal(soMaterial.materialKey, "material:y");

  const ocioso = proximoContextoDeEstudo(atual, { topicoId: 125, studyState: "idle" });
  assert.equal(ocioso.topicoId, 125);
  assert.equal(ocioso.conteudoId, null);
  assert.equal(ocioso.atividadeId, null);
  assert.equal(ocioso.questaoId, null);
  assert.equal(ocioso.materialKey, null);
});

test("a questao morre com a atividade dela", () => {
  // Trocar de atividade sem mandar `questaoId` deixava a questao da atividade
  // ANTERIOR viva — e o tempo dela ia parar num bloco onde ela nem existe.
  const naQuestao = contexto({
    topicoId: 125,
    atividadeId: 1063,
    questaoId: 1049,
    studyState: "active",
  });

  const outraAtividade = proximoContextoDeEstudo(naQuestao, {
    topicoId: 125,
    atividadeId: 1070,
    studyState: "active",
  });
  assert.equal(outraAtividade.atividadeId, 1070);
  assert.equal(outraAtividade.questaoId, null);

  // A MESMA atividade preserva: e o caso do efeito rerodando no refoco, e
  // zerar ali apagaria a questao sem que nada a reinstalasse.
  const mesmaAtividade = proximoContextoDeEstudo(naQuestao, {
    topicoId: 125,
    atividadeId: 1063,
    studyState: "active",
  });
  assert.equal(mesmaAtividade.questaoId, 1049);

  // E quem sabe da questao continua mandando explicitamente.
  assert.equal(
    proximoContextoDeEstudo(naQuestao, { questaoId: 1050 }).questaoId,
    1050
  );
  assert.equal(proximoContextoDeEstudo(naQuestao, { questaoId: null }).questaoId, null);
});

test("questaoId sozinha ja marca o contexto como ativo", () => {
  const vm = proximoContextoDeEstudo(contexto({ topicoId: 125 }), { questaoId: 1049 });
  assert.equal(vm.studyState, "active");
});
