import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { BRAIN_HEX_CONFIG, type BrainHexProfile } from "../constants/brainHex";
import { GUARDIAN_VOICE_PROFILES } from "../constants/guardianVoices";
import { cleanAudioScript } from "../utils/audioJunction";

// Ponta a ponta do TTS com a rede falsa. A chave da OpenAI está presente de
// propósito: é a situação em que existia a voz de reserva. Aluno nenhum pode ouvir
// outra voz que não a do Guardião do perfil.
process.env.GEMINI_API_KEY = "chave-gemini-teste";
process.env.OPENAI_API_KEY = "sk-teste";

const ERRO_402 = {
  error: {
    code: 402,
    message: "Your prepayment credits are depleted. Please go to AI Studio at https://ai.studio/projects to manage your project and billing.",
    status: "RESOURCE_EXHAUSTED",
  },
};
const AUDIO_OK = {
  candidates: [{
    content: {
      parts: [{ inlineData: { mimeType: "audio/L16;rate=24000", data: Buffer.alloc(4800, 1).toString("base64") } }],
    },
  }],
};

type Pedido = { url: string; corpo: string };

const pedidos: Pedido[] = [];
let geminiSemCredito = false;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const raw = init?.body ?? (input instanceof Request ? await input.clone().text() : "");
  pedidos.push({ url, corpo: typeof raw === "string" ? raw : "" });
  if (url.includes("generativelanguage.googleapis.com")) {
    return geminiSemCredito
      ? new Response(JSON.stringify(ERRO_402), { status: 402, headers: { "content-type": "application/json" } })
      : new Response(JSON.stringify(AUDIO_OK), { status: 200, headers: { "content-type": "application/json" } });
  }
  return new Response("rota inesperada no teste", { status: 500 });
}) as typeof fetch;

async function preparar(semCredito: boolean) {
  const gemini = await import("./geminiService");
  gemini.resetGeminiKeyRotationForTests();
  pedidos.length = 0;
  geminiSemCredito = semCredito;
  return gemini;
}

function pedidosAoGemini() {
  return pedidos.filter((p) => p.url.includes("generativelanguage"));
}

function assertSoGemini() {
  const fora = pedidos.filter((p) => !p.url.includes("generativelanguage"));
  assert.deepEqual(fora.map((p) => p.url), [], "nenhum pedido pode sair para outro provedor de voz");
}

const ROTEIRO_SOLO = "## Frações\n[Tom: Sereno] Comece aqui. ## Frações no dia. Uma fração é parte de um todo.";
const ROTEIRO_DIALOGO = "## Frações\nMateo: Olá, Zuri! ## Frações no dia.\nZuri: Oi, Mateo.";
const SOLOS: BrainHexProfile[] = ["mastermind", "seeker", "survivor", "daredevil", "conqueror", "achiever"];

for (const perfil of SOLOS) {
  test(`${perfil}: o áudio sai na voz e na direção do Guardião, com o tom e sem o "##"`, async () => {
    const { generateGuardianAudio } = await preparar(false);
    const audio = await generateGuardianAudio(ROTEIRO_SOLO, perfil);
    assert.ok(audio.wav.length > 0);
    assertSoGemini();
    const [pedido] = pedidosAoGemini();
    const corpo = JSON.parse(pedido.corpo);
    const voz = GUARDIAN_VOICE_PROFILES[perfil];
    assert.equal(corpo.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName, voz.voice);
    const prompt = corpo.contents[0].parts[0].text as string;
    assert.ok(prompt.includes(`DIREÇÃO DE VOZ: ${voz.direction}`));
    assert.ok(prompt.includes("[Tom: Sereno]"));
    assert.ok(!prompt.includes("##"));
  });
}

test("socializer: o áudio é o diálogo de Mateo e Zuri, cada um com a sua voz e direção", async () => {
  const { generateGuardianAudio } = await preparar(false);
  await generateGuardianAudio(ROTEIRO_DIALOGO, "socializer");
  assertSoGemini();
  const corpo = JSON.parse(pedidosAoGemini()[0].corpo);
  const voz = GUARDIAN_VOICE_PROFILES.socializer;
  assert.deepEqual(
    corpo.generationConfig.speechConfig.multiSpeakerVoiceConfig.speakerVoiceConfigs.map(
      (s: { speaker: string; voiceConfig: { prebuiltVoiceConfig: { voiceName: string } } }) =>
        [s.speaker, s.voiceConfig.prebuiltVoiceConfig.voiceName],
    ),
    [["Mateo", voz.voice], ["Zuri", voz.secondaryVoice]],
  );
  const prompt = corpo.contents[0].parts[0].text as string;
  assert.ok(prompt.includes(`DIREÇÃO DE Mateo: ${voz.direction}`));
  assert.ok(prompt.includes(`DIREÇÃO DE Zuri: ${voz.secondaryDirection}`));
  assert.match(prompt, /Mateo: Olá, Zuri! Frações no dia\.\s+Zuri: Oi, Mateo\./);
});

