import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { estaNaAreaLogada } from "./areaLogada";

describe("estaNaAreaLogada", () => {
  it("as abas e a tela da missão-desafio (pilha raiz) são da área logada", () => {
    assert.equal(estaNaAreaLogada("(tabs)"), true);
    assert.equal(estaNaAreaLogada("desafio"), true);
  });

  it("login e rota desconhecida não são", () => {
    assert.equal(estaNaAreaLogada("(auth)"), false);
    assert.equal(estaNaAreaLogada(undefined), false);
    assert.equal(estaNaAreaLogada("modal"), false);
  });
});
