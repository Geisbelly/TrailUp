import { test } from "node:test";
import assert from "node:assert/strict";
import { buildFullSlidePrompt, buildImageStyleSuffix } from "./slideAssetGenerator";
import { buildPresentationDesignPlan } from "../constants/presentationThemes";

const PLAN = buildPresentationDesignPlan("seeker", undefined, "Civilização Maia");

test("buildImageStyleSuffix inclui label, guia e cor-assinatura do perfil", () => {
  const suffix = buildImageStyleSuffix("seeker", PLAN);
  assert.ok(suffix.includes("Explorador"));
  assert.ok(suffix.includes("Amara"));
  assert.ok(suffix.includes("#17a398"));
});

test("buildFullSlidePrompt inclui titulo verbatim, topicos e instrucao de area segura", () => {
  const prompt = buildFullSlidePrompt(
    {
      titulo: "A Ascensão dos Templos",
      imagePrompt: "templos maias ao amanhecer",
      topics: ["Templos", "Rituais"],
    },
    "seeker",
    PLAN,
    "cover",
  );
  assert.ok(prompt.includes("A Ascensão dos Templos"));
  assert.ok(prompt.includes("Templos"));
  assert.ok(prompt.includes("Rituais"));
  assert.ok(prompt.includes("84%"));
  assert.ok(prompt.includes("cover"));
  assert.ok(prompt.includes("templos maias ao amanhecer"));
});

test("buildFullSlidePrompt funciona sem topicos/explicacao (campos opcionais)", () => {
  const prompt = buildFullSlidePrompt(
    { titulo: "Slide simples", imagePrompt: "cena qualquer" },
    "mastermind",
    PLAN,
    "spotlight",
  );
  assert.ok(prompt.includes("Slide simples"));
  assert.ok(prompt.includes("cena qualquer"));
});
