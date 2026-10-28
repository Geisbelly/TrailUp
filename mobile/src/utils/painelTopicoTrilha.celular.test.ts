import assert from "node:assert/strict";
import test from "node:test";

import { aoTocarNoCelular } from "./painelTopicoTrilha";

test("primeiro toque seleciona; o segundo, no mesmo nó, abre", () => {
  const no = { id: "7", locked: false };
  assert.equal(aoTocarNoCelular(no, null), "selecionar");
  assert.equal(aoTocarNoCelular(no, "3"), "selecionar");
  assert.equal(aoTocarNoCelular(no, "7"), "abrir");
});

test("nó bloqueado nunca abre, mesmo selecionado", () => {
  const no = { id: "9", locked: true };
  assert.equal(aoTocarNoCelular(no, null), "explicar-bloqueio");
  assert.equal(aoTocarNoCelular(no, "9"), "explicar-bloqueio");
});

test("nó inexistente não abre nada", () => {
  assert.equal(aoTocarNoCelular(undefined, "1"), "selecionar");
});
