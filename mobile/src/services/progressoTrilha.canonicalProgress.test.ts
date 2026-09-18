import assert from "node:assert/strict";
import test from "node:test";

/* eslint-disable @typescript-eslint/no-require-imports */
const upsertCalls: { table: string; payload: Record<string, unknown> }[] = [];
const supabaseModulePath = require.resolve("@/database/supabase");

(require.cache as Record<string, unknown>)[supabaseModulePath] = {
  exports: {
    supabase: {
      from(table: string) {
        return {
          upsert(payload: Record<string, unknown>) {
            upsertCalls.push({ table, payload });
            return Promise.resolve({ error: null });
          },
        };
      },
    },
  },
};

const { registrarTopicoProgresso } = require("./progressoTrilha") as typeof import("./progressoTrilha");

test("registrarTopicoProgresso mantém apenas metadados de visita", async () => {
  upsertCalls.length = 0;

  await registrarTopicoProgresso({
    alunoId: "aluno-1",
    topicoId: 42,
    percentual: 100,
    ultimaAtividadeId: 9,
  });

  assert.equal(upsertCalls.length, 1);
  assert.equal(upsertCalls[0].table, "topico_aluno");
  assert.equal("status" in upsertCalls[0].payload, false);
  assert.equal("percentual_concluido" in upsertCalls[0].payload, false);
  assert.equal(upsertCalls[0].payload.ultima_atividade, 9);
});
