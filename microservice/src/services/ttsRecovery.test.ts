import { test } from "node:test";
import assert from "node:assert/strict";
import {
  classifyTtsFailure,
  openAiVoiceFor,
  OPENAI_TTS_MAX_INPUT_CHARS,
  prepareTextForOpenAiTts,
  resolveOpenAiTtsFallback,
  splitForOpenAiTts,
  synthesizeOpenAiPcm,
  synthesizeSpeechWithRecovery,
  TtsNoAudioError,
  type OpenAiSpeechClient,
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

test("402: não espera nem repete o Gemini, vai direto para a reserva", async () => {
  const { esperas, sleep } = semEspera();
  let gemini = 0;
  let openai = 0;
  const resultado = await synthesizeSpeechWithRecovery({
    label: "narração",
    synthesizeWithGemini: async () => { gemini += 1; throw ERRO_402; },
    synthesizeWithOpenAI: async () => { openai += 1; return "audio-openai"; },
    sleep,
    warn: () => {},
  });
  assert.equal(resultado, "audio-openai");
  assert.equal(gemini, 1);
  assert.equal(openai, 1);
  assert.deepEqual(esperas, []);
});

test("429: mantém as três esperas de antes (5/10/15 s) e só então usa a reserva", async () => {
  const { esperas, sleep } = semEspera();
  let gemini = 0;
  const resultado = await synthesizeSpeechWithRecovery({
    label: "narração",
    synthesizeWithGemini: async () => { gemini += 1; throw ERRO_429; },
    synthesizeWithOpenAI: async () => "audio-openai",
    sleep,
    warn: () => {},
  });
  assert.equal(resultado, "audio-openai");
  assert.equal(gemini, 4);
  assert.deepEqual(esperas, [5_000, 10_000, 15_000]);
});

test("429 que passa na segunda tentativa não chega a chamar a reserva", async () => {
  const { sleep } = semEspera();
  let gemini = 0;
  let openai = 0;
  const resultado = await synthesizeSpeechWithRecovery({
    label: "narração",
    synthesizeWithGemini: async () => {
      gemini += 1;
      if (gemini === 1) throw ERRO_429;
      return "audio-gemini";
    },
    synthesizeWithOpenAI: async () => { openai += 1; return "audio-openai"; },
    sleep,
    warn: () => {},
  });
  assert.equal(resultado, "audio-gemini");
  assert.equal(openai, 0);
});

test("resposta sem áudio (causa de 16/10) é repetida e passa sem precisar da reserva", async () => {
  const { esperas, sleep } = semEspera();
  let gemini = 0;
  let openai = 0;
  const resultado = await synthesizeSpeechWithRecovery({
    label: "narração",
    synthesizeWithGemini: async () => {
      gemini += 1;
      if (gemini === 1) throw new TtsNoAudioError("A voz mística falhou em se materializar.");
      if (gemini === 2) throw ERRO_400_TEXTO;
      return "audio-gemini";
    },
    synthesizeWithOpenAI: async () => { openai += 1; return "audio-openai"; },
    sleep,
    warn: () => {},
  });
  assert.equal(resultado, "audio-gemini");
  assert.equal(gemini, 3);
  assert.equal(openai, 0);
  assert.deepEqual(esperas, [2_000, 4_000]);
});

test("sem áudio repetido além do limite cai na reserva", async () => {
  const { sleep } = semEspera();
  let gemini = 0;
  const resultado = await synthesizeSpeechWithRecovery({
    label: "diálogo",
    synthesizeWithGemini: async () => { gemini += 1; throw new TtsNoAudioError("vazio"); },
    synthesizeWithOpenAI: async () => "audio-openai",
    sleep,
    warn: () => {},
  });
  assert.equal(resultado, "audio-openai");
  assert.equal(gemini, 3);
});

test("erro fora da lista (bug, rede) sobe como está, sem repetir e sem reserva", async () => {
  const { esperas, sleep } = semEspera();
  const bug = new TypeError("Cannot read properties of undefined");
  let openai = 0;
  await assert.rejects(
    synthesizeSpeechWithRecovery({
      label: "narração",
      synthesizeWithGemini: async () => { throw bug; },
      synthesizeWithOpenAI: async () => { openai += 1; return "audio-openai"; },
      sleep,
      warn: () => {},
    }),
    (error) => error === bug,
  );
  assert.equal(openai, 0);
  assert.deepEqual(esperas, []);
});

test("sem reserva configurada, o erro do Gemini sobe intacto (é o que vira failure_reason)", async () => {
  const { sleep } = semEspera();
  await assert.rejects(
    synthesizeSpeechWithRecovery({
      label: "narração",
      synthesizeWithGemini: async () => { throw ERRO_402; },
      synthesizeWithOpenAI: null,
      sleep,
      warn: () => {},
    }),
    (error) => error === ERRO_402,
  );
});

test("reserva que também falha leva os dois motivos, o da OpenAI primeiro (o failure_reason corta em 400)", async () => {
  const { sleep } = semEspera();
  await assert.rejects(
    synthesizeSpeechWithRecovery({
      label: "narração",
      synthesizeWithGemini: async () => { throw ERRO_402; },
      synthesizeWithOpenAI: async () => { throw new Error("insufficient_quota"); },
      sleep,
      warn: () => {},
    }),
    (error: unknown) => {
      const message = (error as Error).message;
      assert.ok(message.startsWith("reserva OpenAI falhou (insufficient_quota)"), message);
      assert.ok(message.includes("402"), message);
      return true;
    },
  );
});

test("resolveOpenAiTtsFallback: ligada por padrão com chave, desligada sem chave ou pela flag", () => {
  assert.deepEqual(resolveOpenAiTtsFallback({ OPENAI_API_KEY: "sk-x" }), { enabled: true, model: "gpt-4o-mini-tts" });
  assert.equal(resolveOpenAiTtsFallback({ OPENAI_API_KEY: "" }).enabled, false);
  assert.equal(resolveOpenAiTtsFallback({ OPENAI_API_KEY: "sk-x", TTS_ENABLE_OPENAI_FALLBACK: "false" }).enabled, false);
  assert.equal(resolveOpenAiTtsFallback({ OPENAI_API_KEY: "sk-x", OPENAI_TTS_MODEL: "tts-1" }).model, "tts-1");
});

test("openAiVoiceFor mantém o gênero do Guardião", () => {
  assert.equal(openAiVoiceFor("Leda"), "coral");
  assert.equal(openAiVoiceFor("Kore"), "coral");
  assert.equal(openAiVoiceFor("Charon"), "ash");
  assert.equal(openAiVoiceFor("Orus"), "ash");
});

test("prepareTextForOpenAiTts tira as marcas de tom e só os prefixos dos falantes informados", () => {
  const roteiro = "[Tom: Calculista e pausado] Saudações.\nMateo: Olá, Zuri!\nZuri: Oi, Mateo.\nLembre-se: partes iguais.";
  assert.equal(
    prepareTextForOpenAiTts(roteiro, ["Mateo", "Zuri"]),
    "Saudações.\nOlá, Zuri!\nOi, Mateo.\nLembre-se: partes iguais.",
  );
  assert.equal(prepareTextForOpenAiTts("Mateo: Olá"), "Mateo: Olá");
});

test("splitForOpenAiTts respeita o limite da API e não perde texto", () => {
  const frase = "Uma fração representa partes iguais de um todo. ";
  const texto = frase.repeat(300);
  const pedacos = splitForOpenAiTts(texto);
  assert.ok(pedacos.length > 1);
  for (const pedaco of pedacos) assert.ok(pedaco.length <= OPENAI_TTS_MAX_INPUT_CHARS, String(pedaco.length));
  assert.equal(pedacos.join(" ").replace(/\s+/g, " "), texto.trim().replace(/\s+/g, " "));

  const semEspaco = "a".repeat(OPENAI_TTS_MAX_INPUT_CHARS + 10);
  assert.deepEqual(splitForOpenAiTts(semEspaco).map((p) => p.length), [OPENAI_TTS_MAX_INPUT_CHARS, 10]);
});

test("synthesizeOpenAiPcm pede PCM (mesmo formato do Gemini) e emenda os pedaços na ordem", async () => {
  const pedidos: Array<Record<string, unknown>> = [];
  const client: OpenAiSpeechClient = {
    audio: {
      speech: {
        create: async (body) => {
          pedidos.push(body);
          const n = pedidos.length;
          return { arrayBuffer: async () => new Uint8Array([n, n]).buffer };
        },
      },
    },
  };
  const texto = "Primeira frase longa. ".repeat(250);
  const pcm = await synthesizeOpenAiPcm({ text: texto, voice: "ash", instructions: "voz serena", model: "gpt-4o-mini-tts", client });
  assert.equal(pedidos.length, splitForOpenAiTts(texto).length);
  assert.ok(pedidos.length > 1);
  for (const pedido of pedidos) {
    assert.equal(pedido.response_format, "pcm");
    assert.equal(pedido.voice, "ash");
    assert.equal(pedido.model, "gpt-4o-mini-tts");
    assert.equal(pedido.instructions, "voz serena");
  }
  assert.deepEqual(Array.from(pcm.slice(0, 4)), [1, 1, 2, 2]);
});

test("synthesizeOpenAiPcm recusa resposta vazia em vez de gravar áudio mudo", async () => {
  const client: OpenAiSpeechClient = {
    audio: { speech: { create: async () => ({ arrayBuffer: async () => new ArrayBuffer(0) }) } },
  };
  await assert.rejects(
    synthesizeOpenAiPcm({ text: "Olá.", voice: "coral", model: "gpt-4o-mini-tts", client }),
    /sem áudio/,
  );
});
