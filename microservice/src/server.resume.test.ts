import { test, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";

// Ponta a ponta do runPipeline com rede e banco falsos (#652): a nova
// tentativa NAO regera tudo. O Gemini, a OpenAI e o BrainHexPDF saem pelo
// fetch global; o Supabase e um cliente falso com a regra de preservacao da
// RPC merge_personalizacao_materiais_v2.
process.env.GEMINI_API_KEY = "chave-gemini-teste";
process.env.OPENAI_API_KEY = "sk-teste";
process.env.SUPABASE_URL = "https://fake.supabase.co";
process.env.SUPABASE_SERVICE_ROLE_KEY = "service-role-teste";
process.env.BRAINHEXPDF_API_URL = "http://brainhexpdf.test";
process.env.CONTENT_GENERATION_AUDIO_SECOND_ROUND_DELAY_MS = "0";
delete process.env.TTS_ENABLE_OPENAI_FALLBACK;

type Evento = { tipo: "tts" | "texto" | "deck" | "openai" | "merge"; detalhe: string };
const eventos: Evento[] = [];
let ttsResponde: (texto: string) => Response;
let textoResponde: (corpo: any) => Response;

const pcm = Buffer.alloc(4800, 1).toString("base64");
const ttsOk = () =>
  new Response(
    JSON.stringify({ candidates: [{ content: { parts: [{ inlineData: { mimeType: "audio/pcm", data: pcm } }] }, finishReason: "STOP" }] }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
const cotaDoDia = () =>
  new Response(
    JSON.stringify({
      error: {
        code: 429,
        status: "RESOURCE_EXHAUSTED",
        message: 'You exceeded your current quota. quotaId: "GenerateRequestsPerDayPerProjectPerModel-FreeTier"',
      },
    }),
    { status: 429, headers: { "content-type": "application/json" } },
  );

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const raw = init?.body ?? (input instanceof Request ? await input.clone().text() : null);
  let body: any = null;
  try {
    body = typeof raw === "string" ? JSON.parse(raw) : null;
  } catch {
    body = null;
  }
  if (url.includes("generativelanguage.googleapis.com")) {
    if (url.includes("tts")) {
      const texto = String(body?.contents?.[0]?.parts?.[0]?.text ?? "");
      eventos.push({ tipo: "tts", detalhe: texto });
      return ttsResponde(texto);
    }
    eventos.push({ tipo: "texto", detalhe: JSON.stringify(body?.generationConfig?.responseSchema ?? body?.config?.responseSchema ?? {}) });
    return textoResponde(body);
  }
  if (url.includes("/audio/speech")) {
    eventos.push({ tipo: "openai", detalhe: "" });
    return new Response(JSON.stringify({ error: { code: "insufficient_quota", message: "no credits" } }), {
      status: 429,
      headers: { "content-type": "application/json", "x-should-retry": "false" },
    });
  }
  if (url.startsWith("http://brainhexpdf.test")) {
    eventos.push({ tipo: "deck", detalhe: String(body?.ordem) });
    return new Response(JSON.stringify({ success: true, url: `https://deck/${body?.ordem}`, dbWritten: false }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  }
  // R2 pelo Supabase (#76): a funcao devolve a URL de PUT, o PUT grava em
  // `arquivos`, e o gateway serve dali - 404 quando o caminho nao existe.
  if (url === "https://fake.supabase.co/functions/v1/storage-upload-url") {
    return new Response(JSON.stringify({ url: `https://r2.test/${body?.path}` }), { status: 200 });
  }
  if (url.startsWith("https://r2.test/") && init?.method === "PUT") {
    arquivos.set(url.slice("https://r2.test/".length), Buffer.from(init.body as Uint8Array).toString("utf-8"));
    return new Response("", { status: 200 });
  }
  if (url.startsWith("https://fake.supabase.co/functions/v1/storage-redirect?path=")) {
    const caminho = url.slice(url.indexOf("?path=") + "?path=".length);
    return arquivos.has(caminho) ? new Response(arquivos.get(caminho)) : new Response("nao encontrado", { status: 404 });
  }
  return new Response("rota inesperada no teste", { status: 500 });
}) as typeof fetch;

const fence = { cicloId: "ciclo-1", sourceHash: "hash-1", generationKey: "ciclo-1:hash-1" };
const STORAGE = "brainhex/achiever/classe-68/topico-9/generation-hash-1";
const BUCKET = "conteudo_aluno";
const REF = "77_ciclo-1";
let materiais: Record<string, any> = {};
const arquivos = new Map<string, string>();

function aplicaMerge(updates: Record<string, any>) {
  const { PRESENTATION_ENGINE_VERSION } = versoes;
  for (const [k, v] of Object.entries(updates)) {
    const atual = materiais[k];
    const preserva =
      atual?.metadata?.status === "completed"
      && atual?.metadata?.generation_key === fence.generationKey
      && (k !== "apresentacao" || atual?.metadata?.engine === PRESENTATION_ENGINE_VERSION);
    if (!preserva) materiais[k] = v;
  }
  const kinds = ["audio", "markdown", "apresentacao"];
  const ok = kinds.every((k) => materiais[k]?.metadata?.status === "completed" && materiais[k]?.metadata?.generation_key === fence.generationKey);
  const pend = kinds.some((k) => materiais[k]?.metadata?.status === "pending");
  return { status: ok ? "pronto" : pend ? "processando_midias" : "failed", materiais, generation_key: fence.generationKey };
}

function query(table: string) {
  let single = false;
  const builder: any = {
    select: () => builder,
    eq: () => builder,
    limit: () => builder,
    upsert: () => builder,
    insert: () => builder,
    update: () => builder,
    maybeSingle: () => {
      single = true;
      return builder;
    },
    then: (resolve: (value: unknown) => void) => {
      if (table !== "conteudo_personalizado") return resolve({ data: null, error: null });
      if (single) return resolve({ data: { aluno_id: "a", conteudo_id: 1 }, error: null });
      return resolve({ data: [{ materiais }], error: null });
    },
  };
  return builder;
}

const fakeClient = {
  from: (table: string) => query(table),
  storage: {
    from: (bucket: string) => ({
      upload: async (path: string, data: Buffer) => {
        arquivos.set(path, Buffer.from(data).toString("utf-8"));
        return { error: null };
      },
      download: async (path: string) =>
        arquivos.has(path) ? { data: new Blob([arquivos.get(path) as string]), error: null } : { data: null, error: { message: "404" } },
      getPublicUrl: (path: string) => ({ data: { publicUrl: `https://fake/${bucket}/${path}` } }),
    }),
  },
  rpc: async (name: string, args: any) => {
    if (name === "merge_personalizacao_materiais_v2") {
      const resumo = Object.entries(args.p_updates as Record<string, any>)
        .map(([k, v]) => `${k}:${v?.metadata?.status}`)
        .sort()
        .join(",");
      eventos.push({ tipo: "merge", detalhe: resumo });
      return { data: aplicaMerge(args.p_updates), error: null };
    }
    return { data: null, error: { message: `rpc ${name} nao suportado no fake` } };
  },
} as unknown as SupabaseClient;

// Importados depois do ambiente montado: varias constantes leem process.env
// na carga do modulo.
let runPipeline: typeof import("../server").runPipeline;
let resetGeminiKeyRotationForTests: () => void;
let versoes: typeof import("./constants/pipelineVersions");
let createLogger: typeof import("./lib/logger").createLogger;
let ROTEIRO_GENERATION_KEY: string;
let SEM_COTA_TTS_MARKER: string;
before(async () => {
  ({ runPipeline } = await import("../server"));
  ({ resetGeminiKeyRotationForTests } = await import("./services/geminiService"));
  versoes = await import("./constants/pipelineVersions");
  ({ createLogger } = await import("./lib/logger"));
  ({ ROTEIRO_GENERATION_KEY, SEM_COTA_TTS_MARKER } = await import("./services/mediaResume"));
  const { setSupabaseClientForTesting } = await import("./services/supabaseService");
  setSupabaseClientForTesting(fakeClient);
});

const parteMd = (ordem: number) => `${STORAGE}/markdown/material-${REF}-parte-0${ordem}.md`;
const parteAudio = (ordem: number) => `${STORAGE}/audio/material-${REF}-parte-0${ordem}.mp3`;
const parteDeck = (ordem: number) => `${STORAGE}/apresentacao/material-${REF}-parte-0${ordem}.html`;

function textoPronto(status = "completed") {
  arquivos.set(parteMd(2), "## Frações equivalentes\n\nTexto da parte 2.");
  return {
    payload: { markdown: "## O que é fração\n\nTexto da parte 1." },
    metadata: { status, media_kind: "markdown", generation_key: fence.generationKey, updated_at: "x" },
    arquivo_url: `https://gw/${parteMd(1)}`,
    storage_path: parteMd(1),
    bucket: BUCKET,
    partes: [
      { ordem: 1, titulo: "O que é fração", arquivo_url: `https://gw/${parteMd(1)}`, storage_path: parteMd(1) },
      { ordem: 2, titulo: "Frações equivalentes", arquivo_url: `https://gw/${parteMd(2)}`, storage_path: parteMd(2) },
    ],
  };
}

function deckPronto() {
  return {
    metadata: {
      status: "completed",
      media_kind: "apresentacao",
      generation_key: fence.generationKey,
      engine: versoes.PRESENTATION_ENGINE_VERSION,
      media_pipeline_version: versoes.MEDIA_PIPELINE_VERSION,
      design_system: versoes.PRESENTATION_DESIGN_VERSION,
    },
    arquivo_url: `https://deck/1`,
    storage_path: parteDeck(1),
    partes: [1, 2].map((ordem) => ({ ordem, titulo: `P${ordem}`, arquivo_url: `https://deck/${ordem}`, storage_path: parteDeck(ordem) })),
  };
}

// Achiever da turma 68: o áudio de uma parte saiu sem voz e o claim da API
// marcou o material como pending para a nova tentativa (mantendo as partes).
function audioComParte2Faltando() {
  return {
    payload: { roteiro: "Roteiro da parte 1.", capaUrl: "https://img/capa" },
    metadata: {
      status: "pending",
      media_kind: "audio",
      generation_key: fence.generationKey,
      [ROTEIRO_GENERATION_KEY]: fence.generationKey,
      updated_at: "x",
    },
    arquivo_url: `https://gw/${parteAudio(1)}`,
    storage_path: parteAudio(1),
    bucket: BUCKET,
    partes: [
      { ordem: 1, titulo: "O que é fração", arquivo_url: `https://gw/${parteAudio(1)}`, storage_path: parteAudio(1), roteiro: "Roteiro da parte 1.", secoes: [] },
      { ordem: 2, titulo: "Frações equivalentes", arquivo_url: null, storage_path: null, failed: true, roteiro: "Roteiro da parte 2, que ficou sem voz.", secoes: [] },
    ],
  };
}

const bloco = (id: string, ordem: number, topico: string) => ({
  id,
  ordem,
  tema: "Frações",
  topico,
  objetivos: ["entender frações"],
  conteudo_base: `${topico}: base.`,
  conteudo_aprofundado: `${topico}. `.repeat(20),
  conceitos_chave: ["fração"],
  exemplos_contextos: ["pizza"],
  ponte_proximo_bloco: "",
  source_ids: [],
});

const rodar = (contentBlocks: any[] = []) =>
  runPipeline(77, "achiever", [], contentBlocks, {}, STORAGE, BUCKET, REF, fence, createLogger({ ctx: "teste" }));

beforeEach(() => {
  eventos.length = 0;
  arquivos.clear();
  materiais = {};
  resetGeminiKeyRotationForTests();
  ttsResponde = ttsOk;
  textoResponde = () => new Response("sem texto neste teste", { status: 500 });
});

test("retomada: texto e deck prontos, parte 2 do áudio sem voz → só 1 chamada de TTS, com o roteiro guardado", async () => {
  materiais = { markdown: textoPronto(), audio: audioComParte2Faltando(), apresentacao: deckPronto() };

  await rodar();

  assert.deepEqual(eventos.filter((e) => e.tipo === "texto"), [], "não pode refazer o texto");
  assert.deepEqual(eventos.filter((e) => e.tipo === "deck"), [], "não pode refazer o deck");
  const tts = eventos.filter((e) => e.tipo === "tts");
  assert.equal(tts.length, 1);
  assert.match(tts[0].detalhe, /Roteiro da parte 2, que ficou sem voz\./);
  assert.deepEqual(eventos.filter((e) => e.tipo === "merge").map((e) => e.detalhe), ["audio:completed"]);
  assert.equal(materiais.audio.partes[0].arquivo_url, `https://gw/${parteAudio(1)}`, "parte 1 reaproveitada");
  assert.ok(materiais.audio.partes[1].arquivo_url, "parte 2 sintetizada agora");
  assert.equal(materiais.audio.payload.capaUrl, "https://img/capa");
});

test("retomada de material antigo sem roteiro guardado: refaz SÓ o roteiro, não o texto", async () => {
  materiais = {
    markdown: textoPronto(),
    audio: { metadata: { status: "pending", media_kind: "audio", generation_key: fence.generationKey }, arquivo_url: null, storage_path: null },
    apresentacao: deckPronto(),
  };
  textoResponde = () =>
    new Response(
      JSON.stringify({
        candidates: [{
          content: {
            parts: [{
              text: JSON.stringify({
                chapters: [
                  { blockId: "b1", audioScript: `## O que é fração\n${"Uma fração é parte de um todo. ".repeat(8)}` },
                  { blockId: "b2", audioScript: `## Frações equivalentes\n${"Frações equivalentes valem o mesmo. ".repeat(8)}` },
                ],
                confidence: 0.9,
              }),
            }],
          },
          finishReason: "STOP",
        }],
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );

  await rodar([bloco("b1", 1, "O que é fração"), bloco("b2", 2, "Frações equivalentes")]);

  const texto = eventos.filter((e) => e.tipo === "texto");
  assert.equal(texto.length, 1, "uma chamada, só de roteiro");
  assert.doesNotMatch(texto[0].detalhe, /markdown/, "o schema pedido é só o do roteiro");
  // Junção por bloco: tópicos diferentes, um não continua o outro — cada
  // bloco é o seu áudio, mesmo curto (a junção não empacota só por tamanho).
  assert.equal(eventos.filter((e) => e.tipo === "tts").length, 2);
  assert.equal(materiais.audio.metadata.status, "completed");
  assert.equal(materiais.audio.partes.length, 2);
  for (const parte of materiais.audio.partes) assert.doesNotMatch(parte.roteiro, /##/);
  assert.deepEqual(eventos.filter((e) => e.tipo === "deck"), []);
});

test("cota do dia esgotada no TTS: erro leva o marcador, sem segunda rodada, e o roteiro fica salvo para a próxima", async () => {
  materiais = { markdown: textoPronto(), audio: audioComParte2Faltando(), apresentacao: deckPronto() };
  ttsResponde = cotaDoDia;
  const inicio = Date.now();

  await assert.rejects(rodar(), (error: Error) => {
    assert.match(error.message, /midias obrigatorias nao geradas: audio/);
    assert.ok(error.message.includes(SEM_COTA_TTS_MARKER), error.message);
    return true;
  });

  assert.ok(Date.now() - inicio < 5_000, "cota do dia não espera");
  assert.equal(materiais.audio.metadata.status, "failed");
  assert.equal(materiais.audio.partes[1].roteiro, "Roteiro da parte 2, que ficou sem voz.");
  assert.equal(materiais.audio.partes[0].arquivo_url, `https://gw/${parteAudio(1)}`);
  assert.deepEqual(eventos.filter((e) => e.tipo === "texto"), []);
});

test("geração nova: texto e roteiro gravados ANTES do primeiro TTS e do primeiro deck (checkpoint)", async () => {
  textoResponde = () =>
    new Response(
      JSON.stringify({
        candidates: [{
          content: {
            parts: [{
              text: JSON.stringify({
                chapters: [
                  {
                    blockId: "b1",
                    markdown: `## O que é fração\n\n${"Uma fração representa partes iguais de um todo. ".repeat(8)}`,
                    audioScript: `[Tom: Animado]\n## O que é fração\n${"Uma fração representa partes iguais de um todo. ".repeat(6)}`,
                  },
                ],
                confidence: 0.9,
              }),
            }],
          },
          finishReason: "STOP",
        }],
      }),
      { status: 200, headers: { "content-type": "application/json" } },
    );

  await rodar([bloco("b1", 1, "O que é fração")]);

  const ordem = eventos.map((e) => (e.tipo === "merge" ? `merge(${e.detalhe})` : e.tipo));
  const checkpoint = ordem.indexOf("merge(audio:pending,markdown:pending)");
  assert.ok(checkpoint >= 0, `checkpoint ausente: ${ordem.join(" > ")}`);
  assert.ok(checkpoint < ordem.indexOf("tts"), ordem.join(" > "));
  assert.ok(checkpoint < ordem.indexOf("deck"), ordem.join(" > "));
  assert.equal(materiais.markdown.metadata.status, "completed");
  assert.equal(materiais.audio.metadata.status, "completed");
  assert.equal(materiais.audio.metadata[ROTEIRO_GENERATION_KEY], fence.generationKey);
  // A tag sozinha na linha foi para a fala seguinte; o marcador de seção não é falado.
  assert.match(materiais.audio.partes[0].roteiro, /^\[Tom: Animado\] Uma fração/);
});
