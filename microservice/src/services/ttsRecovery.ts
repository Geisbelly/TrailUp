// Recuperação do TTS do Guardião (#652).
//
// O TTS era só Gemini. Medido em produção (turma 68, 01/11): o texto dos 7
// perfis saiu, porque a geração de conteúdo tem contingência OpenAI, mas TODOS
// os áudios falharam com `402 Your prepayment credits are depleted` ou
// `429 ... generate_content_free_tier_requests` em todas as chaves. Na turma 66
// (16/10) a causa era outra: o modelo de TTS em preview respondia sem áudio
// ("A voz mística falhou em se materializar") ou com
// `400 Model tried to generate text, but it should only be used for TTS`.
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
// - 402 de crédito esgotado: não espera nada, esperar não devolve crédito;
// - esgotado o Gemini por qualquer um desses motivos: voz de reserva na OpenAI.
// Erro fora dessa lista (bug, rede) sobe como está: reserva não mascara bug.

import OpenAI from "openai";
import { registrarUso } from "../lib/usoDoModelo";

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

/** Causa original de um erro embrulhado (a reserva OpenAI embrulha o Gemini em `cause`). */
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
const MAX_GEMINI_REASON_IN_FALLBACK_ERROR = 200;

export interface TtsRecoveryOptions<T> {
  /** "narração" ou "diálogo", só para o log. */
  label: string;
  /** `plain`: sintetizar sem as tags de tom (nova tentativa depois de resposta sem áudio). */
  synthesizeWithGemini: (attempt: { plain: boolean }) => Promise<T>;
  /** null quando a reserva está desligada ou sem OPENAI_API_KEY. */
  synthesizeWithOpenAI: (() => Promise<T>) | null;
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
      if (kind === "other" || !options.synthesizeWithOpenAI) {
        throw error;
      }

      warn(`[brainhex] TTS ${options.label}: Gemini esgotado (${kind}) — usando a voz de reserva da OpenAI`);
      try {
        return await options.synthesizeWithOpenAI();
      } catch (fallbackError) {
        // A reserva vem primeiro: o failure_reason do material é cortado em
        // 400 caracteres, e a mensagem do Gemini sozinha já passa disso.
        throw new Error(
          `reserva OpenAI falhou (${messageOf(fallbackError)}) depois do Gemini: `
          + messageOf(error).slice(0, MAX_GEMINI_REASON_IN_FALLBACK_ERROR),
          { cause: error },
        );
      }
    }
  }
}

// ─── Voz de reserva (OpenAI) ────────────────────────────────────────────────

export const DEFAULT_OPENAI_TTS_MODEL = "gpt-4o-mini-tts";
/** Limite da API é 4096 caracteres por pedido; folga para não cortar no meio. */
export const OPENAI_TTS_MAX_INPUT_CHARS = 4_000;
const MAX_OPENAI_TTS_INSTRUCTIONS = 1_000;

export interface OpenAiTtsFallbackConfig {
  enabled: boolean;
  model: string;
}

/** Ligada por padrão, como CONTENT_GENERATION_ENABLE_OPENAI_FALLBACK; sem chave, desligada. */
export function resolveOpenAiTtsFallback(
  environment: Record<string, string | undefined> = process.env,
): OpenAiTtsFallbackConfig {
  const flag = String(environment.TTS_ENABLE_OPENAI_FALLBACK ?? "true").trim().toLowerCase();
  const hasKey = String(environment.OPENAI_API_KEY ?? "").trim().length > 0;
  return {
    enabled: hasKey && !["false", "0", "no", "off"].includes(flag),
    model: String(environment.OPENAI_TTS_MODEL ?? "").trim() || DEFAULT_OPENAI_TTS_MODEL,
  };
}

// Vozes Gemini femininas dos Guardiões (guardianVoices.ts) e a voz OpenAI que
// faz as vezes delas. A direção de voz vai junto em `instructions`.
const GEMINI_FEMALE_VOICES = new Set(["Kore", "Zephyr", "Aoede", "Leda", "Sulafat"]);

export function openAiVoiceFor(geminiVoice: string): string {
  return GEMINI_FEMALE_VOICES.has(geminiVoice) ? "coral" : "ash";
}

