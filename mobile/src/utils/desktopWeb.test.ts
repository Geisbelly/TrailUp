import assert from "node:assert/strict";
import test from "node:test";

import { ehDesktopWeb, LARGURA_MINIMA_DESKTOP } from "./desktopWeb";

test("web larga usa o layout de computador", () => {
  assert.equal(ehDesktopWeb("web", LARGURA_MINIMA_DESKTOP), true);
  assert.equal(ehDesktopWeb("web", 1440), true);
});

test("web estreita continua com a barra de abas", () => {
  assert.equal(ehDesktopWeb("web", LARGURA_MINIMA_DESKTOP - 1), false);
  assert.equal(ehDesktopWeb("web", 390), false);
});

test("iOS e Android nunca mudam, mesmo em tela larga (tablet)", () => {
  assert.equal(ehDesktopWeb("ios", 1366), false);
  assert.equal(ehDesktopWeb("android", 1280), false);
});
