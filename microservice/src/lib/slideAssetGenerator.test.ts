import { test } from "node:test";
import assert from "node:assert/strict";
import { buildFullSlidePrompt, buildImageStyleSuffix, generateFullSlideImages } from "./slideAssetGenerator";
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

test("todos os slides geram com sucesso via imagem cheia", async () => {
  const slides = [
    { titulo: "Slide 1", imagePrompt: "cena 1" },
    { titulo: "Slide 2", imagePrompt: "cena 2" },
  ];
  const result = await generateFullSlideImages(slides, "seeker", PLAN, {
    generateFullSlideImage: async (prompt) => `full-${prompt.length}`,
  });
  assert.deepEqual(result.renderMode, ["full-image", "full-image"]);
  assert.equal(result.icones[0].length, 0);
  assert.equal(result.icones[1].length, 0);
  assert.equal(result.imagem_referencia.length, 2);
});

test("slide cheio falha e cai para o pipeline legacy so naquele indice", async () => {
  const slides = [
    { titulo: "Slide 1", imagePrompt: "cena 1", iconPrompts: ["icone 1"] },
    { titulo: "Slide 2", imagePrompt: "cena 2", iconPrompts: ["icone 2"] },
  ];
  let fullCalls = 0;
  const result = await generateFullSlideImages(slides, "seeker", PLAN, {
    generateFullSlideImage: async () => {
      fullCalls += 1;
      if (fullCalls === 1) throw new Error("erro qualquer");
      return "full-ok";
    },
    generateSceneImage: async () => "legacy-scene",
    generateSlideIconWithFallback: async () => ({ image: "legacy-icon", provider: "gemini" as const }),
  });
  assert.deepEqual(result.renderMode, ["legacy", "full-image"]);
  assert.equal(result.imagem_referencia[0], "legacy-scene");
  assert.deepEqual(result.icones[0], ["legacy-icon"]);
  assert.equal(result.imagem_referencia[1], "full-ok");
});

test("fallback legacy nao lanca excecao mesmo se cena e icone tambem falharem", async () => {
  const slides = [{ titulo: "Slide 1", imagePrompt: "cena 1", iconPrompts: ["icone 1"] }];
  const result = await generateFullSlideImages(slides, "seeker", PLAN, {
    generateFullSlideImage: async () => { throw new Error("full falhou"); },
    generateSceneImage: async () => { throw new Error("cena falhou"); },
    generateSlideIconWithFallback: async () => { throw new Error("icone falhou"); },
  });
  assert.equal(result.renderMode[0], "legacy");
  assert.equal(result.imagem_referencia[0], "");
  assert.deepEqual(result.icones[0], [""]);
});

test("com enableOpenAiFullSlideImages=false, pula direto pro legacy sem tentar a OpenAI", async () => {
  const slides = [
    { titulo: "Slide 1", imagePrompt: "cena 1", iconPrompts: ["icone 1"] },
  ];
  const result = await generateFullSlideImages(slides, "seeker", PLAN, {
    enableOpenAiFullSlideImages: false,
    // Sem override de generateFullSlideImage — se a flag nao bloqueasse por
    // padrao, isso tentaria a OpenAI real (gpt-image-1) e falharia de um
    // jeito diferente (erro de rede/API, nao "desabilitada").
    generateSceneImage: async () => "legacy-scene",
    generateSlideIconWithFallback: async () => ({ image: "legacy-icon", provider: "gemini" as const }),
  });
  assert.deepEqual(result.renderMode, ["legacy"]);
  assert.equal(result.imagem_referencia[0], "legacy-scene");
});

test("com enableOpenAiFullSlideImages=true mas sem override, usa generateFullSlideImage real (gpt-image-1)", async () => {
  const slides = [{ titulo: "Slide 1", imagePrompt: "cena 1" }];
  // So confirma que a flag *habilita* o caminho real — nao mocka a OpenAI,
  // entao sem OPENAI_API_KEY isso cai (com erro) no pipeline legacy, que e
  // o comportamento correto (fallback por slide sempre disponivel).
  const result = await generateFullSlideImages(slides, "seeker", PLAN, {
    enableOpenAiFullSlideImages: true,
    generateSceneImage: async () => "legacy-scene",
  });
  assert.equal(result.renderMode[0], "legacy");
});

test("fallback legacy interrompe icones apos o primeiro vir da contingencia OpenAI", async () => {
  const slides = [{
    titulo: "Slide 1",
    imagePrompt: "cena 1",
    iconPrompts: ["icone 1", "icone 2", "icone 3"],
  }];
  let iconCalls = 0;
  const result = await generateFullSlideImages(slides, "seeker", PLAN, {
    generateFullSlideImage: async () => { throw new Error("full falhou"); },
    generateSceneImage: async () => "legacy-scene",
    generateSlideIconWithFallback: async () => {
      iconCalls += 1;
      return { image: `icon-${iconCalls}`, provider: "openai" as const };
    },
  });
  assert.equal(iconCalls, 1);
  assert.deepEqual(result.icones[0], ["icon-1"]);
});
