import { test } from "node:test";
import assert from "node:assert/strict";

// Ponta a ponta do TTS com a rede falsa: o SDK do Gemini e o da OpenAI saem
// pelo fetch global. Reproduz a turma 68 (01/11): toda chamada ao Gemini
// responde 402 de crédito esgotado.
process.env.GEMINI_API_KEY = "chave-gemini-teste";
process.env.OPENAI_API_KEY = "sk-teste";
delete process.env.TTS_ENABLE_OPENAI_FALLBACK;

const ERRO_402 = {
  error: {
    code: 402,
    message: "Your prepayment credits are depleted. Please go to AI Studio at https://ai.studio/projects to manage your project and billing.",
    status: "RESOURCE_EXHAUSTED",
  },
};

type Pedido = { url: string; body: Record<string, unknown> | null };

// Uma rede falsa só para o arquivo: o cliente da OpenAI guarda o fetch de
// quando é criado, então trocar o fetch por teste não chegaria nele.
const pedidos: Pedido[] = [];
let pcmOpenAi = new Uint8Array(0);
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const raw = init?.body ?? (input instanceof Request ? await input.clone().text() : null);
  let body: Record<string, unknown> | null = null;
  try {
    body = typeof raw === "string" ? JSON.parse(raw) : null;
  } catch {
    body = null;
  }
  pedidos.push({ url, body });
  if (url.includes("generativelanguage.googleapis.com")) {
    return new Response(JSON.stringify(ERRO_402), { status: 402, headers: { "content-type": "application/json" } });
  }
  if (url.includes("/audio/speech")) {
    return new Response(pcmOpenAi, { status: 200, headers: { "content-type": "application/octet-stream" } });
  }
  return new Response("rota inesperada no teste", { status: 500 });
}) as typeof fetch;

function prepararRede(pcm: Uint8Array) {
  pedidos.length = 0;
  pcmOpenAi = pcm;
}

test("Gemini com crédito esgotado (402): a narração sai pela voz de reserva da OpenAI, sem esperas", async () => {
  const { generateNaturalAudio, resetGeminiKeyRotationForTests } = await import("./geminiService");
  resetGeminiKeyRotationForTests();
  const pcm = new Uint8Array(4800).fill(1); // 0,1 s de PCM 24 kHz/16 bit
  prepararRede(pcm);
  const inicio = Date.now();
  const audio = await generateNaturalAudio("[Tom: Sereno] Uma fração é parte de um todo.", "Charon", "voz serena");
  assert.ok(audio.wav.length > 0);
  assert.ok(audio.mp3);
  // WAV = 44 bytes de cabeçalho + o PCM que a OpenAI devolveu.
  assert.equal(Buffer.from(audio.wav, "base64").length, 44 + pcm.length);
  assert.ok(Date.now() - inicio < 4_000, "402 não deveria esperar 5/10/15 s");

  const gemini = pedidos.filter((p) => p.url.includes("generativelanguage"));
  const openai = pedidos.filter((p) => p.url.includes("/audio/speech"));
  assert.ok(gemini.length >= 1, "o Gemini precisa ser tentado primeiro");
  assert.equal(openai.length, 1);
  assert.equal(openai[0].body?.response_format, "pcm");
  assert.equal(openai[0].body?.voice, "ash");
  assert.equal(openai[0].body?.input, "Uma fração é parte de um todo.");
});

test("diálogo do Socializer com crédito esgotado: reserva lê as falas sem os prefixos 'Mateo:'/'Zuri:'", async () => {
  const { generateConversationalAudio, resetGeminiKeyRotationForTests } = await import("./geminiService");
  resetGeminiKeyRotationForTests();
  prepararRede(new Uint8Array(480).fill(2));
  await generateConversationalAudio(
    "Mateo: Olá, Zuri!\nZuri: Oi, Mateo.",
    { name: "Mateo", voice: "Achird", direction: "voz amigável" },
    { name: "Zuri", voice: "Sulafat", direction: "voz calorosa" },
  );
  const openai = pedidos.filter((p) => p.url.includes("/audio/speech"));
  assert.equal(openai.length, 1);
  assert.equal(openai[0].body?.input, "Olá, Zuri! Oi, Mateo.");
  assert.equal(openai[0].body?.instructions, "voz amigável");
});
