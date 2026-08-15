import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CONTENT_GENERATION_RESPONSE_SCHEMA,
  generateStructuredContentWithFallback,
  isGeminiAvailabilityError,
  isGeminiContentGenerationUnavailable,
  resetGeminiContentGenerationCircuit,
  resolveGeminiContentGenerationModel,
  resolveOpenAIContentGenerationFallbackModel,
  supportsReasoningEffort,
  type StructuredContentGenerationCall,
} from "./contentGenerationService";

test("supportsReasoningEffort: gpt-4o-mini (e familia gpt-4o/gpt-4.1) rejeita reasoning.effort", () => {
  assert.equal(supportsReasoningEffort("gpt-4o-mini"), false);
  assert.equal(supportsReasoningEffort("gpt-4o"), false);
  assert.equal(supportsReasoningEffort("gpt-4.1-mini"), false);
});

test("supportsReasoningEffort: modelos de raciocinio (o-series, gpt-5.x) aceitam reasoning.effort", () => {
  assert.equal(supportsReasoningEffort("gpt-5.4-mini"), true);
  assert.equal(supportsReasoningEffort("gpt-5.6-sol"), true);
  assert.equal(supportsReasoningEffort("o3"), true);
  assert.equal(supportsReasoningEffort("O1-preview"), true);
});

