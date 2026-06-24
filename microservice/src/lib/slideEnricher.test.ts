import { test } from "node:test";
import assert from "node:assert/strict";
import { enrichSlidesWithImages } from "./slideEnricher";

test("título: prefere 'title' sobre 'titulo'", () => {
  const out = enrichSlidesWithImages([{ title: "A", titulo: "B" }], []);
  assert.equal(out[0].titulo, "A");
});

test("título: usa 'titulo' quando 'title' ausente", () => {
  const out = enrichSlidesWithImages([{ titulo: "B" }], []);
  assert.equal(out[0].titulo, "B");
});

test("título: default \"\" quando ambos ausentes", () => {
  const out = enrichSlidesWithImages([{}], []);
  assert.equal(out[0].titulo, "");
});

test("imagem: adiciona data URL quando imagem presente no índice", () => {
  const out = enrichSlidesWithImages([{ title: "A" }], ["base64data"]);
  assert.equal(out[0].imagem_referencia, "data:image/png;base64,base64data");
});

test("imagem: string vazia no índice = sem imagem_referencia", () => {
  const out = enrichSlidesWithImages([{ title: "A" }], [""]);
  assert.ok(!("imagem_referencia" in out[0]));
});

test("imagem: índice fora do array images = sem imagem_referencia", () => {
  const out = enrichSlidesWithImages([{ title: "A" }, { title: "B" }], ["one"]);
  assert.equal(out[0].imagem_referencia, "data:image/png;base64,one");
  assert.ok(!("imagem_referencia" in out[1]));
});

test("preserva outras propriedades do slide", () => {
  const slide = { title: "A", topics: ["t1"], explanation: "exp", characterAction: "explaining" };
  const out = enrichSlidesWithImages([slide], []);
  assert.equal(out[0].topics?.[0],         "t1");
  assert.equal(out[0].explanation,         "exp");
  assert.equal(out[0].characterAction,     "explaining");
});

test("array vazio de slides retorna array vazio", () => {
  assert.deepEqual(enrichSlidesWithImages([], ["x"]), []);
});

test("muitos slides, poucas imagens: primeiros recebem, resto fica sem", () => {
  const slides = [{ title: "1" }, { title: "2" }, { title: "3" }];
  const out = enrichSlidesWithImages(slides, ["a", "b"]);
  assert.equal(out[0].imagem_referencia, "data:image/png;base64,a");
  assert.equal(out[1].imagem_referencia, "data:image/png;base64,b");
  assert.ok(!("imagem_referencia" in out[2]));
});

test("imagens extras (mais imagens que slides) são ignoradas", () => {
  const out = enrichSlidesWithImages([{ title: "1" }], ["a", "b", "c"]);
  assert.equal(out.length, 1);
  assert.equal(out[0].imagem_referencia, "data:image/png;base64,a");
});
