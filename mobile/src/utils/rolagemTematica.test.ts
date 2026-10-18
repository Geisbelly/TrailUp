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
