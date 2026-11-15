import assert from "node:assert/strict";
import test from "node:test";

import { criarRelogioDaTrilha } from "./tempoNaTrilha";

test("fora da trilha nada conta", () => {
  const relogio = criarRelogioDaTrilha();
  assert.equal(relogio.colher(60_000), 0);
  assert.equal(relogio.naTrilha(), false);
});

test("conta só o trecho dentro da trilha, entre duas batidas", () => {
  const relogio = criarRelogioDaTrilha();
  relogio.definirNaTrilha(true, 10_000);
  relogio.definirNaTrilha(false, 40_000);
  assert.equal(relogio.colher(60_000), 30_000);
  // A colheita zera: a batida seguinte não reenvia o mesmo trecho.
  assert.equal(relogio.colher(120_000), 0);
});

test("continuar na trilha atravessa a batida sem perder nem repetir tempo", () => {
  const relogio = criarRelogioDaTrilha();
  relogio.definirNaTrilha(true, 0);
  assert.equal(relogio.colher(60_000), 60_000);
  assert.equal(relogio.colher(120_000), 60_000);
  assert.equal(relogio.naTrilha(), true);
});

test("reentrar na trilha não reinicia o trecho que já corre", () => {
  const relogio = criarRelogioDaTrilha();
  relogio.definirNaTrilha(true, 0);
  // Trocar de módulo dentro da trilha manda `true` de novo.
  relogio.definirNaTrilha(true, 20_000);
  assert.equal(relogio.colher(60_000), 60_000);
});

test("tempo em segundo plano não vira tempo de trilha", () => {
  const relogio = criarRelogioDaTrilha();
  relogio.definirNaTrilha(true, 0);
  // Indo para segundo plano o monitor colhe o que houve até ali...
  assert.equal(relogio.colher(30_000), 30_000);
  // ...e ao voltar, 1 h depois, retoma a contagem daquele instante.
  relogio.retomar(3_630_000);
  assert.equal(relogio.colher(3_660_000), 30_000);
});

test("retomar fora da trilha não começa a contar", () => {
  const relogio = criarRelogioDaTrilha();
  relogio.retomar(1_000);
  assert.equal(relogio.colher(61_000), 0);
});
