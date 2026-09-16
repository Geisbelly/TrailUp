import assert from "node:assert/strict";
import test from "node:test";

type UpsertCall = { table: string; payload: Record<string, unknown> };

const upsertCalls: UpsertCall[] = [];

const supabaseStub = {
  from(table: string) {
    return {
      upsert(payload: Record<string, unknown>) {
        upsertCalls.push({ table, payload });
        return Promise.resolve({ error: null });
      },
    };
  },
};

/* eslint-disable @typescript-eslint/no-require-imports */
const supabaseModulePath = require.resolve("@/database/supabase");
(require.cache as Record<string, unknown>)[supabaseModulePath] = {
  exports: { supabase: supabaseStub },
};

const { Topico } = require("./Topico") as typeof import("./Topico");

function novoTopico() {
  return new Topico(
    42,
    7,
    "Tópico",
    null,
    1,
    null,
    null,
    "não iniciado",
    0,
    0,
    null,
    null,
    null,
  );
}

test("marcarIniciado registra apenas a visita, sem autorizar status local", async () => {
  upsertCalls.length = 0;
  const topico = novoTopico();

  await topico.marcarIniciado("aluno-1");

  assert.equal(upsertCalls.length, 1);
  assert.equal(upsertCalls[0].table, "topico_aluno");
  assert.equal("status" in upsertCalls[0].payload, false);
  assert.equal("percentual_concluido" in upsertCalls[0].payload, false);
  assert.equal(topico.status, "não iniciado");
});

test("marcarConcluido não grava status nem percentual autoritativos", async () => {
  upsertCalls.length = 0;
  const topico = novoTopico();

  await topico.marcarConcluido("aluno-1");

  assert.equal(upsertCalls.length, 1);
  assert.equal(upsertCalls[0].table, "topico_aluno");
  assert.equal("status" in upsertCalls[0].payload, false);
  assert.equal("percentual_concluido" in upsertCalls[0].payload, false);
  assert.equal(topico.status, "não iniciado");
  assert.equal(topico.percentual_concluido, 0);
});
