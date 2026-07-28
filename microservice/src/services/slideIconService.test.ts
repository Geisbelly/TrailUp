import { test } from "node:test";
import assert from "node:assert/strict";
import {
  generateSlideIconWithFallback,
  isGeminiImageAvailabilityError,
  resetGeminiImageCircuit,
} from "./slideIconService";

test("usa Gemini para o ícone quando o provedor está disponível", async () => {
  resetGeminiImageCircuit();
  let openaiCalls = 0;
  const result = await generateSlideIconWithFallback("ícone de rede", {
    generateWithGemini: async () => "gemini-image",
    generateWithOpenAI: async () => {
      openaiCalls += 1;
      return "openai-image";
    },
  });

  assert.equal(result.image, "gemini-image");
  assert.equal(result.provider, "gemini");
  assert.equal(openaiCalls, 0);
});

test("quota do Gemini abre circuito e próximos ícones vão direto à OpenAI", async () => {
  resetGeminiImageCircuit();
  let geminiCalls = 0;
  let openaiCalls = 0;
  let now = 10_000;
  const options = {
    now: () => now,
    environment: {
      CONTENT_GENERATION_GEMINI_IMAGE_COOLDOWN_MS: "60000",
    },
    generateWithGemini: async () => {
      geminiCalls += 1;
      const error = new Error("RESOURCE_EXHAUSTED: quota exceeded");
      Object.assign(error, { status: 429 });
      throw error;
    },
    generateWithOpenAI: async () => {
      openaiCalls += 1;
      return `openai-image-${openaiCalls}`;
    },
  };

  const first = await generateSlideIconWithFallback("ícone 1", options);
  now += 1_000;
  const second = await generateSlideIconWithFallback("ícone 2", options);

  assert.equal(first.provider, "openai");
  assert.match(first.fallbackReason ?? "", /quota/i);
  assert.equal(second.provider, "openai");
  assert.match(second.fallbackReason ?? "", /circuito temporário/i);
  assert.equal(geminiCalls, 1);
  assert.equal(openaiCalls, 2);
  resetGeminiImageCircuit();
});

test("falha dos dois provedores é reportada sem esconder a causa", async () => {
  resetGeminiImageCircuit();
  await assert.rejects(
    generateSlideIconWithFallback("ícone", {
      generateWithGemini: async () => {
        throw new Error("Gemini não retornou imagem");
      },
      generateWithOpenAI: async () => {
        throw new Error("OpenAI indisponível");
      },
    }),
    /falhou no Gemini e na contingência OpenAI/,
  );
});

test("reconhece indisponibilidade da API de imagem Gemini", () => {
  assert.equal(isGeminiImageAvailabilityError({ status: 429 }), true);
  assert.equal(
    isGeminiImageAvailabilityError(new Error("RESOURCE_EXHAUSTED")),
    true,
  );
  assert.equal(
    isGeminiImageAvailabilityError(new Error("imagem vazia")),
    false,
  );
});
