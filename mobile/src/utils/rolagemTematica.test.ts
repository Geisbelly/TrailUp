import { readFileSync } from "node:fs";
import { join } from "node:path";
import assert from "node:assert/strict";
import test from "node:test";

import { cssRolagemTematica } from "./rolagemTematica";

test("usa a cor do perfil no Firefox e no Chrome", () => {
  const css = cssRolagemTematica("#28428a");
  assert.match(css, /scrollbar-color: #28428a transparent/);
  assert.match(css, /::-webkit-scrollbar-thumb \{ background: #28428a;/);
  assert.match(css, /scrollbar-width: thin/);
});

test("a cor não consegue fechar a regra nem abrir tag", () => {
  const css = cssRolagemTematica("red; } body { display:none } <x>");
  assert.doesNotMatch(css, /display:none \}/);
  assert.doesNotMatch(css, /[<>]/);
});

test("o padrão só vale sem pseudo-elementos: no Chrome 121+ ele desligaria o resto", () => {
  const css = cssRolagemTematica("#28428a");
  assert.match(css, /^@supports not selector\(::-webkit-scrollbar\) \{ \* \{ scrollbar-width: thin;/m);
  assert.doesNotMatch(css, /^\* \{ scrollbar-width/m);
  assert.match(css, /::-webkit-scrollbar-button \{ display: none; \}/);
});

test("a barra do perfil vale fora das abas: portões e login abrem na raiz", () => {
  const raiz = readFileSync(join(__dirname, "../app/_layout.tsx"), "utf-8");
  const abas = readFileSync(join(__dirname, "../app/(tabs)/_layout.tsx"), "utf-8");
  assert.match(raiz, /<RolagemDoPerfil \/>/);
  // A folha de estilo é uma só: a limpeza de um segundo uso a tiraria do primeiro.
  assert.doesNotMatch(abas, /useRolagemTematica/);
});
