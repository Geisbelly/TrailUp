import assert from "node:assert/strict";
import test from "node:test";

import type { ProfileMetricsViewModel } from "@/components/perfil/profileMetricsViewModel";
import {
  buildProfileGuideSteps,
  getProfileGuideEmphasis,
} from "@/utils/profileSectionGuide";

function vm(
  patch: Partial<ProfileMetricsViewModel> = {},
): ProfileMetricsViewModel {
  return {
    hasSessionMetrics: false,
    danoTotal: null,
    melhorTempoMin: null,
    ...patch,
  } as ProfileMetricsViewModel;
}

test("o guia analítico explica cada grupo de métricas e configurações", () => {
  const ids = buildProfileGuideSteps({
    hasProfileSwitcher: true,
    theme: "analytics",
    vm: vm({ hasSessionMetrics: true }),
  }).map((step) => step.id);

  assert.ok(ids.includes("profile-switcher"));
  assert.ok(ids.includes("analytics-progress"));
  assert.ok(ids.includes("analytics-accuracy"));
  assert.ok(ids.includes("analytics-time"));
  assert.ok(ids.includes("analytics-journey"));
  assert.ok(ids.includes("analytics-affinity"));
  assert.ok(ids.includes("analytics-session"));
  assert.ok(ids.includes("adaptive-reading"));
  assert.ok(ids.includes("settings-main"));
  assert.ok(ids.includes("settings-metrics"));
  assert.ok(ids.includes("settings-data"));
});

test("o guia segue o painel ativo e omite métricas que não estão visíveis", () => {
  const goalsIds = buildProfileGuideSteps({
    hasProfileSwitcher: false,
    theme: "goals",
    vm: vm(),
  }).map((step) => step.id);

  assert.ok(goalsIds.includes("goals-checklist"));
  assert.ok(goalsIds.includes("goals-rings"));
  assert.ok(goalsIds.includes("goals-main"));
  assert.ok(!goalsIds.includes("profile-switcher"));
  assert.ok(!goalsIds.includes("goals-time"));
  assert.ok(!goalsIds.includes("boss"));
  assert.ok(!goalsIds.includes("best-time"));
  assert.ok(!goalsIds.includes("adaptive-reading"));
});

test("cada métrica aponta para o próprio cartão visível", () => {
  const steps = buildProfileGuideSteps({
    hasProfileSwitcher: false,
    theme: "analytics",
    vm: vm({ hasAnyData: true, hasSessionMetrics: true }),
  });
  const metricSteps = steps.filter((step) => step.id.startsWith("analytics-"));

  assert.ok(metricSteps.length > 1);
  assert.equal(new Set(metricSteps.map((step) => step.target)).size, metricSteps.length);
  metricSteps.forEach((step) => {
    assert.equal(step.target, `profile_metric_${step.id}`);
  });
  assert.equal(
    steps.find((step) => step.id === "achievements-tab")?.target,
    "profile_achievements",
  );
});

test("painel sem dados não anuncia cartões que não foram renderizados", () => {
  const ids = buildProfileGuideSteps({
    hasProfileSwitcher: false,
    theme: "analytics",
    vm: vm({ hasAnyData: false }),
  }).map((step) => step.id);

  assert.ok(ids.includes("analytics-progress"));
  assert.ok(!ids.includes("analytics-journey"));
  assert.ok(!ids.includes("adaptive-reading"));
});

test("boss, melhor tempo e sessão entram quando seus cartões existem", () => {
  const ids = buildProfileGuideSteps({
    hasProfileSwitcher: false,
    theme: "arena",
    vm: vm({ hasSessionMetrics: true, danoTotal: 40, melhorTempoMin: 1.5 }),
  }).map((step) => step.id);

  assert.ok(ids.includes("boss"));
  assert.ok(ids.includes("best-time"));
  assert.ok(ids.includes("arena-live"));
});

test("mistério e squad recebem métricas próprias em vez das métricas de outro painel", () => {
  const mysteryIds = buildProfileGuideSteps({
    hasProfileSwitcher: false,
    theme: "mystery",
    vm: vm(),
  }).map((step) => step.id);
  const squadIds = buildProfileGuideSteps({
    hasProfileSwitcher: false,
    theme: "squad",
    vm: vm(),
  }).map((step) => step.id);

  assert.ok(mysteryIds.includes("mystery-revealed"));
  assert.ok(mysteryIds.includes("mystery-map"));
  assert.ok(!mysteryIds.includes("analytics-accuracy"));
  assert.ok(squadIds.includes("squad-presence-hero"));
  assert.ok(squadIds.includes("squad-energy"));
  assert.ok(!squadIds.includes("mystery-map"));
});

test("a orientação textual muda conforme o perfil sem alterar os dados", () => {
  assert.match(getProfileGuideEmphasis("mastermind", "ranking"), /critérios/i);
  assert.match(getProfileGuideEmphasis("socializer", "notifications"), /participação/i);
  assert.match(getProfileGuideEmphasis("achiever", "achievements"), /metas/i);
});
