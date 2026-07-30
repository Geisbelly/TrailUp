import OpenAI from "openai";

export const DEFAULT_GEMINI_CONTENT_GENERATION_MODEL =
  "gemini-3.6-flash" as const;
// gpt-5.4-mini tem tier de 10 RPM / 50 RPD — inviável como contingência real.
// gpt-4o-mini (500 RPM / 10.000 RPD) é bem mais utilizável quando o Gemini
// (provedor principal) falhar.
export const DEFAULT_OPENAI_CONTENT_GENERATION_FALLBACK_MODEL =
  "gpt-4o-mini" as const;

const DEFAULT_GEMINI_UNAVAILABLE_COOLDOWN_MS = 5 * 60 * 1_000;
const DEFAULT_OPENAI_MAX_OUTPUT_TOKENS = 16_384;
const DEFAULT_OPENAI_QUALITY_MAX_ATTEMPTS = 3;

/**
 * gpt-4o-mini (e a familia gpt-4o/gpt-4.1 em geral) rejeita o parametro
 * reasoning.effort com 400 — so os modelos de raciocinio (o-series, gpt-5.x)
 * aceitam. gpt-5.4-mini era o default anterior (aceitava); gpt-4o-mini e o
 * novo default (nao aceita) — sem essa checagem, toda chamada quebraria.
 */
export function supportsReasoningEffort(model: string): boolean {
  const normalized = model.trim().toLowerCase();
  return /^(o1|o3|gpt-5)/.test(normalized);
}

export type ContentGenerationProvider = "gemini" | "openai";

export interface StructuredContentGenerationCall {
  instructions: string;
  input: string;
  maxOutputTokens: number;
  geminiModel: string;
  openaiModel: string;
}

export type StructuredContentGenerator = (
  call: StructuredContentGenerationCall,
) => Promise<unknown>;

export interface StructuredContentGenerationResult {
  value: unknown;
  provider: ContentGenerationProvider;
  model: string;
  fallbackFrom?: "gemini";
  fallbackReason?: string;
}

export interface StructuredContentGenerationOptions {
  generateWithGemini: StructuredContentGenerator;
  generateWithOpenAI?: StructuredContentGenerator;
  validateResult?: (
    value: unknown,
    provider: ContentGenerationProvider,
  ) => void;
  environment?: Record<string, string | undefined>;
  now?: () => number;
}

const SLIDE_ITEM_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    title: { type: "string" },
    topics: {
      type: "array",
      items: { type: "string" },
    },
    explanation: { type: "string" },
    visualDescription: { type: "string" },
    characterQuote: { type: "string" },
    characterAction: {
      type: "string",
      enum: ["explaining", "celebrating", "thinking", "warning"],
    },
    imagePrompt: { type: "string" },
    iconPrompts: {
      type: "array",
      items: { type: "string" },
    },
    sourceIds: {
      type: "array",
      items: { type: "string" },
    },
  },
  required: [
    "title",
    "topics",
    "explanation",
    "visualDescription",
    "characterQuote",
    "characterAction",
    "imagePrompt",
    "iconPrompts",
    "sourceIds",
  ],
} as const;

export const CONTENT_GENERATION_RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    chapters: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          blockId: { type: "string" },
          markdown: { type: "string" },
          audioScript: { type: "string" },
          slides: {
            type: "array",
            items: SLIDE_ITEM_SCHEMA,
          },
        },
        required: ["blockId", "markdown", "audioScript", "slides"],
      },
    },
    confidence: { type: "number" },
  },
  required: ["chapters", "confidence"],
} as const;

// gpt-4o-mini tem teto rígido de 16384 tokens de saída na API da OpenAI — não
// dá pra "aumentar" além disso (confirmado: o modelo simplesmente não aceita
// mais que isso em max_output_tokens). Por isso a contingência OpenAI nunca
// pede tudo numa chamada só: markdown e slides vão em chamadas separadas
// (menores schemas abaixo), e o audioScript nem passa pela OpenAI — continua
// saindo do Gemini mesmo quando ele falhou pro resto do bloco.
export const CONTENT_GENERATION_TEXT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    chapters: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          blockId: { type: "string" },
          markdown: { type: "string" },
        },
        required: ["blockId", "markdown"],
      },
    },
    confidence: { type: "number" },
  },
  required: ["chapters", "confidence"],
} as const;

