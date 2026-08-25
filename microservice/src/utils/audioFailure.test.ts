import assert from "node:assert/strict";
import test from "node:test";

import { describeError, summarizeAudioFailures } from "./audioFailure";

test("describeError usa a mensagem do Error", () => {
  assert.equal(describeError(new Error("429 RESOURCE_EXHAUSTED: quota")), "429 RESOURCE_EXHAUSTED: quota");
});

test("describeError aceita string e objeto com message", () => {
  assert.equal(describeError("modelo indisponivel"), "modelo indisponivel");
  assert.equal(describeError({ message: "NOT_FOUND: model" }), "NOT_FOUND: model");
});

test("describeError nao quebra com valor sem mensagem", () => {
  assert.equal(describeError(null), "erro desconhecido");
  assert.equal(describeError(undefined), "erro desconhecido");
  assert.equal(describeError(new Error("   ")), "erro desconhecido");
  assert.match(describeError({ codigo: 500 }), /codigo/);
});

test("uma parte so: mostra o motivo direto, sem numeracao", () => {
  const texto = summarizeAudioFailures([{ ordem: 1, motivo: "429 quota excedida" }], 1);

  assert.equal(texto, "Áudio falhou — 429 quota excedida");
});

test("todas as partes falharam: nao vira '3/3', so 'falhou'", () => {
  const texto = summarizeAudioFailures(
    [
      { ordem: 1, motivo: "429 quota" },
      { ordem: 2, motivo: "429 quota" },
    ],
    2,
  );

  assert.match(texto, /^Áudio falhou — /);
  assert.match(texto, /parte 1: 429 quota/);
  assert.match(texto, /parte 2: 429 quota/);
});

test("falha parcial diz quantas partes de quantas", () => {
  const texto = summarizeAudioFailures([{ ordem: 2, motivo: "timeout" }], 3);

  assert.match(texto, /^Áudio falhou em 1\/3 — parte 2: timeout/);
});

test("ordena por parte, mesmo recebendo fora de ordem", () => {
  const texto = summarizeAudioFailures(
    [
      { ordem: 3, motivo: "c" },
      { ordem: 1, motivo: "a" },
    ],
    3,
  );

  assert.ok(texto.indexOf("parte 1") < texto.indexOf("parte 3"));
});

test("sem falha registrada ainda explica que nao houve audio", () => {
  assert.equal(summarizeAudioFailures([], 1), "O áudio não foi gerado.");
  assert.match(summarizeAudioFailures([], 4), /todas as partes/);
});

test("mensagem gigante e truncada (o campo vai pro banco e pro card)", () => {
  const texto = summarizeAudioFailures([{ ordem: 1, motivo: "x".repeat(900) }], 1);

  assert.ok(texto.length <= 400, `tamanho ${texto.length}`);
});
