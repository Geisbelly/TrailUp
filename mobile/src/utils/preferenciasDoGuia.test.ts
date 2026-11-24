import assert from "node:assert/strict";
import test from "node:test";

import {
  descreverPostura,
  PREFERENCIAS_VAZIAS,
  rotulosDosGostos,
  temAlgoGuardado,
} from "./preferenciasDoGuia";

test("gosto fora do catálogo não aparece", () => {
  assert.deepEqual(rotulosDosGostos(["games", "xadrez", "musica"]), ["Games", "Música"]);
  assert.deepEqual(rotulosDosGostos(null), []);
});

test("postura fora da lista não vira texto", () => {
  assert.equal(descreverPostura("acolher"), "Vai com calma, um passo de cada vez");
  assert.equal(descreverPostura("bravo"), null);
  assert.equal(descreverPostura(null), null);
});

test("só conta como guardado o que a tela mostra", () => {
  assert.equal(temAlgoGuardado(PREFERENCIAS_VAZIAS), false);
  assert.equal(temAlgoGuardado({ ...PREFERENCIAS_VAZIAS, gostos: ["xadrez"], resumo: "  " }), false);
  assert.equal(temAlgoGuardado({ ...PREFERENCIAS_VAZIAS, postura: "instigar" }), true);
  assert.equal(temAlgoGuardado({ ...PREFERENCIAS_VAZIAS, resumo: "Aprende melhor com exemplos." }), true);
});
