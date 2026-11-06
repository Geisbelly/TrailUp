// Recuperação do TTS do Guardião (#652).
//
// O áudio sai só do Gemini, na voz e com a direção do Guardião do perfil. NÃO
// existe voz de reserva, de propósito: entre 01/11 e 06/11 houve uma na OpenAI, e
// os sete Guardiões viravam duas vozes genéricas, sem as tags de tom e com uma
// pessoa só lendo o diálogo do Socializador. A decisão de produto é que aluno
// nenhum ouve voz que não seja a do Guardião. Sem cota, a parte fica como falha,
// com o motivo, e a próxima tentativa sintetiza só o que faltou.
//
// Aqui fica a política, separada da chamada ao Gemini para ser testável:
// - resposta sem áudio / texto no lugar de áudio: tenta de novo, e a partir
//   da segunda vez SEM as tags de tom ("[Tom: …]"). Na turma 66 a narração solo
//   (com tags) falhou em 12 de 21 partes e o diálogo (sem tags) em 0 de 5; a
//   tag não está provada como causa, mas é a diferença entre os dois pedidos,
//   e repetir o mesmo pedido idêntico logo em seguida pouco muda;
// - 429 de cota por minuto: mantém as esperas de antes (5/10/15 s), RPM volta
//   sozinho. 429 de cota DIÁRIA não espera: ela só volta à meia-noite do
//   Pacífico, e cada espera era mais uma chamada perdida em todas as chaves;
// - 402 de crédito esgotado: não espera nada, esperar não devolve crédito.

export type TtsFailureKind =
  | "billing"
  | "quota"
  | "unavailable"
  | "no_audio"
  | "text_instead_of_audio"
  | "other";

/** O Gemini respondeu 200 sem `inlineData` de áudio. */
export class TtsNoAudioError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TtsNoAudioError";
  }
}

function messageOf(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  try {
    return JSON.stringify(error) ?? "";
  } catch {
    return String(error);
  }
}

function statusOf(error: unknown): number | null {
  const status = (error as { status?: unknown } | null)?.status;
  return typeof status === "number" ? status : null;
}

export function classifyTtsFailure(error: unknown): TtsFailureKind {
  if (error instanceof TtsNoAudioError) return "no_audio";
  const message = messageOf(error).toLowerCase();
  if (message.includes("model tried to generate text")) return "text_instead_of_audio";
  // Antes da cota: o 402 também vem com RESOURCE_EXHAUSTED. E não dá para
  // procurar "billing" solto, porque o 429 diz "check your plan and billing details".
  if (
    statusOf(error) === 402
    || message.includes("\"code\":402")
    || message.includes("prepayment credits")
    || message.includes("credits are depleted")
  ) {
    return "billing";
  }
  if (
    statusOf(error) === 429
    || message.includes("429")
    || message.includes("quota")
    || message.includes("resource_exhausted")
  ) {
    return "quota";
  }
  if (
    statusOf(error) === 503
    || message.includes("503")
    || message.includes("unavailable")
    || message.includes("overloaded")
    || message.includes("high demand")
  ) {
    return "unavailable";
  }
  return "other";
}

/**
 * 429 da cota do DIA (quotaId "…PerDay…"): não volta em segundos. O texto do
 * erro do Gemini traz o quotaId que estourou.
 */
export function isDailyQuotaError(error: unknown): boolean {
  return classifyTtsFailure(error) === "quota" && /per\s*day/i.test(messageOf(error));
}

/** Causa original de um erro embrulhado em `cause`. */
export function rootCause(error: unknown): unknown {
  let current: unknown = error;
  for (let depth = 0; depth < 5; depth += 1) {
    const cause = (current as { cause?: unknown } | null)?.cause;
    if (cause === undefined || cause === null) break;
    current = cause;
  }
  return current;
}

const QUOTA_RETRY_DELAYS_MS = [5_000, 10_000, 15_000];
const NO_AUDIO_RETRY_DELAYS_MS = [2_000, 4_000];

export interface TtsRecoveryOptions<T> {
  /** "narração" ou "diálogo", só para o log. */
  label: string;
  /** `plain`: sintetizar sem as tags de tom (nova tentativa depois de resposta sem áudio). */
  synthesizeWithGemini: (attempt: { plain: boolean }) => Promise<T>;
  sleep?: (ms: number) => Promise<void>;
  warn?: (message: string) => void;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function synthesizeSpeechWithRecovery<T>(options: TtsRecoveryOptions<T>): Promise<T> {
  const sleep = options.sleep ?? defaultSleep;
  const warn = options.warn ?? ((message: string) => console.warn(message));
  let quotaRetries = 0;
  let noAudioRetries = 0;

  for (;;) {
    try {
      return await options.synthesizeWithGemini({ plain: noAudioRetries > 0 });
    } catch (error) {
      const kind = classifyTtsFailure(error);

      if (kind === "quota" && !isDailyQuotaError(error) && quotaRetries < QUOTA_RETRY_DELAYS_MS.length) {
        const delay = QUOTA_RETRY_DELAYS_MS[quotaRetries++];
        warn(`[brainhex] TTS ${options.label}: cota do Gemini — nova tentativa em ${delay / 1000}s`);
        await sleep(delay);
        continue;
      }
      if (
        (kind === "no_audio" || kind === "text_instead_of_audio")
        && noAudioRetries < NO_AUDIO_RETRY_DELAYS_MS.length
      ) {
        const delay = NO_AUDIO_RETRY_DELAYS_MS[noAudioRetries++];
        warn(`[brainhex] TTS ${options.label}: Gemini respondeu sem áudio (${kind}) — nova tentativa sem tags de tom em ${delay / 1000}s`);
        await sleep(delay);
        continue;
      }
      throw error;
    }
  }
}

/** Tira as marcas de direção ("[Tom: Calculista e pausado]") para a nova tentativa sem tags. */
export function stripToneTags(text: string): string {
  return String(text || "")
    .replace(/\[[^\]\n]{1,80}\]/g, " ")
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .trim();
}
