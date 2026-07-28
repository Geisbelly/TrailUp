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

/**
 * Gera a cena de fundo de um slide via OpenAI (gpt-image-1). Retorna o base64
 * cru da imagem (sem prefixo data:), mesmo contrato de generateSlideImage
 * (geminiService.ts) — assim os dois provedores compoem igual no HTML final.
 */
export async function generateSceneImage(prompt: string, retries = 3, attempt = 0): Promise<string | null> {
  try {
    const response = await getOpenAi().images.generate({
      model: "gpt-image-1",
      prompt:
        "Premium editorial background illustration for a professional 16:9 "
        + "presentation template. Cohesive art direction, sophisticated shapes, "
        + "clear focal hierarchy, clean negative space for overlaid content. "
        + "No words, no letters, no labels, no watermark, no interface, no "
        + `prebuilt slide border. Scene brief: ${prompt}`,
      size: "1536x1024",
      n: 1,
    });
    const b64 = response.data?.[0]?.b64_json;
    if (!b64) throw new Error("A cena mística falhou em se materializar (OpenAI não retornou imagem).");
    return b64;
  } catch (error: any) {
    if (error?.message?.includes("OPENAI_API_KEY")) throw error;
    const isRateLimit =
      error?.status === 429 ||
      error?.message?.includes("rate_limit") ||
      error?.message?.includes("429");
    if (retries > 0 && isRateLimit) {
      // Backoff cresce por tentativa (nao pelo `retries` restante, que pode
      // partir de qualquer valor passado pelo chamador) — 5s, 10s, 15s...
      const delay = (attempt + 1) * 5000;
      console.warn(`[openai] rate-limit — retry em ${delay / 1000}s (${retries} restantes)`);
      await new Promise((r) => setTimeout(r, delay));
      return generateSceneImage(prompt, retries - 1, attempt + 1);
    }
    throw error;
  }
}
