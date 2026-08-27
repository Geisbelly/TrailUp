import assert from "node:assert/strict";
import test from "node:test";

import {
  buildFirstAccessTourSteps,
  buildFirstAccessTourStorageKey,
} from "@/utils/firstAccessTour";

test("o tutorial percorre todas as áreas principais e páginas internas previstas", () => {
  const steps = buildFirstAccessTourSteps("mastermind");
  const routes = new Set(steps.map((step) => step.route));

  assert.ok(routes.has("/(tabs)"));
  assert.ok(routes.has("/(tabs)/notificacoes"));
  assert.ok(routes.has("/(tabs)/ranking"));
  assert.ok(routes.has("/(tabs)/perfil"));
  assert.ok(routes.has("/(tabs)/perfil/biblioteca-conquistas"));
  assert.ok(routes.has("/(tabs)/perfil/settings"));
});

test("o roteiro e o painel de métricas mudam com o perfil", () => {
  const seeker = buildFirstAccessTourSteps("seeker");
  const conqueror = buildFirstAccessTourSteps("conqueror");
  const seekerMetrics = seeker.find((step) => step.id === "profile-metrics");
  const conquerorMetrics = conqueror.find((step) => step.id === "profile-metrics");

  assert.match(seeker[0].title, /Explorador/);
  assert.match(conqueror[0].title, /Conquistador/);
  assert.match(seekerMetrics?.title ?? "", /Mistério/);
  assert.match(conquerorMetrics?.title ?? "", /Arena Tática/);
  assert.notEqual(seekerMetrics?.description, conquerorMetrics?.description);
});

test("a conclusão do primeiro acesso é isolada por usuário e versionada", () => {
  const first = buildFirstAccessTourStorageKey("aluno-a");
  const second = buildFirstAccessTourStorageKey("aluno-b");

  assert.notEqual(first, second);
  assert.match(first, /tutorial-inicial-v\d+/);
  assert.ok(first.endsWith("/aluno-a"));
});

