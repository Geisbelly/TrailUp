import { test } from "node:test";
import assert from "node:assert/strict";
import {
  classifyTtsFailure,
  isDailyQuotaError,
  rootCause,
  stripToneTags,
  synthesizeSpeechWithRecovery,
  TtsNoAudioError,
} from "./ttsRecovery";

// Mensagens como chegaram em materiais.audio.metadata.failure_reason (turma 68,
// 01/11, e turma 66, 16/10) — não inventadas.
const ERRO_402 = new Error(
  '{"error":{"code":402,"message":"Your prepayment credits are depleted. Please go to AI Studio at '
  + 'https://ai.studio/projects to manage your project and billing.","status":"RESOURCE_EXHAUSTED"}}',
);
const ERRO_429 = new Error(
  '{"error":{"code":429,"message":"You exceeded your current quota, please check your plan and billing '
  + 'details. Quota exceeded for metric: generativelanguage.googleapis.com/generate_content_free_tier_requests"}}',
);
const ERRO_400_TEXTO = new Error(
  '{"error":{"code":400,"message":"Model tried to generate text, but it should only be used for TTS."}}',
);

function semEspera() {
  const esperas: number[] = [];
  return { esperas, sleep: async (ms: number) => { esperas.push(ms); } };
}

test("classifyTtsFailure separa crédito esgotado (402) de cota (429), mesmo com 'billing' no texto do 429", () => {
  assert.equal(classifyTtsFailure(ERRO_402), "billing");
  assert.equal(classifyTtsFailure(ERRO_429), "quota");
  assert.equal(classifyTtsFailure(Object.assign(new Error("payment required"), { status: 402 })), "billing");
});

test("classifyTtsFailure reconhece resposta sem áudio e texto no lugar de áudio", () => {
  assert.equal(classifyTtsFailure(new TtsNoAudioError("A voz mística falhou em se materializar.")), "no_audio");
  assert.equal(classifyTtsFailure(ERRO_400_TEXTO), "text_instead_of_audio");
  assert.equal(classifyTtsFailure(new Error("503 UNAVAILABLE: high demand")), "unavailable");
  assert.equal(classifyTtsFailure(new TypeError("Cannot read properties of undefined")), "other");
});

test("402: não espera nem repete o Gemini, e o erro sobe intacto (é o que vira failure_reason)", async () => {
  const { esperas, sleep } = semEspera();
  let gemini = 0;
  await assert.rejects(
    synthesizeSpeechWithRecovery({
      label: "narração",
      synthesizeWithGemini: async () => { gemini += 1; throw ERRO_402; },
      sleep,
      warn: () => {},
    }),
    (error) => error === ERRO_402,
  );
  assert.equal(gemini, 1);
  assert.deepEqual(esperas, []);
});

test("429: mantém as três esperas de antes (5/10/15 s) e depois falha com o erro do Gemini", async () => {
  const { esperas, sleep } = semEspera();
  let gemini = 0;
  await assert.rejects(
    synthesizeSpeechWithRecovery({
      label: "narração",
      synthesizeWithGemini: async () => { gemini += 1; throw ERRO_429; },
      sleep,
      warn: () => {},
    }),
    (error) => error === ERRO_429,
  );
  assert.equal(gemini, 4);
  assert.deepEqual(esperas, [5_000, 10_000, 15_000]);
});

test("429 que passa na segunda tentativa devolve o áudio do Gemini", async () => {
  const { sleep } = semEspera();
  let gemini = 0;
  const resultado = await synthesizeSpeechWithRecovery({
    label: "narração",
    synthesizeWithGemini: async () => {
      gemini += 1;
      if (gemini === 1) throw ERRO_429;
      return "audio-gemini";
    },
    sleep,
    warn: () => {},
  });
  assert.equal(resultado, "audio-gemini");
  assert.equal(gemini, 2);
});

