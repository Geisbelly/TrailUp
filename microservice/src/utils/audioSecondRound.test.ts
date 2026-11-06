import { test } from "node:test";
import assert from "node:assert/strict";
import {
  audioFailureKind,
  DEFAULT_AUDIO_SECOND_ROUND_DELAY_MS,
  DEFAULT_AUDIO_SECOND_ROUND_MAX_PARTS,
  resolveAudioSecondRoundConfig,
  retryFailedAudioParts,
} from "./audioSecondRound";
import { TtsNoAudioError } from "../services/ttsRecovery";

// Os três jeitos como uma parte falhou na turma 68 em 01/11 (#777).
const SEM_AUDIO = new TtsNoAudioError("A voz mística falhou em se materializar.");
const TEXTO_NO_LUGAR = new Error('{"error":{"code":400,"message":"Model tried to generate text, but it should only be used for TTS."}}');
const EMBRULHADO = new Error("falha na parte 2", { cause: SEM_AUDIO });
const COTA = new Error('{"error":{"code":429,"message":"Quota exceeded for metric: generate_content_free_tier_requests"}}');

const ok = <T>(value: T): PromiseSettledResult<T> => ({ status: "fulfilled", value });
const falhou = (reason: unknown): PromiseSettledResult<string> => ({ status: "rejected", reason });

function semEspera() {
  const esperas: number[] = [];
  return { esperas, sleep: async (ms: number) => { esperas.push(ms); } };
}

const CONFIG = { maxParts: 3, delayMs: 10_000 };

test("audioFailureKind lê a causa no Gemini mesmo com o erro embrulhado", () => {
  assert.equal(audioFailureKind(EMBRULHADO), "no_audio");
  assert.equal(audioFailureKind(TEXTO_NO_LUGAR), "text_instead_of_audio");
  assert.equal(audioFailureKind(COTA), "quota");
});

test("Achiever 7/8: a parte que saiu sem voz é refeita sozinha e o perfil fica com áudio", async () => {
  const partes = ["p1", "p2", "p3", "p4", "p5", "p6", "p7", "p8"];
  const settled = partes.map((p) => (p === "p5" ? falhou(EMBRULHADO) : ok(`audio-${p}`)));
  const refeitas: string[] = [];
  const { esperas, sleep } = semEspera();

  const { settled: depois, outcome } = await retryFailedAudioParts({
    parts: partes,
    settled,
    generate: async (p) => { refeitas.push(p); return `audio-${p}-2a`; },
    config: CONFIG,
    sleep,
  });

  assert.deepEqual(refeitas, ["p5"], "só a parte que falhou é sintetizada de novo");
  assert.deepEqual(outcome, { status: "ran", retriedParts: [5], recoveredParts: [5] });
  assert.ok(depois.every((r) => r.status === "fulfilled"));
  assert.deepEqual(depois[4], ok("audio-p5-2a"));
  assert.deepEqual(depois[0], ok("audio-p1"), "parte pronta não é tocada");
  assert.deepEqual(esperas, [10_000]);
});

test("as partes da segunda rodada rodam uma por vez, para não estourar RPM", async () => {
  const partes = ["p1", "p2", "p3"];
  let emAndamento = 0;
  let pico = 0;
  await retryFailedAudioParts({
    parts: partes,
    settled: [falhou(SEM_AUDIO), falhou(TEXTO_NO_LUGAR), falhou(SEM_AUDIO)],
    generate: async (p) => {
      emAndamento += 1;
      pico = Math.max(pico, emAndamento);
      await new Promise((r) => setTimeout(r, 5));
      emAndamento -= 1;
      return p;
    },
    config: CONFIG,
    sleep: semEspera().sleep,
  });
  assert.equal(pico, 1);
});

