import assert from "node:assert/strict";
import test from "node:test";

import { consumePendingRoute, setPendingRoute } from "./pendingRoute";

test("guarda e devolve a rota pendente uma unica vez", () => {
  setPendingRoute("/trilha/12");
  assert.equal(consumePendingRoute(), "/trilha/12");
  assert.equal(consumePendingRoute(), null);
});

test("sem rota pendente devolve null", () => {
  assert.equal(consumePendingRoute(), null);
});

test("a raiz protegida volta para tabs, não para a entrada pública", () => {
  setPendingRoute("/");
  assert.equal(consumePendingRoute(), "/(tabs)");
  assert.equal(consumePendingRoute(), null);
});

test("limpar com null apaga rota pendente anterior", () => {
  setPendingRoute("/perfil");
  setPendingRoute(null);
  assert.equal(consumePendingRoute(), null);
});
