import assert from "node:assert/strict";
import { test } from "node:test";

import { parseDeckProgressMessage } from "./deckProgressMessage";

test("parseia uma mensagem valida de progresso", () => {
  const raw = JSON.stringify({
    type: "trailup:progress",
    itemKey: "slide:2:quiz",
    pontuacaoObtida: 150,
    pontuacaoMaxima: 150,
  });

  assert.deepEqual(parseDeckProgressMessage(raw), {
    itemKey: "slide:2:quiz",
    pontuacaoObtida: 150,
    pontuacaoMaxima: 150,
  });
});

test("retorna null pra JSON invalido", () => {
  assert.equal(parseDeckProgressMessage("isso nao e json"), null);
});

test("retorna null quando type nao e trailup:progress", () => {
  const raw = JSON.stringify({ type: "outra-coisa", itemKey: "x", pontuacaoObtida: 1, pontuacaoMaxima: 1 });
  assert.equal(parseDeckProgressMessage(raw), null);
});

test("retorna null quando itemKey esta ausente ou vazio", () => {
  assert.equal(parseDeckProgressMessage(JSON.stringify({ type: "trailup:progress", pontuacaoObtida: 1, pontuacaoMaxima: 1 })), null);
  assert.equal(parseDeckProgressMessage(JSON.stringify({ type: "trailup:progress", itemKey: "", pontuacaoObtida: 1, pontuacaoMaxima: 1 })), null);
});

test("retorna null quando pontuacaoObtida/pontuacaoMaxima nao sao numeros finitos", () => {
  assert.equal(parseDeckProgressMessage(JSON.stringify({ type: "trailup:progress", itemKey: "x", pontuacaoObtida: "150", pontuacaoMaxima: 150 })), null);
  assert.equal(parseDeckProgressMessage(JSON.stringify({ type: "trailup:progress", itemKey: "x", pontuacaoObtida: NaN, pontuacaoMaxima: 150 })), null);
});