export const CONTENT_GENERATION_SLIDES_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    chapters: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          blockId: { type: "string" },
          slides: {
            type: "array",
            items: SLIDE_ITEM_SCHEMA,
          },
        },
        required: ["blockId", "slides"],
      },
    },
    confidence: { type: "number" },
  },
  required: ["chapters", "confidence"],
} as const;

let openai: OpenAI | null = null;
let geminiUnavailableUntil = 0;

class ContentGenerationQualityError extends Error {
  constructor(provider: ContentGenerationProvider, cause: unknown) {
    super(
      `${provider} retornou conteúdo que não atende ao contrato de geração.`,
      { cause },
    );
    this.name = "ContentGenerationQualityError";
  }
}

function getOpenAI(): OpenAI {
  if (openai) return openai;
  const apiKey = String(process.env.OPENAI_API_KEY ?? "").trim();
  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY ausente: a contingência da geração de conteúdo não está disponível.",
    );
  }
  openai = new OpenAI({ apiKey });
  return openai;
}

function positiveInteger(
  value: unknown,
  fallback: number,
  minimum: number,
  maximum: number,
): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    return fallback;
  }
  return parsed;
}

export function resolveGeminiContentGenerationModel(
  environment: Record<string, string | undefined> = process.env,
): string {
  const configured = String(environment.CONTENT_GENERATION_MODEL ?? "").trim();
  if (!configured || configured === "gemini-3-flash-preview") {
    return DEFAULT_GEMINI_CONTENT_GENERATION_MODEL;
  }
  return configured;
}

export function resolveOpenAIContentGenerationFallbackModel(
  environment: Record<string, string | undefined> = process.env,
): string {
  return String(
    environment.OPENAI_CONTENT_GENERATION_FALLBACK_MODEL ?? "",
  ).trim() || DEFAULT_OPENAI_CONTENT_GENERATION_FALLBACK_MODEL;
}

function errorDetails(error: unknown): string {
  if (error instanceof Error) {
    // tagSubCallError (geminiService.ts) rotula o erro original com um prefixo
    // e o mantém como cause — nesse caso a mensagem da cause já está embutida
    // em error.message, e repeti-la aqui só duplicaria o texto no log.
    const causeMessage = error.cause instanceof Error
      ? error.cause.message
      : "cause" in error ? String(error.cause ?? "") : "";
    const cause = causeMessage && !error.message.includes(causeMessage)
      ? causeMessage
      : "";
    return `${error.name} ${error.message} ${cause}`.trim();
  }
  if (typeof error === "object" && error !== null) {
    try {
      return JSON.stringify(error);
    } catch {
      return String(error);
    }
  }
  return String(error ?? "");
}

export function isGeminiAvailabilityError(error: unknown): boolean {
  const record = typeof error === "object" && error !== null
    ? error as Record<string, unknown>
    : {};
  const status = Number(record.status ?? record.statusCode ?? record.code);
  if (status === 404 || status === 408 || status === 429 || status >= 500) {
    return true;
  }

  const details = errorDetails(error).toLowerCase();
  return [
    "429",
    "404",
    "not_found",
    "model not found",
    "no longer available",
    "model is not available",
    "resource_exhausted",
    "quota",
    "rate limit",
    "too many requests",
    "service unavailable",
    "temporarily unavailable",
    "timeout",
    "timed out",
    "etimedout",
    "econnreset",
    "connection reset",
    "fetch failed",
    "gemini_api_key ausente",
  ].some((marker) => details.includes(marker));
}

