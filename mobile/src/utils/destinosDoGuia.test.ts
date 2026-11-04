import assert from "node:assert/strict";
import test from "node:test";

import { destinosParaBotoes } from "./destinosDoGuia";

const ABERTO = { social: true, rank: true };
const FECHADO = { social: false, rank: false };

test("traduz o código em rótulo e rota", () => {
  assert.deepEqual(destinosParaBotoes(["perfil.loja"], ABERTO), [{ rotulo: "Loja", rota: "/(tabs)/perfil/loja" }]);
});

test("código desconhecido e lista ausente não viram botão", () => {
  assert.deepEqual(destinosParaBotoes(["perfil.inventado"], ABERTO), []);
  assert.deepEqual(destinosParaBotoes(undefined, ABERTO), []);
});

test("aba com cadeado não vira botão, porque o push passaria por cima do portão", () => {
  assert.deepEqual(destinosParaBotoes(["social", "ranking", "perfil"], FECHADO), [
    { rotulo: "Perfil", rota: "/(tabs)/perfil" },
  ]);
  assert.equal(destinosParaBotoes(["social", "ranking"], ABERTO).length, 2);
});
