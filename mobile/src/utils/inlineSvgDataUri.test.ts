import assert from "node:assert/strict";
import test from "node:test";

import { decodeInlineSvgDataUri } from "./inlineSvgDataUri";

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 760 380"><rect width="10"/></svg>';
const URI = `data:image/svg+xml,${encodeURIComponent(SVG).replace(/\(/g, "%28").replace(/\)/g, "%29")}`;

test("recupera o XML do SVG embutido em data URI percent-encoded", () => {
  const inline = decodeInlineSvgDataUri(URI);

  assert.ok(inline);
  assert.equal(inline!.xml, SVG);
});

test("tira a proporcao do viewBox (pra reservar a altura certa no container)", () => {
  assert.equal(decodeInlineSvgDataUri(URI)!.aspectRatio, 2);
});

test("aceita as variantes de prefixo com charset", () => {
  for (const prefixo of ["data:image/svg+xml;utf8,", "data:image/svg+xml;charset=utf-8,"]) {
    const inline = decodeInlineSvgDataUri(prefixo + encodeURIComponent(SVG));
    assert.ok(inline, prefixo);
    assert.equal(inline!.xml, SVG);
  }
});

test("sem viewBox cai numa proporcao padrao em vez de dividir por zero", () => {
  const semViewBox = '<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>';
  const inline = decodeInlineSvgDataUri(`data:image/svg+xml,${encodeURIComponent(semViewBox)}`);

  assert.ok(inline);
  assert.ok(inline!.aspectRatio > 0);
});

test("viewBox com altura zero nao gera proporcao invalida", () => {
  const zerado = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 760 0"></svg>';
  const inline = decodeInlineSvgDataUri(`data:image/svg+xml,${encodeURIComponent(zerado)}`);

  assert.ok(Number.isFinite(inline!.aspectRatio));
  assert.ok(inline!.aspectRatio > 0);
});

test("imagem normal (png/jpeg, url http) nao e tratada como SVG embutido", () => {
  assert.equal(decodeInlineSvgDataUri("https://x.test/foto.png"), null);
  assert.equal(decodeInlineSvgDataUri("data:image/png;base64,QUJD"), null);
});

test("SVG em base64 devolve null (o RN nao tem decoder de base64)", () => {
  assert.equal(decodeInlineSvgDataUri("data:image/svg+xml;base64,PHN2Zz48L3N2Zz4="), null);
});

test("conteudo que nao comeca com <svg nao passa por SVG", () => {
  assert.equal(decodeInlineSvgDataUri(`data:image/svg+xml,${encodeURIComponent("<html></html>")}`), null);
});

test("entrada vazia ou ausente devolve null", () => {
  assert.equal(decodeInlineSvgDataUri(null), null);
  assert.equal(decodeInlineSvgDataUri(undefined), null);
  assert.equal(decodeInlineSvgDataUri(""), null);
});