async function callOpenAIStructured(
  call: StructuredContentGenerationCall,
  schema: Record<string, unknown>,
  schemaName: string,
  schemaDescription: string,
): Promise<unknown> {
  const configuredMaxOutputTokens = positiveInteger(
    process.env.OPENAI_CONTENT_GENERATION_MAX_OUTPUT_TOKENS,
    DEFAULT_OPENAI_MAX_OUTPUT_TOKENS,
    8_192,
    32_768,
  );
  const maxOutputTokens = Math.min(
    Math.max(call.maxOutputTokens, 8_192),
    configuredMaxOutputTokens,
  );
  const isReasoningModel = supportsReasoningEffort(call.openaiModel);
  const response = await getOpenAI().responses.create({
    model: call.openaiModel,
    instructions: call.instructions,
    input: call.input,
    max_output_tokens: maxOutputTokens,
    ...(isReasoningModel ? { reasoning: { effort: "medium" as const } } : {}),
    store: false,
    text: {
      // gpt-4o-mini (e familia gpt-4o/gpt-4.1) so aceita "medium" — "high"
      // retorna 400 unsupported_value. Mesma familia de modelos de
      // raciocinio que aceita reasoning.effort.
      verbosity: isReasoningModel ? "high" : "medium",
      format: {
        type: "json_schema",
        name: schemaName,
        description: schemaDescription,
        strict: true,
        schema,
      },
    },
  });

  if (response.status === "incomplete") {
    const reason = response.incomplete_details?.reason ?? "motivo desconhecido";
    // gpt-4o-mini tem teto rigido de 16384 tokens de saida na API da OpenAI —
    // nao ha env var que resolva isso alem desse teto. A unica saida real e
    // pedir menos por chamada (dividir o escopo), nao subir um limite.
    throw new Error(
      `OpenAI retornou resposta incompleta (motivo: ${reason}). Reduza o `
      + "escopo pedido nesta chamada — gpt-4o-mini tem teto de 16384 tokens "
      + "de saída, subir OPENAI_CONTENT_GENERATION_MAX_OUTPUT_TOKENS acima "
      + "disso não tem efeito.",
    );
  }

  const responseText = String(response.output_text ?? "").trim();
  if (!responseText) {
    throw new Error(
      `OpenAI retornou a contingência vazia (status: ${response.status}).`,
    );
  }
  try {
    return JSON.parse(responseText);
  } catch (error) {
    throw new Error("OpenAI retornou JSON inválido na contingência.", {
      cause: error,
    });
  }
}

async function generateStructuredWithOpenAI(
  call: StructuredContentGenerationCall,
): Promise<unknown> {
  return callOpenAIStructured(
    call,
    CONTENT_GENERATION_RESPONSE_SCHEMA,
    "trailup_personalized_content_batch",
    "Capítulos personalizados completos, com roteiro de áudio e slides rastreáveis.",
  );
}

export async function generateOpenAITextOnly(
  call: StructuredContentGenerationCall,
): Promise<unknown> {
  return callOpenAIStructured(
    call,
    CONTENT_GENERATION_TEXT_SCHEMA,
    "trailup_personalized_content_text",
    "Markdown personalizado por bloco, sem roteiro de áudio nem slides.",
  );
}

export async function generateOpenAISlidesOnly(
  call: StructuredContentGenerationCall,
): Promise<unknown> {
  return callOpenAIStructured(
    call,
    CONTENT_GENERATION_SLIDES_SCHEMA,
    "trailup_personalized_content_slides",
    "Slides rastreáveis por bloco, sem markdown nem roteiro de áudio.",
  );
}

export function resetGeminiContentGenerationCircuit(): void {
  geminiUnavailableUntil = 0;
}

/**
 * Permite que chamadas de Gemini feitas FORA deste módulo (ex.: o audioScript
 * da contingência, que continua exclusivamente Gemini) respeitem o mesmo
 * circuito de indisponibilidade — sem isso, elas martelariam o Gemini de novo
 * na mesma janela de cooldown que a tentativa principal acabou de abrir.
 */
export function isGeminiContentGenerationUnavailable(
  now: () => number = Date.now,
): boolean {
  return now() < geminiUnavailableUntil;
}