/**
 * Tira do roteiro o que só o Gemini sabe interpretar: as marcas de direção
 * ("[Tom: Calculista e pausado]") e, no diálogo, o prefixo "Mateo: " de cada
 * fala. A OpenAI leria os dois em voz alta. Só remove o prefixo dos nomes
 * informados — "Lembre-se: ..." no começo de uma linha é texto.
 */
export function prepareTextForOpenAiTts(text: string, speakerNames: string[] = []): string {
  let prepared = String(text || "").replace(/\[[^\]\n]{1,80}\]/g, " ");
  for (const name of speakerNames) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    prepared = prepared.replace(new RegExp(`^\\s*${escaped}:\\s*`, "gm"), "");
  }
  return prepared
    .split("\n")
    .map((line) => line.replace(/[ \t]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** Corta em pedaços de até `max` caracteres, preferindo fim de frase e depois espaço. */
export function splitForOpenAiTts(text: string, max = OPENAI_TTS_MAX_INPUT_CHARS): string[] {
  const pieces = String(text || "")
    .split(/(?<=[.!?…])\s+|\n+/)
    .map((piece) => piece.trim())
    .filter(Boolean);
  const chunks: string[] = [];
  let current = "";
  for (let piece of pieces) {
    while (piece.length > max) {
      if (current) {
        chunks.push(current);
        current = "";
      }
      const space = piece.lastIndexOf(" ", max);
      const cut = space > max / 2 ? space : max;
      chunks.push(piece.slice(0, cut).trim());
      piece = piece.slice(cut).trim();
    }
    if (!piece) continue;
    const next = current ? `${current} ${piece}` : piece;
    if (next.length > max) {
      chunks.push(current);
      current = piece;
    } else {
      current = next;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

/** O pedaço da API que usamos — os testes passam um falso. */
export interface OpenAiSpeechClient {
  audio: {
    speech: {
      create(body: {
        model: string;
        voice: string;
        input: string;
        instructions?: string;
        response_format: "pcm";
      }): Promise<{ arrayBuffer(): Promise<ArrayBuffer> }>;
    };
  };
}

let openAiSpeechClient: OpenAiSpeechClient | null = null;

function getOpenAiSpeechClient(): OpenAiSpeechClient {
  if (!openAiSpeechClient) {
    openAiSpeechClient = new OpenAI({ apiKey: String(process.env.OPENAI_API_KEY ?? "").trim() }) as unknown as OpenAiSpeechClient;
  }
  return openAiSpeechClient;
}

/**
 * Sintetiza na OpenAI em PCM cru 24 kHz/16 bit/mono — o mesmo formato que o
 * Gemini devolve —, então o resultado entra no mesmo encodePcmToWavAndMp3 e
 * pode ser emendado com capítulos que saíram do Gemini (joinAudioChapters).
 */
export async function synthesizeOpenAiPcm(params: {
  text: string;
  voice: string;
  instructions?: string;
  model?: string;
  client?: OpenAiSpeechClient;
}): Promise<Uint8Array> {
  const client = params.client ?? getOpenAiSpeechClient();
  const model = params.model ?? resolveOpenAiTtsFallback().model;
  const instructions = String(params.instructions ?? "").trim().slice(0, MAX_OPENAI_TTS_INSTRUCTIONS);
  const chunks = splitForOpenAiTts(params.text);
  if (chunks.length === 0) {
    throw new Error("roteiro vazio para a voz de reserva");
  }
  const pcmParts: Uint8Array[] = [];
  for (const input of chunks) {
    const response = await client.audio.speech.create({
      model,
      voice: params.voice,
      input,
      ...(instructions ? { instructions } : {}),
      response_format: "pcm",
    });
    // A voz da OpenAI cobra por caractere e não devolve tokens.
    registrarUso(model, { caracteres: input.length });
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (bytes.length === 0) {
      throw new Error("OpenAI TTS respondeu sem áudio");
    }
    pcmParts.push(bytes);
  }
  const total = pcmParts.reduce((sum, part) => sum + part.length, 0);
  const pcm = new Uint8Array(total);
  let offset = 0;
  for (const part of pcmParts) {
    pcm.set(part, offset);
    offset += part.length;
  }
  return pcm;
}