const call: StructuredContentGenerationCall = {
  instructions: "Gere conteúdo pedagógico completo.",
  input: "Blocos curriculares.",
  maxOutputTokens: 32_768,
  geminiModel: "gemini-primary",
  openaiModel: "openai-fallback",
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
    "gpt-4o-mini",
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

test("qualquer erro de geração do Gemini aciona a OpenAI", async () => {
  resetGeminiContentGenerationCircuit();
  let openaiCalls = 0;

  const result = await generateStructuredContentWithFallback(call, {
    generateWithGemini: async () => {
      throw new Error("Gemini retornou JSON inválido no lote 1.");
    },
    generateWithOpenAI: async () => {
      openaiCalls += 1;
      return { source: "openai" };
    },
  });

  assert.equal(result.provider, "openai");
  assert.match(result.fallbackReason ?? "", /JSON inválido/);
  assert.equal(openaiCalls, 1);
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

test("erro de qualidade de conteúdo não abre o circuito do Gemini para outras gerações", async () => {
  resetGeminiContentGenerationCircuit();
  let geminiCalls = 0;
  let openaiCalls = 0;

  const first = await generateStructuredContentWithFallback(call, {
    // Isola este teste do retry-com-o-proprio-Gemini (testado em separado
    // abaixo): com 1 tentativa so, o comportamento continua "1 chamada
    // Gemini, falha de qualidade, cai pra OpenAI".
    environment: { CONTENT_GENERATION_GEMINI_QUALITY_MAX_ATTEMPTS: "1" },
    generateWithGemini: async () => {
      geminiCalls += 1;
      return { chapters: [] };
    },
    generateWithOpenAI: async () => {
      openaiCalls += 1;
      return { chapters: [{ blockId: "bloco-01" }] };
    },
    validateResult: (value) => {
      const chapters = (value as { chapters?: unknown[] }).chapters ?? [];
      if (chapters.length === 0) {
        throw new Error("Markdown abaixo do mínimo de cobertura.");
      }
    },
  });

  assert.equal(first.provider, "openai");
  assert.equal(first.fallbackFrom, "gemini");

  // Geração seguinte (outro bloco/aluno): o Gemini está saudável e deve ser
  // tentado de novo, não pulado por causa de um "circuito" aberto por uma
  // falha de qualidade de conteúdo (não de indisponibilidade) da chamada anterior.
  const second = await generateStructuredContentWithFallback(call, {
    generateWithGemini: async () => {
      geminiCalls += 1;
      return { chapters: [{ blockId: "bloco-02" }] };
    },
    generateWithOpenAI: async () => {
      openaiCalls += 1;
      return { chapters: [{ blockId: "bloco-02" }] };
    },
    validateResult: () => {},
  });

  assert.equal(second.provider, "gemini");
  assert.equal(geminiCalls, 2);
  assert.equal(openaiCalls, 1);
  resetGeminiContentGenerationCircuit();
});

test("repete com o proprio Gemini (feedback corretivo) antes de exigir a OpenAI numa falha de qualidade", async () => {
  // Reproduz o bug real: a conta OpenAI ficou sem credito (insufficient_
  // quota) e uma unica falha de qualidade do Gemini (cobertura insuficiente)
  // virava uma falha permanente da geracao inteira, mesmo o Gemini estando
  // saudavel — repetir com o proprio Gemini (gratuito) resolve a maioria
  // dos casos sem nem precisar da OpenAI.
  resetGeminiContentGenerationCircuit();
  let geminiCalls = 0;
  const receivedInstructions: string[] = [];

  const result = await generateStructuredContentWithFallback(call, {
    generateWithGemini: async (currentCall) => {
      geminiCalls += 1;
      receivedInstructions.push(currentCall.instructions);
      return geminiCalls < 2
        ? { chapters: [] }
        : { chapters: [{ blockId: "bloco-01" }] };
    },
    generateWithOpenAI: async () => {
      throw new Error("nao deveria ser chamado — Gemini deve resolver na 2a tentativa");
    },
    validateResult: (value) => {
      const chapters = (value as { chapters?: unknown[] }).chapters ?? [];
      if (chapters.length === 0) {
        throw new Error("Markdown abaixo do mínimo de cobertura.");
      }
    },
  });

  assert.equal(result.provider, "gemini");
  assert.equal(geminiCalls, 2);
  assert.doesNotMatch(receivedInstructions[0], /CORREÇÃO OBRIGATÓRIA/);
  assert.match(receivedInstructions[1], /CORREÇÃO OBRIGATÓRIA DA TENTATIVA 2/);
  assert.match(receivedInstructions[1], /Markdown abaixo do mínimo de cobertura/);
  resetGeminiContentGenerationCircuit();
});

test("so recorre a OpenAI quando o proprio Gemini esgota as tentativas de qualidade", async () => {
  resetGeminiContentGenerationCircuit();
  let geminiCalls = 0;
  let openaiCalls = 0;

  const result = await generateStructuredContentWithFallback(call, {
    environment: { CONTENT_GENERATION_GEMINI_QUALITY_MAX_ATTEMPTS: "2" },
    generateWithGemini: async () => {
      geminiCalls += 1;
      return { chapters: [] }; // sempre invalido, nunca melhora
    },
    generateWithOpenAI: async () => {
      openaiCalls += 1;
      return { chapters: [{ blockId: "bloco-01" }] };
    },
    validateResult: (value) => {
      const chapters = (value as { chapters?: unknown[] }).chapters ?? [];
      if (chapters.length === 0) {
        throw new Error("Markdown abaixo do mínimo de cobertura.");
      }
    },
  });

  assert.equal(result.provider, "openai");
  assert.equal(result.fallbackFrom, "gemini");
  assert.equal(geminiCalls, 2);
  assert.equal(openaiCalls, 1);
  resetGeminiContentGenerationCircuit();
});

test("erro de disponibilidade do Gemini nao repete com o proprio Gemini — vai direto pra OpenAI", async () => {
  resetGeminiContentGenerationCircuit();
  let geminiCalls = 0;
  let openaiCalls = 0;

  await generateStructuredContentWithFallback(call, {
    generateWithGemini: async () => {
      geminiCalls += 1;
      const error = new Error("503 UNAVAILABLE: sobrecarregado");
      Object.assign(error, { status: 503 });
      throw error;
    },
    generateWithOpenAI: async () => {
      openaiCalls += 1;
      return { chapters: [{ blockId: "bloco-01" }] };
    },
  });

  assert.equal(geminiCalls, 1);
  assert.equal(openaiCalls, 1);
  resetGeminiContentGenerationCircuit();
});

test("repete a OpenAI com instrução corretiva quando a cobertura vem incompleta", async () => {
  resetGeminiContentGenerationCircuit();
  let openaiCalls = 0;
  const receivedInstructions: string[] = [];

  const result = await generateStructuredContentWithFallback(call, {
    environment: {
      CONTENT_GENERATION_OPENAI_MAX_ATTEMPTS: "3",
    },
    generateWithGemini: async () => {
      throw new Error("Gemini omitiu capítulos no lote.");
    },
    generateWithOpenAI: async (currentCall) => {
      openaiCalls += 1;
      receivedInstructions.push(currentCall.instructions);
      return openaiCalls === 1
        ? { chapters: [] }
        : { chapters: [{ blockId: "bloco-01" }] };
    },
    validateResult: (value) => {
      const chapters = (value as { chapters?: unknown[] }).chapters ?? [];
      if (chapters.length === 0) {
        throw new Error("Gerador omitiu capítulos.");
      }
    },
  });

  assert.equal(result.provider, "openai");
  assert.equal(openaiCalls, 2);
  assert.doesNotMatch(receivedInstructions[0], /CORREÇÃO OBRIGATÓRIA/);
  assert.match(receivedInstructions[1], /CORREÇÃO OBRIGATÓRIA DA TENTATIVA 2/);
  assert.match(receivedInstructions[1], /omitiu capítulos/);
  resetGeminiContentGenerationCircuit();
});

test("limita a três as tentativas da OpenAI recusadas por qualidade", async () => {
  resetGeminiContentGenerationCircuit();
  let openaiCalls = 0;

  await assert.rejects(
    generateStructuredContentWithFallback(call, {
      environment: {
        CONTENT_GENERATION_OPENAI_MAX_ATTEMPTS: "3",
      },
      generateWithGemini: async () => {
        throw new Error("Gemini resumiu o lote.");
      },
      generateWithOpenAI: async () => {
        openaiCalls += 1;
        return { chapters: [] };
      },
      validateResult: () => {
        throw new Error("Áudio abaixo do mínimo de cobertura.");
      },
    }),
    /tentativas obrigatórias pela OpenAI/,
  );

  assert.equal(openaiCalls, 3);
  resetGeminiContentGenerationCircuit();
});

test("não volta ao Gemini quando a tentativa obrigatória da OpenAI falha", async () => {
  resetGeminiContentGenerationCircuit();
  let geminiCalls = 0;
  let openaiCalls = 0;

  await assert.rejects(
    generateStructuredContentWithFallback(call, {
      generateWithGemini: async () => {
        geminiCalls += 1;
        const error = new Error("RESOURCE_EXHAUSTED");
        Object.assign(error, { status: 429 });
        throw error;
      },
      generateWithOpenAI: async () => {
        openaiCalls += 1;
        throw new Error("OPENAI_API_KEY ausente");
      },
    }),
    /tentativas? obrigatórias? pela OpenAI/,
  );

  assert.equal(geminiCalls, 1);
  assert.equal(openaiCalls, 1);
  resetGeminiContentGenerationCircuit();
});

test("isGeminiContentGenerationUnavailable reflete o mesmo circuito usado internamente", async () => {
  resetGeminiContentGenerationCircuit();
  assert.equal(isGeminiContentGenerationUnavailable(), false);

  let now = 10_000;
  await generateStructuredContentWithFallback(call, {
    environment: { CONTENT_GENERATION_GEMINI_COOLDOWN_MS: "60000" },
    now: () => now,
    generateWithGemini: async () => {
      const error = new Error("RESOURCE_EXHAUSTED: free tier quota limit");
      Object.assign(error, { status: 429 });
      throw error;
    },
    generateWithOpenAI: async () => ({ source: "openai" }),
  });

  // O circuito usa Date.now() de verdade internamente para chamadas externas
  // (ex.: audioScript via Gemini na contingência) — aqui só confirmamos que
  // ele abriu; o timer real decorre em milissegundos, não no `now` fake do teste.
  assert.equal(isGeminiContentGenerationUnavailable(() => now), true);
  assert.equal(isGeminiContentGenerationUnavailable(() => now + 61_000), false);
  resetGeminiContentGenerationCircuit();
  assert.equal(isGeminiContentGenerationUnavailable(() => now), false);
});

test("não duplica a mensagem da causa quando ela já está embutida no erro rotulado (tagSubCallError)", async () => {
  resetGeminiContentGenerationCircuit();

  await assert.rejects(
    generateStructuredContentWithFallback(call, {
      generateWithGemini: async () => {
        throw new Error("Gemini indisponível.");
      },
      generateWithOpenAI: async () => {
        // Mesmo padrão usado por tagSubCallError em geminiService.ts: rotula
        // o erro original com um prefixo, mantendo o erro original como cause.
        const original = new Error(
          "Gemini indisponível (circuito de cooldown aberto) no lote 2 "
          + "— audioScript não é gerado pela OpenAI, aguardando o Gemini se recuperar.",
        );
        throw new Error(`audioScript/Gemini: ${original.message}`, { cause: original });
      },
    }),
    (error: Error) => {
      const occurrences =
        error.message.split("audioScript não é gerado pela OpenAI").length - 1;
      assert.equal(occurrences, 1, `mensagem duplicada: ${error.message}`);
      return true;
    },
  );

  resetGeminiContentGenerationCircuit();
});

test("tenta os modelos fallback (1x cada) antes de exigir a OpenAI quando o primario esgota a qualidade", async () => {
  resetGeminiContentGenerationCircuit();
  const attemptedModels: string[] = [];
  let openaiCalls = 0;

  const result = await generateStructuredContentWithFallback(call, {
    environment: { CONTENT_GENERATION_GEMINI_QUALITY_MAX_ATTEMPTS: "1" },
    geminiFallbackModels: ["gemini-fallback-1", "gemini-fallback-2"],
    generateWithGemini: async (currentCall) => {
      attemptedModels.push(currentCall.geminiModel);
      return currentCall.geminiModel === "gemini-fallback-2"
        ? { chapters: [{ blockId: "bloco-01" }] }
        : { chapters: [] };
    },
    generateWithOpenAI: async () => {
      openaiCalls += 1;
      throw new Error("nao deveria ser chamado — fallback-2 deveria resolver");
    },
    validateResult: (value) => {
      const chapters = (value as { chapters?: unknown[] }).chapters ?? [];
      if (chapters.length === 0) {
        throw new Error("Markdown abaixo do mínimo de cobertura.");
      }
    },
  });

  assert.equal(result.provider, "gemini");
  assert.equal(result.model, "gemini-fallback-2");
  assert.deepEqual(attemptedModels, [
    "gemini-primary",
    "gemini-fallback-1",
    "gemini-fallback-2",
  ]);
  assert.equal(openaiCalls, 0);
  resetGeminiContentGenerationCircuit();
});

test("recorre a OpenAI so depois que o primario E todos os modelos fallback esgotam a qualidade", async () => {
  resetGeminiContentGenerationCircuit();
  let geminiCalls = 0;
  let openaiCalls = 0;

  const result = await generateStructuredContentWithFallback(call, {
    environment: { CONTENT_GENERATION_GEMINI_QUALITY_MAX_ATTEMPTS: "1" },
    geminiFallbackModels: ["gemini-fallback-1", "gemini-fallback-2"],
    generateWithGemini: async () => {
      geminiCalls += 1;
      return { chapters: [] }; // sempre invalido, em qualquer modelo
    },
    generateWithOpenAI: async () => {
      openaiCalls += 1;
      return { chapters: [{ blockId: "bloco-01" }] };
    },
    validateResult: (value) => {
      const chapters = (value as { chapters?: unknown[] }).chapters ?? [];
      if (chapters.length === 0) {
        throw new Error("Markdown abaixo do mínimo de cobertura.");
      }
    },
  });

  assert.equal(result.provider, "openai");
  assert.equal(geminiCalls, 3); // primario + 2 fallbacks, 1 tentativa cada
  assert.equal(openaiCalls, 1);
  resetGeminiContentGenerationCircuit();
});

test("CONTENT_GENERATION_ENABLE_OPENAI_FALLBACK=false: esgota Gemini e falha com o motivo real, sem chamar OpenAI", async () => {
  resetGeminiContentGenerationCircuit();
  let openaiCalls = 0;

  await assert.rejects(
    () =>
      generateStructuredContentWithFallback(call, {
        environment: {
          CONTENT_GENERATION_GEMINI_QUALITY_MAX_ATTEMPTS: "1",
          CONTENT_GENERATION_ENABLE_OPENAI_FALLBACK: "false",
        },
        generateWithGemini: async () => ({ chapters: [] }), // sempre invalido
        generateWithOpenAI: async () => {
          openaiCalls += 1;
          return { chapters: [{ blockId: "bloco-01" }] };
        },
        validateResult: (value) => {
          const chapters = (value as { chapters?: unknown[] }).chapters ?? [];
          if (chapters.length === 0) {
            throw new Error("Markdown abaixo do mínimo de cobertura.");
          }
        },
      }),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /Markdown abaixo do mínimo de cobertura/);
      assert.doesNotMatch(error.message, /OpenAI/);
      return true;
    },
  );

  assert.equal(openaiCalls, 0);
  resetGeminiContentGenerationCircuit();
});

test("CONTENT_GENERATION_ENABLE_OPENAI_FALLBACK=false: indisponibilidade do Gemini tambem nao chama OpenAI", async () => {
  resetGeminiContentGenerationCircuit();
  let openaiCalls = 0;

  await assert.rejects(
    () =>
      generateStructuredContentWithFallback(call, {
        environment: { CONTENT_GENERATION_ENABLE_OPENAI_FALLBACK: "false" },
        generateWithGemini: async () => {
          const error = new Error("503 UNAVAILABLE: sobrecarregado");
          Object.assign(error, { status: 503 });
          throw error;
        },
        generateWithOpenAI: async () => {
          openaiCalls += 1;
          return { chapters: [{ blockId: "bloco-01" }] };
        },
      }),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /503 UNAVAILABLE/);
      assert.doesNotMatch(error.message, /OpenAI/);
      return true;
    },
  );

  assert.equal(openaiCalls, 0);
  resetGeminiContentGenerationCircuit();
});

