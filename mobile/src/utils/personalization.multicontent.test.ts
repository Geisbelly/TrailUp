import assert from "node:assert/strict";
import test from "node:test";

/* eslint-disable @typescript-eslint/no-require-imports */
const supabaseModulePath = require.resolve("@/database/supabase");
(require.cache as Record<string, unknown>)[supabaseModulePath] = {
  exports: { supabase: {} },
};

const {
  aggregatePersonalizedTopicPayloads,
  buildPersonalizationContentScopeKey,
  groupPersonalizedItemsByContent,
  normalizePersonalizedTopicPayload,
  orderPersonalizationRecordsByTeacherContent,
} = require("@/utils/personalization") as typeof import("@/utils/personalization");

test("ordena e preserva um registro por conteudo na ordem docente", () => {
  const records = [
    {
      id: 20,
      conteudo_id: 126,
      updated_at: "2026-07-28T10:00:00Z",
    },
    {
      id: 10,
      conteudo_id: 125,
      updated_at: "2026-07-28T09:00:00Z",
    },
    {
      id: 11,
      conteudo_id: 125,
      updated_at: "2026-07-28T11:00:00Z",
    },
    {
      id: 9,
      conteudo_id: null,
      updated_at: "2026-07-28T12:00:00Z",
    },
  ];

  const ordered = orderPersonalizationRecordsByTeacherContent(records, [
    { id: 126, ordem: 2 },
    { id: 125, ordem: 1 },
  ]);

  assert.deepEqual(
    ordered.map((record) => record.id),
    [11, 20]
  );
});

test("agrega etapas com chaves e metadados distintos por conteudo", () => {
  const buildPayload = (recordId: number, conteudoId: number, title: string) =>
    normalizePersonalizedTopicPayload({
      record: {
        id: recordId,
        conteudo_id: conteudoId,
        ciclo_id: `cycle-${recordId}`,
        steps: [
          {
            item_key: "introducao",
            ordem: 0,
            kind: "content",
            title,
            blocks: [
              {
                id: `block-${recordId}`,
                tipo: "texto",
                payload: { texto: title },
              },
            ],
          },
        ],
        plano: {},
        materiais: {},
      },
      classeId: 32,
      topicoId: 121,
      fallbackBlocks: [],
      fallbackActivities: [],
      source: "remote",
    });

  const merged = aggregatePersonalizedTopicPayloads([
    buildPayload(11, 125, "Parte 1"),
    buildPayload(20, 126, "Parte 2"),
  ]);

  assert.ok(merged);
  assert.equal(merged.steps.length, 2);
  assert.equal(merged.primaryBlocks.length, 2);
  assert.match(
    merged.steps[0].item_key,
    /^content:125:personalization:11:/
  );
  assert.match(
    merged.steps[1].item_key,
    /^content:126:personalization:20:/
  );
  assert.equal(merged.steps[0].metadata?.conteudo_id, 125);
  assert.equal(merged.steps[1].metadata?.conteudo_id, 126);
  assert.equal(merged.steps[0].metadata?.personalizacao_id, 11);
  assert.equal(merged.steps[1].metadata?.personalizacao_id, 20);
});

test("agrupa cards pela combinacao de topico e conteudo", () => {
  const grouped = groupPersonalizedItemsByContent([
    { id: 1, topico_id: 121, conteudo_id: 125 },
    { id: 2, topico_id: 121, conteudo_id: 126 },
    { id: 3, topico_id: 121, conteudo_id: 125 },
  ]);

  assert.deepEqual(
    grouped
      .get(buildPersonalizationContentScopeKey(121, 125))
      ?.map((card) => card.id),
    [1, 3]
  );
  assert.deepEqual(
    grouped
      .get(buildPersonalizationContentScopeKey(121, 126))
      ?.map((card) => card.id),
    [2]
  );
});
