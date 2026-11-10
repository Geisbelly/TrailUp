import assert from "node:assert/strict";
import test from "node:test";

import casos from "./casos.json";
import { prepararTextoRico } from "./prepararTextoRico";

for (const caso of casos) {
  test(`prepararTextoRico: ${caso.nome}`, () => {
    assert.equal(prepararTextoRico(caso.entrada), caso.saida);
  });
}

test("vazio e não-texto viram texto vazio", () => {
  assert.equal(prepararTextoRico(""), "");
  assert.equal(prepararTextoRico(null), "");
  assert.equal(prepararTextoRico(undefined), "");
});

test("preparar duas vezes não muda o resultado", () => {
  for (const caso of casos) {
    assert.equal(prepararTextoRico(caso.saida), caso.saida, caso.nome);
  }
});
