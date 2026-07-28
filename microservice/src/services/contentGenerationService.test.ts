import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CONTENT_GENERATION_RESPONSE_SCHEMA,
  generateStructuredContentWithFallback,
  isGeminiAvailabilityError,
  resetGeminiContentGenerationCircuit,
  resolveGeminiContentGenerationEmergencyModel,
  resolveGeminiContentGenerationModel,
  resolveOpenAIContentGenerationFallbackModel,
  type StructuredContentGenerationCall,
} from "./contentGenerationService";

const call: StructuredContentGenerationCall = {
  instructions: "Gere conteúdo pedagógico completo.",
  input: "Blocos curriculares.",
  maxOutputTokens: 32_768,
  geminiModel: "gemini-primary",
  openaiModel: "openai-fallback",
  geminiEmergencyModel: "gemini-emergency",
};

test("mantém Gemini como modelo primário e resolve OpenAI apenas para contingência", () => {
  assert.equal(resolveGeminiContentGenerationModel({}), "gemini-3.6-flash");
  assert.equal(
    resolveGeminiContentGenerationModel({
      CONTENT_GENERATION_MODEL: "gemini-3-flash-preview",
    }),
    "gemini-3.6-flash",
  );
  assert.equal(
    resolveOpenAIContentGenerationFallbackModel({}),
    "gpt-5.6-sol",
  );
  assert.equal(
    resolveGeminiContentGenerationModel({
      CONTENT_GENERATION_MODEL: "gemini-custom",
    }),
    "gemini-custom",
  );
  assert.equal(
    resolveOpenAIContentGenerationFallbackModel({
      OPENAI_CONTENT_GENERATION_FALLBACK_MODEL: "openai-custom",
    }),
    "openai-custom",
  );
  assert.equal(
    resolveGeminiContentGenerationEmergencyModel({}),
    "gemini-3.5-flash-lite",
  );
  assert.equal(
    resolveGeminiContentGenerationEmergencyModel({
      GEMINI_CONTENT_GENERATION_EMERGENCY_MODEL: "gemini-2.5-flash",
    }),
    "gemini-3.5-flash-lite",
  );
});

test("schema de contingência OpenAI é estrito em todos os objetos", () => {
  assert.equal(CONTENT_GENERATION_RESPONSE_SCHEMA.additionalProperties, false);
  const chapter = CONTENT_GENERATION_RESPONSE_SCHEMA.properties
    .chapters.items;
  assert.equal(chapter.additionalProperties, false);
  const slide = chapter.properties.slides.items;
  assert.equal(slide.additionalProperties, false);
  assert.deepEqual(slide.properties.characterAction.enum, [
    "explaining",
    "celebrating",
    "thinking",
    "warning",
  ]);
});

test("usa Gemini quando ele está disponível sem chamar a OpenAI", async () => {
  resetGeminiContentGenerationCircuit();
  let openaiCalls = 0;
  const result = await generateStructuredContentWithFallback(call, {
    generateWithGemini: async () => ({ source: "gemini" }),
    generateWithOpenAI: async () => {
      openaiCalls += 1;
      return { source: "openai" };
    },
  });

  assert.deepEqual(result.value, { source: "gemini" });
  assert.equal(result.provider, "gemini");
  assert.equal(result.model, "gemini-primary");
  assert.equal(result.fallbackFrom, undefined);
  assert.equal(openaiCalls, 0);
});

test("quota do Gemini aciona OpenAI e abre circuito para os próximos lotes", async () => {
  resetGeminiContentGenerationCircuit();
  let geminiCalls = 0;
  let openaiCalls = 0;
  let now = 10_000;
  const options = {
    environment: {
      CONTENT_GENERATION_GEMINI_COOLDOWN_MS: "60000",
    },
    now: () => now,
    generateWithGemini: async () => {
      geminiCalls += 1;
      const error = new Error("RESOURCE_EXHAUSTED: free tier quota limit");
      Object.assign(error, { status: 429 });
      throw error;
    },
    generateWithOpenAI: async () => {
      openaiCalls += 1;
      return { source: "openai", call: openaiCalls };
    },
  };

  const first = await generateStructuredContentWithFallback(call, options);
  now += 1_000;
  const second = await generateStructuredContentWithFallback(call, options);

  assert.equal(first.provider, "openai");
  assert.equal(first.fallbackFrom, "gemini");
  assert.match(first.fallbackReason ?? "", /quota/i);
  assert.equal(second.provider, "openai");
  assert.match(second.fallbackReason ?? "", /circuito temporário/i);
  assert.equal(geminiCalls, 1);
  assert.equal(openaiCalls, 2);
});

