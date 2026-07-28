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

async function generateImageBase64(params: {
  prompt: string;
  prefix: string;
  size: "1024x1024" | "1536x1024";
  retries: number;
  attempt: number;
}): Promise<string> {
  try {
    const response = await getOpenAi().images.generate({
      model: String(process.env.OPENAI_IMAGE_MODEL ?? "").trim() || "gpt-image-1",
      prompt: `${params.prefix}${params.prompt}`,
      size: params.size,
      n: 1,
    });
    const b64 = response.data?.[0]?.b64_json;
    if (!b64) {
      throw new Error("OpenAI não retornou a imagem solicitada.");
    }
    return b64;
  } catch (error: any) {
    if (error?.message?.includes("OPENAI_API_KEY")) throw error;
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
export async function generateSceneImage(prompt: string, retries = 3, attempt = 0): Promise<string | null> {
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
  });
}

/** Gera um ícone editorial isolado quando o provedor Gemini está indisponível. */
export async function generateDecorativeIconImage(
  prompt: string,
  retries = 3,
  attempt = 0,
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
  });
}
