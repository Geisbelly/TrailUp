import assert from "node:assert/strict";
import test from "node:test";

import { isHtmlDeckUrl } from "./htmlDeck";

test("reconhece o deck HTML do BrainHexPDF", () => {
  assert.equal(isHtmlDeckUrl("https://x.test/apresentacao/material-abc.html"), true);
  assert.equal(isHtmlDeckUrl("https://x.test/deck.htm"), true);
});

test("ignora query e hash antes de olhar a extensao", () => {
  assert.equal(isHtmlDeckUrl("https://x.test/material.html?hideQuiz=1&token=abc"), true);
  assert.equal(isHtmlDeckUrl("https://x.test/material.html#slide-3"), true);
});

test("nao confunde com .pptx enviado pelo professor (esse vai pro leitor nativo)", () => {
  assert.equal(isHtmlDeckUrl("https://x.test/SPD-Aula-04.pptx"), false);
  assert.equal(isHtmlDeckUrl("https://x.test/aula.ppt"), false);
  assert.equal(isHtmlDeckUrl("https://x.test/aula.odp"), false);
});

test("nao confunde com pagina que so tem html no caminho", () => {
  assert.equal(isHtmlDeckUrl("https://x.test/html/aula.pptx"), false);
  assert.equal(isHtmlDeckUrl("https://x.test/htmlzinho"), false);
});

test("entrada ausente nao quebra", () => {
  assert.equal(isHtmlDeckUrl(null), false);
  assert.equal(isHtmlDeckUrl(undefined), false);
  assert.equal(isHtmlDeckUrl(""), false);
});
