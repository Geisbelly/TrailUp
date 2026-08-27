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
  assert.ok(routes.has("/(tabs)/perfil/metricas-estilo"));
  assert.ok(routes.has("/(tabs)/perfil/coleta-dados"));
  assert.ok(routes.has("/(tabs)/perfil/relatorio"));
});

test("o tutorial explica controles de privacidade e apresentação dos dados", () => {
  const steps = buildFirstAccessTourSteps("mastermind");
  const camera = steps.find((step) => step.id === "camera-consent");
  const chat = steps.find((step) => step.id === "chat-consent");
  const appearance = steps.find((step) => step.id === "metrics-appearance");
  const report = steps.find((step) => step.id === "data-report");

  assert.match(camera?.description ?? "", /ativar|desativar|permissão/i);
  assert.equal(camera?.target, "config_camera");
  assert.match(chat?.description ?? "", /chat|mentor/i);
  assert.equal(chat?.target, "config_chat");
  assert.match(appearance?.description ?? "", /visualização|apresentação/i);
  assert.equal(appearance?.target, "config_metricas_visual");
  assert.match(report?.description ?? "", /PDF|relatório/i);
  assert.equal(report?.target, "config_relatorio");
});

test("o roteiro e o painel de métricas mudam com o perfil", () => {
  const seeker = buildFirstAccessTourSteps("seeker");
  const conqueror = buildFirstAccessTourSteps("conqueror");
  const seekerMetrics = seeker.find((step) => step.id === "profile-metrics");
  const conquerorMetrics = conqueror.find((step) => step.id === "profile-metrics");

  assert.match(seeker[0].title, /Amara/);
  assert.match(seeker[0].description, /bússola dourada/i);
  assert.match(conqueror[0].title, /Amina/);
  assert.match(conqueror[0].description, /armadura azul e dourada/i);
  assert.match(seekerMetrics?.title ?? "", /Mistério/);
  assert.match(conquerorMetrics?.title ?? "", /Arena Tática/);
  assert.notEqual(seekerMetrics?.description, conquerorMetrics?.description);
  assert.notEqual(seeker[1].description, conqueror[1].description);
});

test("cada guardião se apresenta antes da primeira instrução", () => {
  const expectedGuides = {
    seeker: "Amara",
    survivor: "Kenji",
    daredevil: "Ember",
    mastermind: "Idris",
    conqueror: "Amina",
    socializer: "Mateo e Zuri",
    achiever: "Kwame",
  } as const;

  Object.entries(expectedGuides).forEach(([profile, guideName]) => {
    const steps = buildFirstAccessTourSteps(profile);
    assert.equal(steps[0].id, "welcome");
    assert.match(steps[0].title, new RegExp(guideName));
    assert.match(steps[0].description, /^(Eu sou|Somos)/i);
    assert.ok(steps[0].description.length > 140);
    assert.notEqual(steps[0].description, steps[1].description);
  });
});

test("a conclusão do primeiro acesso é isolada por usuário e versionada", () => {
  const first = buildFirstAccessTourStorageKey("aluno-a");
  const second = buildFirstAccessTourStorageKey("aluno-b");

  assert.notEqual(first, second);
  assert.match(first, /tutorial-inicial-v\d+/);
  assert.ok(first.endsWith("/aluno-a"));
});
