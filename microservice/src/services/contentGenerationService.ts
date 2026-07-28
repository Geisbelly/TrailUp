import OpenAI from "openai";

export const DEFAULT_GEMINI_CONTENT_GENERATION_MODEL =
  "gemini-3-flash-preview" as const;
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
  return String(environment.CONTENT_GENERATION_MODEL ?? "").trim()
    || DEFAULT_GEMINI_CONTENT_GENERATION_MODEL;
}

export function resolveOpenAIContentGenerationFallbackModel(
  environment: Record<string, string | undefined> = process.env,
): string {
  return String(
    environment.OPENAI_CONTENT_GENERATION_FALLBACK_MODEL
      ?? environment.OPENAI_CONTENT_ENRICHMENT_MODEL
      ?? "",
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
  if (status === 408 || status === 429 || status >= 500) return true;

  const details = errorDetails(error).toLowerCase();
  return [
    "429",
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

export async function generateStructuredContentWithFallback(
  call: StructuredContentGenerationCall,
  options: StructuredContentGenerationOptions,
): Promise<StructuredContentGenerationResult> {
  const environment = options.environment ?? process.env;
  const now = options.now ?? Date.now;
  const generateWithOpenAI =
    options.generateWithOpenAI ?? generateStructuredWithOpenAI;

  if (now() < geminiUnavailableUntil) {
    return {
      value: await generateWithOpenAI(call),
      provider: "openai",
      model: call.openaiModel,
      fallbackFrom: "gemini",
      fallbackReason: "circuito temporário de indisponibilidade do Gemini",
    };
  }

  try {
    return {
      value: await options.generateWithGemini(call),
      provider: "gemini",
      model: call.geminiModel,
    };
  } catch (error) {
    if (!isGeminiAvailabilityError(error)) throw error;

    const cooldownMs = positiveInteger(
      environment.CONTENT_GENERATION_GEMINI_COOLDOWN_MS,
      DEFAULT_GEMINI_UNAVAILABLE_COOLDOWN_MS,
      1_000,
      60 * 60 * 1_000,
    );
    geminiUnavailableUntil = now() + cooldownMs;
    const reason = errorDetails(error).slice(0, 500);

    try {
      return {
        value: await generateWithOpenAI(call),
        provider: "openai",
        model: call.openaiModel,
        fallbackFrom: "gemini",
        fallbackReason: reason,
      };
    } catch (fallbackError) {
      throw new Error(
        "Gemini está indisponível e a contingência OpenAI também falhou.",
        {
          cause: {
            gemini: reason,
            openai: errorDetails(fallbackError),
          },
        },
      );
    }
  }
}
