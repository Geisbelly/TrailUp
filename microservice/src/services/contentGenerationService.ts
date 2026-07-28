import OpenAI from "openai";

export const DEFAULT_GEMINI_CONTENT_GENERATION_MODEL =
  "gemini-3.6-flash" as const;
export const DEFAULT_OPENAI_CONTENT_GENERATION_FALLBACK_MODEL =
  "gpt-5.6-sol" as const;

const DEFAULT_GEMINI_UNAVAILABLE_COOLDOWN_MS = 5 * 60 * 1_000;
const DEFAULT_OPENAI_MAX_OUTPUT_TOKENS = 65_536;

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
            items: {
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
            },
          },
        },
        required: ["blockId", "markdown", "audioScript", "slides"],
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
    const cause = "cause" in error ? String(error.cause ?? "") : "";
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

async function generateStructuredWithOpenAI(
  call: StructuredContentGenerationCall,
): Promise<unknown> {
  const maxOutputTokens = positiveInteger(
    process.env.OPENAI_CONTENT_GENERATION_MAX_OUTPUT_TOKENS,
    Math.max(call.maxOutputTokens, DEFAULT_OPENAI_MAX_OUTPUT_TOKENS),
    8_192,
    128_000,
  );
  const response = await getOpenAI().responses.create({
    model: call.openaiModel,
    instructions: call.instructions,
    input: call.input,
    max_output_tokens: maxOutputTokens,
    reasoning: { effort: "medium" },
    store: false,
    text: {
      verbosity: "high",
      format: {
        type: "json_schema",
        name: "trailup_personalized_content_batch",
        description:
          "Capítulos personalizados completos, com roteiro de áudio e slides rastreáveis.",
        strict: true,
        schema: CONTENT_GENERATION_RESPONSE_SCHEMA,
      },
    },
  });

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

export function resetGeminiContentGenerationCircuit(): void {
  geminiUnavailableUntil = 0;
}

async function generateAfterPrimaryGeminiFailure(
  call: StructuredContentGenerationCall,
  reason: string,
  options: {
    generateWithOpenAI: StructuredContentGenerator;
    validateResult?: StructuredContentGenerationOptions["validateResult"];
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

  try {
    return {
      value: await generateAndValidate(
        options.generateWithOpenAI,
        call,
        "openai",
      ),
      provider: "openai",
      model: call.openaiModel,
      fallbackFrom: "gemini",
      fallbackReason: reason,
    };
  } catch (openaiError) {
    const openaiReason = errorDetails(openaiError).slice(0, 500);
    throw new Error(
      "A geração falhou no Gemini e a tentativa obrigatória pela OpenAI "
        + `também falhou. OpenAI: ${openaiReason}`,
      {
        cause: {
          gemini: reason,
          openai: openaiReason,
        },
      },
    );
  }
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
    if (
      error instanceof ContentGenerationQualityError
      || isGeminiAvailabilityError(error)
    ) {
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
    });
  }
}
