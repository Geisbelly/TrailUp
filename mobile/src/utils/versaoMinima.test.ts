import assert from "node:assert/strict";
import test from "node:test";

import {
  compararVersoes,
  lerConfigDeVersao,
  partesDaVersao,
  precisaAtualizar,
  urlDeAtualizacaoSegura,
} from "./versaoMinima";

test("le versoes em formatos comuns e recusa o que nao e' versao", () => {
  assert.deepEqual(partesDaVersao("1.0.4"), [1, 0, 4]);
  assert.deepEqual(partesDaVersao(" v2.1 "), [2, 1]);
  assert.deepEqual(partesDaVersao("1.2.3-beta.1"), [1, 2, 3]);
  assert.deepEqual(partesDaVersao("1.2.3+45"), [1, 2, 3]);
  for (const ruim of ["", "   ", null, undefined, "abc", "1..2", "1.x", "latest"]) {
    assert.equal(partesDaVersao(ruim), null, String(ruim));
  }
});

test("compara numericamente, nao como texto", () => {
  assert.ok(compararVersoes([1, 10, 0], [1, 9, 9]) > 0);
  assert.equal(compararVersoes([1, 2], [1, 2, 0]), 0);
  assert.ok(compararVersoes([1, 0, 4], [1, 0, 5]) < 0);
});

test("pede atualizacao so' quando a atual e' menor que a minima", () => {
  const nativo = { plataforma: "android" };
  assert.equal(precisaAtualizar({ ...nativo, versaoAtual: "1.0.4", versaoMinima: "1.0.5" }), true);
  assert.equal(precisaAtualizar({ ...nativo, versaoAtual: "1.0.5", versaoMinima: "1.0.5" }), false);
  assert.equal(precisaAtualizar({ ...nativo, versaoAtual: "1.1.0", versaoMinima: "1.0.5" }), false);
  assert.equal(precisaAtualizar({ plataforma: "ios", versaoAtual: "0.9", versaoMinima: "1.0" }), true);
});

test("desligado de fabrica: minima vazia, nula ou malformada nao bloqueia", () => {
  for (const versaoMinima of ["", null, undefined, "desligado", " "]) {
    assert.equal(precisaAtualizar({ plataforma: "android", versaoAtual: "1.0.4", versaoMinima }), false);
  }
});

test("versao atual desconhecida e a web nunca bloqueiam", () => {
  assert.equal(precisaAtualizar({ plataforma: "android", versaoAtual: null, versaoMinima: "9.9.9" }), false);
  assert.equal(precisaAtualizar({ plataforma: "web", versaoAtual: "0.0.1", versaoMinima: "9.9.9" }), false);
});

test("so' URL http(s) vira link de atualizacao", () => {
  assert.equal(
    urlDeAtualizacaoSegura("https://play.google.com/store/apps/details?id=x"),
    "https://play.google.com/store/apps/details?id=x",
  );
  for (const ruim of ["", null, "javascript:alert(1)", "intent://x", "nao e url"]) {
    assert.equal(urlDeAtualizacaoSegura(ruim), null, String(ruim));
  }
});

test("le as duas chaves das linhas do app_config", () => {
  assert.deepEqual(
    lerConfigDeVersao([
      { chave: "app_versao_minima", valor: "1.0.5" },
      { chave: "app_atualizacao_url", valor: "https://loja/x" },
      { chave: "outra", valor: "y" },
    ]),
    { versaoMinima: "1.0.5", urlAtualizacao: "https://loja/x" },
  );
  assert.deepEqual(lerConfigDeVersao(null), { versaoMinima: null, urlAtualizacao: null });
});