test("os 7 perfis têm Guardião: nenhum cai em voz padrão", () => {
  for (const perfil of [...SOLOS, "socializer"] as BrainHexProfile[]) {
    assert.ok(GUARDIAN_VOICE_PROFILES[perfil]?.voice, perfil);
    assert.ok(GUARDIAN_VOICE_PROFILES[perfil]?.direction, perfil);
    assert.ok(BRAIN_HEX_CONFIG[perfil]?.guideName, perfil);
  }
});

test("perfil desconhecido ou roteiro vazio falham sem pedir áudio a ninguém", async () => {
  const { generateGuardianAudio } = await preparar(false);
  await assert.rejects(generateGuardianAudio("Olá.", "socialiser" as BrainHexProfile), /sem Guardião/);
  await assert.rejects(generateGuardianAudio("## Só um título", "seeker"), /vazio/);
  assert.equal(pedidos.length, 0);
});

test("limpar um roteiro já limpo não muda nada (a junção limpa antes e a geração limpa de novo)", () => {
  const solo = cleanAudioScript(`${ROTEIRO_SOLO}\n\n[Tom: Alegre]\nOutra seção.`);
  assert.equal(cleanAudioScript(solo), solo);
  const estilo = { speakers: ["Mateo", "Zuri"] };
  const dialogo = cleanAudioScript(ROTEIRO_DIALOGO, estilo);
  assert.equal(cleanAudioScript(dialogo, estilo), dialogo);
});

test("narração sem crédito no Gemini falha, sem outra voz, em todas as tentativas com a voz do Guardião", async () => {
  const { generateGuardianAudio } = await preparar(true);
  await assert.rejects(generateGuardianAudio(ROTEIRO_SOLO, "mastermind"), /402|credits/i);
  assertSoGemini();
  const gemini = pedidosAoGemini();
  assert.ok(gemini.length >= 1, "o Gemini precisa ser tentado");
  for (const pedido of gemini) assert.match(pedido.corpo, /Charon/);
});

test("diálogo sem crédito falha, sem uma voz só lendo as duas falas", async () => {
  const { generateGuardianAudio } = await preparar(true);
  await assert.rejects(generateGuardianAudio(ROTEIRO_DIALOGO, "socializer"), /402|credits/i);
  assertSoGemini();
  for (const pedido of pedidosAoGemini()) {
    assert.match(pedido.corpo, /Achird/);
    assert.match(pedido.corpo, /Sulafat/);
  }
});

function fontes(pasta: string): string[] {
  return readdirSync(pasta).flatMap((nome) => {
    const caminho = join(pasta, nome);
    if (statSync(caminho).isDirectory()) return fontes(caminho);
    return /\.tsx?$/.test(nome) && !/\.test\.tsx?$/.test(nome) ? [caminho] : [];
  });
}

const RAIZ = fileURLToPath(new URL("../../", import.meta.url));
const FONTES = [join(RAIZ, "server.ts"), ...fontes(join(RAIZ, "src"))];

test("nenhum outro provedor de voz existe no código", () => {
  const proibido = /audio\/speech|audio\.speech|gpt-4o-mini-tts|tts-1|elevenlabs|speechSynthesis/i;
  const achados = FONTES.filter((arquivo) => proibido.test(readFileSync(arquivo, "utf-8")));
  assert.deepEqual(achados, []);
});

test("fora do geminiService, todo áudio passa por generateGuardianAudio", () => {
  const direto = /\bgenerate(Long)?(Natural|Conversational)Audio\b/;
  const achados = FONTES.filter(
    (arquivo) => !arquivo.endsWith("geminiService.ts") && direto.test(readFileSync(arquivo, "utf-8")),
  );
  assert.deepEqual(achados, []);
});