test("não esconde erro de resposta inválida do Gemini como indisponibilidade", async () => {
  resetGeminiContentGenerationCircuit();
  let openaiCalls = 0;

  await assert.rejects(
    generateStructuredContentWithFallback(call, {
      generateWithGemini: async () => {
        throw new Error("Gemini retornou JSON inválido no lote 1.");
      },
      generateWithOpenAI: async () => {
        openaiCalls += 1;
        return {};
      },
    }),
    /JSON inválido/,
  );
  assert.equal(openaiCalls, 0);
});

test("conteúdo Gemini inválido aciona a geração OpenAI", async () => {
  resetGeminiContentGenerationCircuit();
  let openaiCalls = 0;
  const result = await generateStructuredContentWithFallback(call, {
    generateWithGemini: async () => ({ chapters: [] }),
    generateWithOpenAI: async () => {
      openaiCalls += 1;
      return { chapters: [{ blockId: "bloco-01" }] };
    },
    validateResult: (value, provider) => {
      const chapters = (value as { chapters?: unknown[] }).chapters ?? [];
      if (chapters.length === 0) {
        throw new Error(`${provider} omitiu os capítulos obrigatórios.`);
      }
    },
  });

  assert.equal(result.provider, "openai");
  assert.equal(result.fallbackFrom, "gemini");
  assert.equal(openaiCalls, 1);
  resetGeminiContentGenerationCircuit();
});

test("usa Gemini alternativo quando Gemini principal e OpenAI estão sem quota", async () => {
  resetGeminiContentGenerationCircuit();
  const geminiModels: string[] = [];
  let openaiCalls = 0;
  const result = await generateStructuredContentWithFallback(call, {
    generateWithGemini: async (currentCall) => {
      geminiModels.push(currentCall.geminiModel);
      if (currentCall.geminiModel === "gemini-primary") {
        const error = new Error("RESOURCE_EXHAUSTED");
        Object.assign(error, { status: 429 });
        throw error;
      }
      return { source: "gemini-emergency" };
    },
    generateWithOpenAI: async () => {
      openaiCalls += 1;
      const error = new Error("insufficient_quota");
      Object.assign(error, { status: 429 });
      throw error;
    },
  });
  const second = await generateStructuredContentWithFallback(call, {
    generateWithGemini: async (currentCall) => {
      geminiModels.push(currentCall.geminiModel);
      return { source: "gemini-emergency-second" };
    },
    generateWithOpenAI: async () => {
      openaiCalls += 1;
      throw new Error("OpenAI não deveria ser chamada com o circuito aberto.");
    },
  });

  assert.equal(result.provider, "gemini");
  assert.equal(result.model, "gemini-emergency");
  assert.deepEqual(result.value, { source: "gemini-emergency" });
  assert.equal(second.model, "gemini-emergency");
  assert.deepEqual(second.value, { source: "gemini-emergency-second" });
  assert.deepEqual(geminiModels, [
    "gemini-primary",
    "gemini-emergency",
    "gemini-emergency",
  ]);
  assert.equal(openaiCalls, 1);
  resetGeminiContentGenerationCircuit();
});

test("reconhece indisponibilidade transitória e não confunde validação de conteúdo", () => {
  assert.equal(isGeminiAvailabilityError({ status: 503 }), true);
  assert.equal(isGeminiAvailabilityError({ status: 404 }), true);
  assert.equal(
    isGeminiAvailabilityError(
      new Error("This model is no longer available to new users."),
    ),
    true,
  );
  assert.equal(
    isGeminiAvailabilityError(new Error("connection reset by peer")),
    true,
  );
  assert.equal(
    isGeminiAvailabilityError(new Error("capítulo omitido pelo modelo")),
    false,
  );
});
