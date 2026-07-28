import { generateSlideImage } from "./geminiService";
import { generateDecorativeIconImage } from "./openaiImageService";

const DEFAULT_GEMINI_IMAGE_COOLDOWN_MS = 60 * 60 * 1_000;
let geminiImageUnavailableUntil = 0;

function errorText(error: unknown): string {
  if (error instanceof Error) return `${error.name} ${error.message}`.trim();
  try {
    return JSON.stringify(error);
  } catch {
    return String(error ?? "");
  }
}

export function isGeminiImageAvailabilityError(error: unknown): boolean {
  const record = typeof error === "object" && error !== null
    ? error as Record<string, unknown>
    : {};
  const status = Number(record.status ?? record.statusCode ?? record.code);
  if (status === 429 || status >= 500) return true;
  const details = errorText(error).toLowerCase();
  return [
    "429",
    "resource_exhausted",
    "quota",
    "rate limit",
    "too many requests",
    "service unavailable",
    "temporarily unavailable",
  ].some((marker) => details.includes(marker));
}

function positiveInteger(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 24 * 60 * 60 * 1_000) {
    return fallback;
  }
  return parsed;
}

export function resetGeminiImageCircuit(): void {
  geminiImageUnavailableUntil = 0;
}

export async function generateSlideIconWithFallback(
  prompt: string,
  options: {
    now?: () => number;
    environment?: Record<string, string | undefined>;
    generateWithGemini?: (prompt: string) => Promise<string>;
    generateWithOpenAI?: (prompt: string) => Promise<string>;
  } = {},
): Promise<{ image: string; provider: "gemini" | "openai"; fallbackReason?: string }> {
  const now = options.now ?? Date.now;
  const environment = options.environment ?? process.env;
  const generateWithGemini = options.generateWithGemini
    ?? ((currentPrompt) => generateSlideImage(currentPrompt, 0));
  const generateWithOpenAI = options.generateWithOpenAI
    ?? generateDecorativeIconImage;

  if (now() < geminiImageUnavailableUntil) {
    return {
      image: await generateWithOpenAI(prompt),
      provider: "openai",
      fallbackReason: "circuito temporário de indisponibilidade da imagem Gemini",
    };
  }

  try {
    return {
      image: await generateWithGemini(prompt),
      provider: "gemini",
    };
  } catch (geminiError) {
    const reason = errorText(geminiError).slice(0, 500);
    if (isGeminiImageAvailabilityError(geminiError)) {
      geminiImageUnavailableUntil = now() + positiveInteger(
        environment.CONTENT_GENERATION_GEMINI_IMAGE_COOLDOWN_MS,
        DEFAULT_GEMINI_IMAGE_COOLDOWN_MS,
      );
    }
    try {
      return {
        image: await generateWithOpenAI(prompt),
        provider: "openai",
        fallbackReason: reason,
      };
    } catch (openaiError) {
      throw new Error(
        "A geração do ícone falhou no Gemini e na contingência OpenAI. "
        + `Gemini: ${reason}. OpenAI: ${errorText(openaiError).slice(0, 500)}`,
        { cause: { gemini: geminiError, openai: openaiError } },
      );
    }
  }
}
