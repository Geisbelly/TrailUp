import assert from "node:assert/strict";
import test from "node:test";

import { pertoDoFim } from "./chatRolagemModel";

test("no fim da conversa, ou quase, continua colado nas mensagens novas", () => {
  assert.equal(pertoDoFim({ topo: 1500, alturaDoConteudo: 2000, alturaDaJanela: 500 }), true);
  assert.equal(pertoDoFim({ topo: 1420, alturaDoConteudo: 2000, alturaDaJanela: 500 }), true);
});

test("quem subiu para reler não é puxado de volta", () => {
  assert.equal(pertoDoFim({ topo: 1419, alturaDoConteudo: 2000, alturaDaJanela: 500 }), false);
  assert.equal(pertoDoFim({ topo: 0, alturaDoConteudo: 2000, alturaDaJanela: 500 }), false);
});

test("conversa mais curta que a janela conta como no fim", () => {
  assert.equal(pertoDoFim({ topo: 0, alturaDoConteudo: 200, alturaDaJanela: 500 }), true);
});