test("erro de disponibilidade num modelo fallback aborta direto pra OpenAI, sem tentar os candidatos restantes", async () => {
  resetGeminiContentGenerationCircuit();
  const attemptedModels: string[] = [];
  let openaiCalls = 0;

  const result = await generateStructuredContentWithFallback(call, {
    environment: { CONTENT_GENERATION_GEMINI_QUALITY_MAX_ATTEMPTS: "1" },
    geminiFallbackModels: ["gemini-fallback-1", "gemini-fallback-2"],
    generateWithGemini: async (currentCall) => {
      attemptedModels.push(currentCall.geminiModel);
      if (currentCall.geminiModel === "gemini-fallback-1") {
        const error = new Error("503 UNAVAILABLE: sobrecarregado");
        Object.assign(error, { status: 503 });
        throw error;
      }
      return { chapters: [] }; // primario: invalido (qualidade)
    },
    generateWithOpenAI: async () => {
      openaiCalls += 1;
      return { chapters: [{ blockId: "bloco-01" }] };
    },
    validateResult: (value) => {
      const chapters = (value as { chapters?: unknown[] }).chapters ?? [];
      if (chapters.length === 0) {
        throw new Error("Markdown abaixo do mínimo de cobertura.");
      }
    },
  });

  assert.equal(result.provider, "openai");
  assert.deepEqual(attemptedModels, ["gemini-primary", "gemini-fallback-1"]);
  assert.equal(openaiCalls, 1);
  resetGeminiContentGenerationCircuit();
});