test("parte que falha de novo continua rejeitada, com o motivo da segunda rodada", async () => {
  const novoMotivo = new TtsNoAudioError("A voz mística falhou de novo.");
  const { settled, outcome } = await retryFailedAudioParts({
    parts: ["p1", "p2"],
    settled: [ok("audio-p1"), falhou(SEM_AUDIO)],
    generate: async () => { throw novoMotivo; },
    config: CONFIG,
    sleep: semEspera().sleep,
  });
  assert.deepEqual(outcome, { status: "ran", retriedParts: [2], recoveredParts: [] });
  assert.deepEqual(settled[1], { status: "rejected", reason: novoMotivo });
});

test("acima do teto (Conqueror 6/7) não refaz nada: é sinal de problema sistêmico e comeria a cota", async () => {
  const partes = ["p1", "p2", "p3", "p4", "p5", "p6", "p7"];
  const settled = partes.map((p, i) => (i === 0 ? ok(`audio-${p}`) : falhou(SEM_AUDIO)));
  let chamadas = 0;
  const { esperas, sleep } = semEspera();
  const { settled: depois, outcome } = await retryFailedAudioParts({
    parts: partes,
    settled,
    generate: async (p) => { chamadas += 1; return p; },
    config: CONFIG,
    sleep,
  });
  assert.equal(chamadas, 0);
  assert.deepEqual(esperas, []);
  assert.equal(depois, settled);
  assert.deepEqual(outcome, {
    status: "skipped",
    reason: "6 partes falharam, acima do teto de 3",
    failedParts: [2, 3, 4, 5, 6, 7],
  });
});

test("falha de cota, crédito ou bug numa parte: nenhuma parte é refeita, porque o material falharia igual", async () => {
  for (const motivo of [COTA, new Error("Cannot read properties of undefined")]) {
    let chamadas = 0;
    const { outcome } = await retryFailedAudioParts({
      parts: ["p1", "p2", "p3"],
      settled: [falhou(SEM_AUDIO), ok("audio-p2"), falhou(motivo)],
      generate: async (p) => { chamadas += 1; return p; },
      config: CONFIG,
      sleep: semEspera().sleep,
    });
    assert.equal(chamadas, 0);
    assert.equal(outcome.status, "skipped");
    assert.match((outcome as { reason: string }).reason, /parte 3$/);
  }
});

test("sem falha não espera nada; teto 0 desliga a rodada", async () => {
  const { esperas, sleep } = semEspera();
  const semFalha = await retryFailedAudioParts({
    parts: ["p1"],
    settled: [ok("audio-p1")],
    generate: async (p) => p,
    config: CONFIG,
    sleep,
  });
  assert.deepEqual(semFalha.outcome, { status: "not_needed" });
  assert.deepEqual(esperas, []);

  let chamadas = 0;
  const desligada = await retryFailedAudioParts({
    parts: ["p1"],
    settled: [falhou(SEM_AUDIO)],
    generate: async (p) => { chamadas += 1; return p; },
    config: { maxParts: 0, delayMs: 10_000 },
    sleep,
  });
  assert.equal(chamadas, 0);
  assert.equal(desligada.outcome.status, "skipped");
});

test("resolveAudioSecondRoundConfig: padrão 3 partes e 10 s; aceita 0; ignora valor inválido", () => {
  assert.deepEqual(resolveAudioSecondRoundConfig({}), {
    maxParts: DEFAULT_AUDIO_SECOND_ROUND_MAX_PARTS,
    delayMs: DEFAULT_AUDIO_SECOND_ROUND_DELAY_MS,
  });
  assert.equal(resolveAudioSecondRoundConfig({ CONTENT_GENERATION_AUDIO_SECOND_ROUND_MAX_PARTS: "0" }).maxParts, 0);
  assert.equal(resolveAudioSecondRoundConfig({ CONTENT_GENERATION_AUDIO_SECOND_ROUND_MAX_PARTS: "5" }).maxParts, 5);
  assert.equal(resolveAudioSecondRoundConfig({ CONTENT_GENERATION_AUDIO_SECOND_ROUND_MAX_PARTS: "-1" }).maxParts, 3);
  assert.equal(resolveAudioSecondRoundConfig({ CONTENT_GENERATION_AUDIO_SECOND_ROUND_DELAY_MS: "abc" }).delayMs, 10_000);
});
