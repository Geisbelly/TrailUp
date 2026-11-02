// Segunda rodada só nas partes de áudio que falharam (#777, opção 1).
//
// Medido na turma 68 (01/11): o Gemini TTS gerou a maior parte das partes de
// cada perfil, mas bastava UMA parte sair sem voz ("A voz mística falhou em se
// materializar" / "400 Model tried to generate text") para o material inteiro
// sair `failed` — o Achiever, com 7 de 8 partes prontas, ficou sem áudio. As
// novas tentativas do ttsRecovery (2 s e 4 s) acontecem logo em seguida, na
// mesma janela em que o modelo em preview está devolvendo texto; uma segunda
// rodada mais tarde, só nessas partes, tem outra chance.
//
// Teto, porque o Gemini é só free tier (4 chaves): cada tentativa gasta a mesma
// cota diária. A rodada só acontece quando ela pode salvar o material:
// - todas as falhas são do tipo que passa sozinho (sem áudio, texto no lugar de
//   áudio, indisponível) — cota, crédito e bug não mudam em segundos;
// - e são poucas (até `maxParts`). Muitas partes falhando é sinal de problema
//   sistêmico, e repetir todas comeria a cota dos outros perfis.
// As partes rodam uma por vez, para não estourar RPM.

import { classifyTtsFailure, type TtsFailureKind } from "../services/ttsRecovery";

const RETRYABLE_KINDS: ReadonlySet<TtsFailureKind> = new Set([
  "no_audio",
  "text_instead_of_audio",
  "unavailable",
]);

export const DEFAULT_AUDIO_SECOND_ROUND_MAX_PARTS = 3;
export const DEFAULT_AUDIO_SECOND_ROUND_DELAY_MS = 10_000;

export interface AudioSecondRoundConfig {
  /** 0 desliga a segunda rodada. */
  maxParts: number;
  delayMs: number;
}

function nonNegativeInteger(value: unknown, fallback: number, maximum: number): number {
  if (value === undefined || value === null || String(value).trim() === "") return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0 || parsed > maximum) return fallback;
  return parsed;
}

export function resolveAudioSecondRoundConfig(
  environment: Record<string, string | undefined> = process.env,
): AudioSecondRoundConfig {
  return {
    maxParts: nonNegativeInteger(
      environment.CONTENT_GENERATION_AUDIO_SECOND_ROUND_MAX_PARTS,
      DEFAULT_AUDIO_SECOND_ROUND_MAX_PARTS,
      20,
    ),
    delayMs: nonNegativeInteger(
      environment.CONTENT_GENERATION_AUDIO_SECOND_ROUND_DELAY_MS,
      DEFAULT_AUDIO_SECOND_ROUND_DELAY_MS,
      120_000,
    ),
  };
}

/**
 * A falha que chega aqui pode ser a do Gemini ou a da reserva OpenAI, que
 * embrulha a do Gemini em `cause` ("reserva OpenAI falhou (...) depois do
 * Gemini: ..."). O que decide é a causa original no Gemini: sem crédito na
 * OpenAI, a resposta sem áudio do Gemini continua sendo a falha que passa.
 */
export function audioFailureKind(reason: unknown): TtsFailureKind {
  let current: unknown = reason;
  for (let depth = 0; depth < 5; depth += 1) {
    const cause = (current as { cause?: unknown } | null)?.cause;
    if (cause === undefined || cause === null) break;
    current = cause;
  }
  return classifyTtsFailure(current);
}

export type AudioSecondRoundOutcome =
  | { status: "not_needed" }
  | { status: "skipped"; reason: string; failedParts: number[] }
  | { status: "ran"; retriedParts: number[]; recoveredParts: number[] };

export async function retryFailedAudioParts<TPart, TAudio>(params: {
  parts: TPart[];
  settled: PromiseSettledResult<TAudio>[];
  generate: (part: TPart) => Promise<TAudio>;
  config: AudioSecondRoundConfig;
  sleep?: (ms: number) => Promise<void>;
}): Promise<{ settled: PromiseSettledResult<TAudio>[]; outcome: AudioSecondRoundOutcome }> {
  const sleep = params.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const failedIndexes = params.settled
    .map((result, index) => (result.status === "rejected" ? index : -1))
    .filter((index) => index >= 0);
  const failedParts = failedIndexes.map((index) => index + 1);

  if (failedIndexes.length === 0) {
    return { settled: params.settled, outcome: { status: "not_needed" } };
  }
  if (params.config.maxParts <= 0) {
    return { settled: params.settled, outcome: { status: "skipped", reason: "desligada", failedParts } };
  }
  const notRetryable = failedIndexes.filter((index) => {
    const result = params.settled[index] as PromiseRejectedResult;
    return !RETRYABLE_KINDS.has(audioFailureKind(result.reason));
  });
  if (notRetryable.length > 0) {
    return {
      settled: params.settled,
      outcome: {
        status: "skipped",
        reason: `falha que outra rodada não resolve na parte ${notRetryable.map((i) => i + 1).join(", ")}`,
        failedParts,
      },
    };
  }
  if (failedIndexes.length > params.config.maxParts) {
    return {
      settled: params.settled,
      outcome: {
        status: "skipped",
        reason: `${failedIndexes.length} partes falharam, acima do teto de ${params.config.maxParts}`,
        failedParts,
      },
    };
  }

  if (params.config.delayMs > 0) await sleep(params.config.delayMs);

  const settled = [...params.settled];
  const recoveredParts: number[] = [];
  for (const index of failedIndexes) {
    try {
      settled[index] = { status: "fulfilled", value: await params.generate(params.parts[index]) };
      recoveredParts.push(index + 1);
    } catch (error) {
      settled[index] = { status: "rejected", reason: error };
    }
  }
  return { settled, outcome: { status: "ran", retriedParts: failedParts, recoveredParts } };
}
