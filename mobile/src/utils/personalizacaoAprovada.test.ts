import assert from "node:assert/strict";
import test from "node:test";

import { respostaCompleta, semTopicosSemMaterial } from "./personalizacaoAprovada";

test("tópico consultado sem material aprovado sai da tela", () => {
  const atual = { 10: "a", 11: "b", 12: "c" };
  assert.deepEqual(semTopicosSemMaterial(atual, [10, 11, 12], new Set([10])), { 10: "a" });
  // O original não é mutado.
  assert.deepEqual(atual, { 10: "a", 11: "b", 12: "c" });
});

test("tópico que não foi consultado fica como estava", () => {
  assert.deepEqual(semTopicosSemMaterial({ 10: "a", 99: "z" }, [10], new Set()), { 99: "z" });
});

test("sem nada para tirar, devolve o mesmo objeto (sem re-render)", () => {
  const atual = { 10: "a" };
  assert.equal(semTopicosSemMaterial(atual, [10, 11], new Set([10])), atual);
  assert.equal(semTopicosSemMaterial(atual, [], new Set()), atual);
});

test("só a lista que veio abaixo do limite é completa", () => {
  assert.equal(respostaCompleta(3, 20), true);
  assert.equal(respostaCompleta(0, 20), true);
  assert.equal(respostaCompleta(20, 20), false);
});
