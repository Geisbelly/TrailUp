import OpenAI from "openai";

let _openai: OpenAI | null = null;
function getOpenAi(): OpenAI {
  if (_openai) return _openai;
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY ausente — configure no .env antes de chamar o serviço OpenAI.");
  }
  _openai = new OpenAI({ apiKey });
  return _openai;
}

type OpenAiImageGenerateArgs = {
  model: string;
  prompt: string;
  size: "1024x1024" | "1536x1024";
  n: 1;
  quality: "low" | "medium" | "high" | "auto";
};
type OpenAiImageGenerateResult = { data?: Array<{ b64_json?: string }> };

export interface OpenAiImageOverrides {
  now?: () => number;
  generate?: (args: OpenAiImageGenerateArgs) => Promise<OpenAiImageGenerateResult>;
  quality?: OpenAiImageGenerateArgs["quality"];
}

const DEFAULT_OPENAI_IMAGE_COOLDOWN_MS = 30 * 60 * 1_000;
let openaiImageUnavailableUntil = 0;

function errorText(error: unknown): string {
  if (error instanceof Error) return `${error.name} ${error.message}`.trim();
  try {
    return JSON.stringify(error);
  } catch {
    return String(error ?? "");
  }
}

function positiveInteger(value: unknown, fallback: number): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 24 * 60 * 60 * 1_000) {
    return fallback;
  }
  return parsed;
}

/** 400 "Billing hard limit has been reached" — teto de gasto da conta, não um rate-limit transitório: retry não ajuda. */
export function isOpenAiBillingHardLimitError(error: unknown): boolean {
  const record = typeof error === "object" && error !== null
    ? error as Record<string, unknown>
    : {};
  const status = Number(record.status ?? record.statusCode ?? record.code);
  const text = errorText(error).toLowerCase();
  if (status === 400 && text.includes("billing")) return true;
  return ["billing hard limit", "billing_hard_limit"].some((marker) => text.includes(marker));
}

export function resetOpenAiImageCircuit(): void {
  openaiImageUnavailableUntil = 0;
}

async function generateImageBase64(params: {
  prompt: string;
  prefix: string;
  size: "1024x1024" | "1536x1024";
  retries: number;
  attempt: number;
  now?: () => number;
  generate?: (args: OpenAiImageGenerateArgs) => Promise<OpenAiImageGenerateResult>;
  quality?: OpenAiImageGenerateArgs["quality"];
}): Promise<string> {
  const now = params.now ?? Date.now;
  if (now() < openaiImageUnavailableUntil) {
    throw new Error(
      "Geração de imagem via OpenAI em circuito de indisponibilidade: limite de billing "
      + "foi atingido recentemente, aguardando cooldown antes de tentar novamente.",
    );
  }

  const generate = params.generate ?? ((args) => getOpenAi().images.generate(args));
  const quality = params.quality
    ?? (String(process.env.OPENAI_IMAGE_QUALITY ?? "").trim() || "medium") as OpenAiImageGenerateArgs["quality"];

  try {
    const response = await generate({
      model: String(process.env.OPENAI_IMAGE_MODEL ?? "").trim() || "gpt-image-1",
      prompt: `${params.prefix}${params.prompt}`,
      size: params.size,
      n: 1,
      quality,
    });
    const b64 = response.data?.[0]?.b64_json;
    if (!b64) {
      throw new Error("OpenAI não retornou a imagem solicitada.");
    }
    return b64;
  } catch (error: any) {
    if (error?.message?.includes("OPENAI_API_KEY")) throw error;
    if (isOpenAiBillingHardLimitError(error)) {
      openaiImageUnavailableUntil = now() + positiveInteger(
        process.env.CONTENT_GENERATION_OPENAI_IMAGE_COOLDOWN_MS,
        DEFAULT_OPENAI_IMAGE_COOLDOWN_MS,
      );
      throw error;
    }
    const isRateLimit =
      error?.status === 429
      || error?.message?.includes("rate_limit")
      || error?.message?.includes("429");
    if (params.retries > 0 && isRateLimit) {
      const delay = (params.attempt + 1) * 5000;
      console.warn(
        `[openai] rate-limit — retry em ${delay / 1000}s `
        + `(${params.retries} restantes)`,
      );
      await new Promise((resolve) => setTimeout(resolve, delay));
      return generateImageBase64({
        ...params,
        retries: params.retries - 1,
        attempt: params.attempt + 1,
      });
    }
    throw error;
  }
}

/**
 * Gera a cena de fundo de um slide via OpenAI (gpt-image-1). Retorna o base64
 * cru da imagem (sem prefixo data:), mesmo contrato de generateSlideImage
 * (geminiService.ts) — assim os dois provedores compoem igual no HTML final.
 */
export async function generateSceneImage(
  prompt: string,
  retries = 3,
  attempt = 0,
  overrides: OpenAiImageOverrides = {},
): Promise<string | null> {
  return generateImageBase64({
    prompt,
    prefix:
        "Premium editorial background illustration for a professional 16:9 "
        + "presentation template. Cohesive art direction, sophisticated shapes, "
        + "clear focal hierarchy, clean negative space for overlaid content. "
        + "No words, no letters, no labels, no watermark, no interface, no "
        + "prebuilt slide border. Scene brief: ",
    size: "1536x1024",
    retries,
    attempt,
    ...overrides,
  });
}

/** Gera um ícone editorial isolado quando o provedor Gemini está indisponível. */
export async function generateDecorativeIconImage(
  prompt: string,
  retries = 3,
  attempt = 0,
  overrides: OpenAiImageOverrides = {},
): Promise<string> {
  return generateImageBase64({
    prompt,
    prefix:
      "Single premium editorial decorative icon for a professional presentation. "
      + "Centered isolated object, clean silhouette, cohesive vector-like concept "
      + "art, simple background, no words, no letters, no labels, no watermark. "
      + "Icon brief: ",
    size: "1024x1024",
    retries,
    attempt,
    ...overrides,
  });
}

/**
 * Gera o slide inteiro (fundo + titulo + corpo + identidade do perfil ja
 * embutidos no prompt) via OpenAI (gpt-image-1). Qualidade default "medium"
 * (OPENAI_SLIDE_IMAGE_QUALITY, nao OPENAI_IMAGE_QUALITY) — "high" gera um
 * payload base64 bem maior por slide, o que pressiona a memoria do processo
 * quando varios decks sao gerados ao mesmo tempo (ja causou crash-loop no
 * Render em produção); suba para "high" via env var só se a nitidez do texto
 * embutido não for suficiente em "medium".
 */
export async function generateFullSlideImage(
  prompt: string,
  retries = 3,
  attempt = 0,
  overrides: OpenAiImageOverrides = {},
): Promise<string> {
  const quality = overrides.quality
    ?? (String(process.env.OPENAI_SLIDE_IMAGE_QUALITY ?? "").trim() || "medium") as OpenAiImageGenerateArgs["quality"];
  return generateImageBase64({
    prompt,
    prefix:
      "Premium editorial presentation slide, complete and ready to use, for a "
      + "professional 16:9 template. Cohesive art direction, sophisticated "
      + "shapes, clear focal hierarchy, legible high-contrast typography "
      + "rendering the text below exactly as written (no spelling changes, "
      + "no extra words). Slide brief: ",
    size: "1536x1024",
    retries,
    attempt,
    ...overrides,
    quality,
  });
}