async function generateAfterPrimaryGeminiFailure(
  call: StructuredContentGenerationCall,
  reason: string,
  options: {
    generateWithOpenAI: StructuredContentGenerator;
    validateResult?: StructuredContentGenerationOptions["validateResult"];
    environment: Record<string, string | undefined>;
  },
): Promise<StructuredContentGenerationResult> {
  const generateAndValidate = async (
    generator: StructuredContentGenerator,
    currentCall: StructuredContentGenerationCall,
    provider: ContentGenerationProvider,
  ): Promise<unknown> => {
    const value = await generator(currentCall);
    try {
      options.validateResult?.(value, provider);
    } catch (error) {
      throw new ContentGenerationQualityError(provider, error);
    }
    return value;
  };

  const maxAttempts = positiveInteger(
    options.environment.CONTENT_GENERATION_OPENAI_MAX_ATTEMPTS,
    DEFAULT_OPENAI_QUALITY_MAX_ATTEMPTS,
    1,
    4,
  );
  let lastOpenAIError: unknown;
  let previousQualityReason = "";

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const currentCall = attempt === 1
      ? call
      : {
        ...call,
        instructions:
          `${call.instructions}\n\nCORREÇÃO OBRIGATÓRIA DA TENTATIVA ${attempt}: `
          + "a resposta anterior foi recusada pela validação de qualidade. "
          + "Devolva exatamente um capítulo completo para cada blockId recebido, "
          + "sem omitir, fundir, acrescentar ou resumir blocos. Preserve toda a "
          + "cobertura do conteúdo aprofundado no texto e no roteiro de áudio. "
          + `Motivo da recusa anterior: ${previousQualityReason}`,
      };

    try {
      return {
        value: await generateAndValidate(
          options.generateWithOpenAI,
          currentCall,
          "openai",
        ),
        provider: "openai",
        model: call.openaiModel,
        fallbackFrom: "gemini",
        fallbackReason: reason,
      };
    } catch (openaiError) {
      lastOpenAIError = openaiError;
      if (!(openaiError instanceof ContentGenerationQualityError)) {
        break;
      }
      previousQualityReason = errorDetails(openaiError).slice(0, 500);
    }
  }

  const openaiReason = errorDetails(lastOpenAIError).slice(0, 500);
  throw new Error(
    "A geração falhou no Gemini e as tentativas obrigatórias pela OpenAI "
      + `também falharam. OpenAI: ${openaiReason}`,
    {
      cause: {
        gemini: reason,
        openai: openaiReason,
      },
    },
  );
}

export async function generateStructuredContentWithFallback(
  call: StructuredContentGenerationCall,
  options: StructuredContentGenerationOptions,
): Promise<StructuredContentGenerationResult> {
  const environment = options.environment ?? process.env;
  const now = options.now ?? Date.now;
  const generateWithOpenAI =
    options.generateWithOpenAI ?? generateStructuredWithOpenAI;

  if (now() < geminiUnavailableUntil) {
    return generateAfterPrimaryGeminiFailure(
      call,
      "circuito temporário de indisponibilidade do Gemini principal",
      {
        generateWithOpenAI,
        validateResult: options.validateResult,
        environment,
      },
    );
  }

  try {
    const value = await options.generateWithGemini(call);
    try {
      options.validateResult?.(value, "gemini");
    } catch (error) {
      throw new ContentGenerationQualityError("gemini", error);
    }
    return {
      value,
      provider: "gemini",
      model: call.geminiModel,
    };
  } catch (error) {
    // Só indisponibilidade real do Gemini abre o circuito. Um
    // ContentGenerationQualityError é sobre a saída de UM lote (ex.: markdown
    // curto demais para aquele bloco específico); tratá-lo como indisponibilidade
    // contaminaria gerações concorrentes não relacionadas, que pulariam o
    // Gemini saudável sem necessidade.
    if (isGeminiAvailabilityError(error)) {
      const cooldownMs = positiveInteger(
        environment.CONTENT_GENERATION_GEMINI_COOLDOWN_MS,
        DEFAULT_GEMINI_UNAVAILABLE_COOLDOWN_MS,
        1_000,
        60 * 60 * 1_000,
      );
      geminiUnavailableUntil = now() + cooldownMs;
    }
    const reason = errorDetails(error).slice(0, 500);

    return generateAfterPrimaryGeminiFailure(call, reason, {
      generateWithOpenAI,
      validateResult: options.validateResult,
      environment,
    });
  }
}
