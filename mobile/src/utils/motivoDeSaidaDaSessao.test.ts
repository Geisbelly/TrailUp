import assert from "node:assert/strict";
import test from "node:test";

import {
  motivoDeSaidaDaSessao,
  saidaContaComoInterrupcao,
} from "./motivoDeSaidaDaSessao";

test("sair de um tópico concluído não é interrupção", () => {
  // É o fim natural do trabalho. Antes disto, o único chamador passava sempre
  // `"screen_blur"`, então `session_end` nunca acontecia.
  const motivo = motivoDeSaidaDaSessao(true);
  assert.equal(motivo, "session_end");
  assert.equal(saidaContaComoInterrupcao(motivo), false);
});

test("sair de um tópico em andamento é interrupção", () => {
  const motivo = motivoDeSaidaDaSessao(false);
  assert.equal(motivo, "screen_blur");
  assert.equal(saidaContaComoInterrupcao(motivo), true);
});

test("os dois casos não colapsam no mesmo motivo", () => {
  // O defeito era exatamente esse: os dois caminhos davam `screen_blur`, e a
  // métrica do professor marcava 106 de 106 sessões como interrompidas.
  assert.notEqual(motivoDeSaidaDaSessao(true), motivoDeSaidaDaSessao(false));
});

test("só `session_end` escapa da contagem de interrupção", () => {
  // Espelha o que `endStudySession` faz: qualquer motivo que não seja
  // `session_end` vira o evento `session_interrupt`.
  for (const motivo of ["screen_blur", "interval", "topic_complete"] as const) {
    assert.equal(saidaContaComoInterrupcao(motivo), true, motivo);
  }
  assert.equal(saidaContaComoInterrupcao("session_end"), false);
});