test("geminiFallbackModels que repete o modelo primario nao tenta esse modelo de novo", async () => {
  resetGeminiContentGenerationCircuit();
  const attemptedModels: string[] = [];

  const result = await generateStructuredContentWithFallback(call, {
    environment: { CONTENT_GENERATION_GEMINI_QUALITY_MAX_ATTEMPTS: "1" },
    geminiFallbackModels: ["gemini-primary", "gemini-fallback-1"],
    generateWithGemini: async (currentCall) => {
      attemptedModels.push(currentCall.geminiModel);
      return currentCall.geminiModel === "gemini-fallback-1"
        ? { chapters: [{ blockId: "bloco-01" }] }
        : { chapters: [] };
    },
    generateWithOpenAI: async () => {
      throw new Error("nao deveria ser chamado");
    },
    validateResult: (value) => {
      const chapters = (value as { chapters?: unknown[] }).chapters ?? [];
      if (chapters.length === 0) {
        throw new Error("Markdown abaixo do mínimo de cobertura.");
      }
    },
  });

  assert.equal(result.model, "gemini-fallback-1");
  assert.deepEqual(attemptedModels, ["gemini-primary", "gemini-fallback-1"]);
  resetGeminiContentGenerationCircuit();
});

test("mensagem final de falha total menciona quantos modelos Gemini foram tentados", async () => {
  resetGeminiContentGenerationCircuit();

  await assert.rejects(
    generateStructuredContentWithFallback(call, {
      environment: {
        CONTENT_GENERATION_GEMINI_QUALITY_MAX_ATTEMPTS: "1",
        CONTENT_GENERATION_OPENAI_MAX_ATTEMPTS: "1",
      },
      geminiFallbackModels: ["gemini-fallback-1"],
      generateWithGemini: async () => ({ chapters: [] }),
      generateWithOpenAI: async () => {
        throw new Error("insufficient_quota");
      },
      validateResult: (value) => {
        const chapters = (value as { chapters?: unknown[] }).chapters ?? [];
        if (chapters.length === 0) {
          throw new Error("Markdown abaixo do mínimo de cobertura.");
        }
      },
    }),
    (error: Error & { cause?: { gemini?: string } }) => {
      assert.match(error.cause?.gemini ?? "", /2 modelos Gemini tentados/);
      return true;
    },
  );

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