test("resposta sem áudio (causa de 16/10) é repetida e passa", async () => {
  const { esperas, sleep } = semEspera();
  let gemini = 0;
  const resultado = await synthesizeSpeechWithRecovery({
    label: "narração",
    synthesizeWithGemini: async () => {
      gemini += 1;
      if (gemini === 1) throw new TtsNoAudioError("A voz mística falhou em se materializar.");
      if (gemini === 2) throw ERRO_400_TEXTO;
      return "audio-gemini";
    },
    sleep,
    warn: () => {},
  });
  assert.equal(resultado, "audio-gemini");
  assert.equal(gemini, 3);
  assert.deepEqual(esperas, [2_000, 4_000]);
});

test("sem áudio repetido além do limite falha, sem outra voz no lugar", async () => {
  const { sleep } = semEspera();
  let gemini = 0;
  await assert.rejects(
    synthesizeSpeechWithRecovery({
      label: "diálogo",
      synthesizeWithGemini: async () => { gemini += 1; throw new TtsNoAudioError("vazio"); },
      sleep,
      warn: () => {},
    }),
    TtsNoAudioError,
  );
  assert.equal(gemini, 3);
});

test("erro fora da lista (bug, rede) sobe como está, sem repetir", async () => {
  const { esperas, sleep } = semEspera();
  const bug = new TypeError("Cannot read properties of undefined");
  await assert.rejects(
    synthesizeSpeechWithRecovery({
      label: "narração",
      synthesizeWithGemini: async () => { throw bug; },
      sleep,
      warn: () => {},
    }),
    (error) => error === bug,
  );
  assert.deepEqual(esperas, []);
});

test("stripToneTags tira as marcas de tom e mantém os falantes e as quebras de linha", () => {
  assert.equal(
    stripToneTags("[Tom: Sereno] Olá.\nMateo: [Tom: Alegre] Oi, Zuri!"),
    "Olá.\nMateo: Oi, Zuri!",
  );
});

// Cota do DIA, como o Gemini a descreve no 429 (quotaId com "PerDay").
const ERRO_429_DIA = new Error(
  '{"error":{"code":429,"message":"You exceeded your current quota. Quota exceeded for metric: '
  + 'generativelanguage.googleapis.com/generate_content_free_tier_requests, limit: 10","details":[{"quotaId":'
  + '"GenerateRequestsPerDayPerProjectPerModel-FreeTier"}]}}',
);

test("isDailyQuotaError separa a cota do dia da cota por minuto", () => {
  assert.equal(isDailyQuotaError(ERRO_429_DIA), true);
  assert.equal(isDailyQuotaError(ERRO_429), false);
  assert.equal(isDailyQuotaError(new TtsNoAudioError("vazio")), false);
});

test("cota do dia esgotada falha na hora, sem as esperas de 5/10/15 s (turma 68, 02/11)", async () => {
  const { esperas, sleep } = semEspera();
  let gemini = 0;
  await assert.rejects(
    synthesizeSpeechWithRecovery({
      label: "narração",
      synthesizeWithGemini: async () => { gemini += 1; throw ERRO_429_DIA; },
      sleep,
      warn: () => {},
    }),
    (error) => error === ERRO_429_DIA,
  );
  assert.equal(gemini, 1);
  assert.deepEqual(esperas, []);
});

test("depois de uma resposta sem áudio, a nova tentativa vai sem as tags de tom", async () => {
  const { sleep } = semEspera();
  const pedidos: boolean[] = [];
  await synthesizeSpeechWithRecovery({
    label: "narração",
    synthesizeWithGemini: async ({ plain }) => {
      pedidos.push(plain);
      if (pedidos.length < 3) throw new TtsNoAudioError("vazio");
      return "audio";
    },
    sleep,
    warn: () => {},
  });
  assert.deepEqual(pedidos, [false, true, true]);
});

test("rootCause chega ao erro original embrulhado em cause", () => {
  const embrulhado = new Error("falha na parte 2", { cause: ERRO_429_DIA });
  assert.equal(rootCause(embrulhado), ERRO_429_DIA);
  assert.equal(rootCause(ERRO_429), ERRO_429);
});
