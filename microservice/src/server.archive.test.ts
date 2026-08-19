import { test } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import { archiveToSupabase, archiveMultiPartToSupabase } from "../server";
import { setSupabaseClientForTesting } from "./services/supabaseService";
import { buildPresentationDesignPlan } from "./constants/presentationThemes";

type FakeUploadCall = { bucket: string; path: string; contentType: string };

function createFakeSupabaseClient(failingPaths: string[] = []) {
  const calls: FakeUploadCall[] = [];
  let lastRpcUpdates: Record<string, unknown> | null = null;
  const client = {
    storage: {
      from(bucket: string) {
        return {
          upload: async (
            path: string,
            _data: Buffer,
            opts: { contentType: string },
          ) => {
            calls.push({ bucket, path, contentType: opts.contentType });
            if (failingPaths.includes(path)) {
              return { error: { message: "falha simulada de upload" } };
            }
            return { error: null };
          },
          getPublicUrl: (path: string) => ({
            data: { publicUrl: `https://fake.supabase/${bucket}/${path}` },
          }),
        };
      },
    },
    // So suporta merge_personalizacao_materiais_v2 - suficiente pra exercitar
    // o ramo personalizacaoId !== null sem mockar o RPC inteiro. Qualquer
    // outro RPC (ex: mark_personalizacao_failed_v2) cai no branch de erro,
    // que os callers ja tratam sem lancar.
    rpc: async (name: string, args: any) => {
      if (name === "merge_personalizacao_materiais_v2") {
        lastRpcUpdates = args.p_updates;
        return {
          data: {
            status: "pronto",
            materiais: args.p_updates,
            generation_key: `${args.p_ciclo_id}:${args.p_source_hash}`,
          },
          error: null,
        };
      }
      return { data: null, error: { message: `rpc ${name} nao suportado no fake` } };
    },
  } as unknown as SupabaseClient;
  return { client, calls, getLastRpcUpdates: () => lastRpcUpdates };
}

const profile = "socializer" as const;
const presentationTheme = buildPresentationDesignPlan(profile);

test("archiveToSupabase monta os 3 paths (audio/markdown/apresentacao) sem sufixo de parte", async () => {
  const { client, calls } = createFakeSupabaseClient();
  setSupabaseClientForTesting(client);
  // A apresentacao agora e gerada via HTTP pelo BrainHexPDF (nao mais via
  // uploadBuffer) - simula uma resposta de sucesso pra esse teste continuar
  // cobrindo o caminho feliz das 3 midias.
  const originalFetch = globalThis.fetch;
  const originalBrainHexPdfUrl = process.env.BRAINHEXPDF_API_URL;
  process.env.BRAINHEXPDF_API_URL = "http://fake-brainhexpdf.test";
  globalThis.fetch = (async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      success: true,
      url: "https://fake.supabase/conteudo_aluno/brainhex/socializer/classe-1/topico-2/apresentacao/material-ref-abc.html",
      storage_path: "brainhex/socializer/classe-1/topico-2/apresentacao/material-ref-abc.html",
      bucket: "conteudo_aluno",
      slide_count: 8,
    }),
  })) as unknown as typeof fetch;
  try {
    const result = await archiveToSupabase({
      profile,
      storagePath: "brainhex/socializer/classe-1/topico-2",
      bucket: "conteudo_aluno",
      refId: "ref-abc",
      markdown: "# Título\n\nConteúdo",
      audioScript: "Mateo: oi\nZuri: oi",
      presentationTheme,
      mp3Base64: Buffer.from("audio-fake").toString("base64"),
      wavBase64: null,
      personalizacaoId: null,
    });

    assert.equal(
      result.audioMp3Url,
      "https://fake.supabase/conteudo_aluno/brainhex/socializer/classe-1/topico-2/audio/material-ref-abc.mp3",
    );
    assert.equal(
      result.markdownUrl,
      "https://fake.supabase/conteudo_aluno/brainhex/socializer/classe-1/topico-2/markdown/material-ref-abc.md",
    );
    assert.ok(result.presentationUrl?.endsWith("/apresentacao/material-ref-abc.html"));

    const paths = calls.map((c) => c.path);
    assert.ok(paths.includes("brainhex/socializer/classe-1/topico-2/audio/material-ref-abc.mp3"));
    assert.ok(paths.includes("brainhex/socializer/classe-1/topico-2/markdown/material-ref-abc.md"));
    const audioCall = calls.find((c) => c.path.endsWith(".mp3"));
    assert.equal(audioCall?.contentType, "audio/mpeg");
  } finally {
    setSupabaseClientForTesting(null);
    globalThis.fetch = originalFetch;
    if (originalBrainHexPdfUrl === undefined) delete process.env.BRAINHEXPDF_API_URL;
    else process.env.BRAINHEXPDF_API_URL = originalBrainHexPdfUrl;
  }
});

// Regressao: com o motor antigo, materiais.apresentacao.payload.slides
// guardava o SlideContent[] estruturado usado pra renderizar o HTML
// localmente. O BrainHexPDF agora renderiza o deck inteiro por fora - se
// esse campo continuar com conteudo "rico" (titulo/topicos), o mobile
// (normalizeRichPresentationSlides em personalization.ts) sintetiza um
// render nativo em vez de abrir o arquivo_url do BrainHexPDF, ignorando o
// deck gerado. Precisa ficar vazio sempre. Ver
// docs/superpowers/specs/2026-08-15-brainhexpdf-integracao-design.md.
test("archiveToSupabase persiste apresentacao.payload.slides vazio (deck e do BrainHexPDF, nao sintetizado aqui)", async () => {
  const { client, getLastRpcUpdates } = createFakeSupabaseClient();
  setSupabaseClientForTesting(client);
  const originalFetch = globalThis.fetch;
  const originalBrainHexPdfUrl = process.env.BRAINHEXPDF_API_URL;
  process.env.BRAINHEXPDF_API_URL = "http://fake-brainhexpdf.test";
  globalThis.fetch = (async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      success: true,
      url: "https://fake.supabase/conteudo_aluno/brainhex/socializer/classe-1/topico-2/apresentacao/material-ref-slides.html",
      storage_path: "brainhex/socializer/classe-1/topico-2/apresentacao/material-ref-slides.html",
      bucket: "conteudo_aluno",
      slide_count: 8,
    }),
  })) as unknown as typeof fetch;
  try {
    await archiveToSupabase({
      profile,
      storagePath: "brainhex/socializer/classe-1/topico-2",
      bucket: "conteudo_aluno",
      refId: "ref-slides",
      markdown: "# Título\n\nConteúdo",
      audioScript: "roteiro",
      presentationTheme,
      mp3Base64: Buffer.from("audio-fake").toString("base64"),
      wavBase64: null,
      personalizacaoId: 42,
      fence: { cicloId: "ciclo-1", sourceHash: "hash-a", generationKey: "ciclo-1:hash-a" },
    });

    const updates = getLastRpcUpdates();
    assert.ok(updates, "esperava que o RPC de merge tivesse sido chamado");
    assert.deepEqual((updates as any).apresentacao.payload.slides, []);
  } finally {
    setSupabaseClientForTesting(null);
    globalThis.fetch = originalFetch;
    if (originalBrainHexPdfUrl === undefined) delete process.env.BRAINHEXPDF_API_URL;
    else process.env.BRAINHEXPDF_API_URL = originalBrainHexPdfUrl;
  }
});

test("archiveToSupabase usa wav/audio-wav quando so ha wavBase64 (sem mp3Base64)", async () => {
  const { client, calls } = createFakeSupabaseClient();
  setSupabaseClientForTesting(client);
  try {
    await archiveToSupabase({
      profile,
      storagePath: "brainhex/socializer/classe-1/topico-2",
      bucket: "conteudo_aluno",
      refId: "ref-wav",
      markdown: "# Título",
      audioScript: "roteiro",
      presentationTheme,
      mp3Base64: null,
      wavBase64: Buffer.from("audio-fake").toString("base64"),
      personalizacaoId: null,
    });

    const audioCall = calls.find((c) => c.path.endsWith(".wav"));
    assert.ok(audioCall, "esperava um upload .wav");
    assert.equal(audioCall?.contentType, "audio/wav");
  } finally {
    setSupabaseClientForTesting(null);
  }
});

function fakePresentationResults(count: number) {
  return Array.from({ length: count }, () => ({
    presentationUrl: null,
    failure: { stage: "render" as const, error: "BRAINHEXPDF_API_URL nao configurado" },
  }));
}

test("archiveMultiPartToSupabase usa sufixo -parte-NN (2 digitos) quando ha mais de 1 parte", async () => {
  const { client, calls } = createFakeSupabaseClient();
  setSupabaseClientForTesting(client);
  try {
    await archiveMultiPartToSupabase({
      storagePath: "brainhex/socializer/classe-1/topico-2",
      bucket: "conteudo_aluno",
      refId: "ref-multi",
      parts: [
        { ordem: 1, titulo: "Parte 1", markdown: "md-1", audioScript: "audio-1", slides: [], mp3Base64: Buffer.from("a1").toString("base64"), wavBase64: null } as any,
        { ordem: 2, titulo: "Parte 2", markdown: "md-2", audioScript: "audio-2", slides: [], mp3Base64: Buffer.from("a2").toString("base64"), wavBase64: null } as any,
      ],
      presentationResults: fakePresentationResults(2),
      presentationTheme,
      personalizacaoId: null,
    });

    const paths = calls.map((c) => c.path);
    assert.ok(paths.some((p) => p.endsWith("audio/material-ref-multi-parte-01.mp3")));
    assert.ok(paths.some((p) => p.endsWith("audio/material-ref-multi-parte-02.mp3")));
    assert.ok(paths.some((p) => p.endsWith("markdown/material-ref-multi-parte-01.md")));
  } finally {
    setSupabaseClientForTesting(null);
  }
});

test("archiveMultiPartToSupabase nao usa sufixo de parte quando ha so 1 parte", async () => {
  const { client, calls } = createFakeSupabaseClient();
  setSupabaseClientForTesting(client);
  try {
    await archiveMultiPartToSupabase({
      storagePath: "brainhex/socializer/classe-1/topico-2",
      bucket: "conteudo_aluno",
      refId: "ref-single",
      parts: [
        { ordem: 1, titulo: "Única", markdown: "md-1", audioScript: "audio-1", slides: [], mp3Base64: Buffer.from("a1").toString("base64"), wavBase64: null } as any,
      ],
      presentationResults: fakePresentationResults(1),
      presentationTheme,
      personalizacaoId: null,
    });

    const paths = calls.map((c) => c.path);
    assert.ok(paths.some((p) => p.endsWith("audio/material-ref-single.mp3")));
    assert.ok(!paths.some((p) => p.includes("-parte-")));
  } finally {
    setSupabaseClientForTesting(null);
  }
});

test("archiveToSupabase nao inclui apresentacao no merge quando o BrainHexPDF ja gravou (dbWritten:true)", async () => {
  const { client, getLastRpcUpdates } = createFakeSupabaseClient();
  setSupabaseClientForTesting(client);
  const originalFetch = globalThis.fetch;
  const originalBrainHexPdfUrl = process.env.BRAINHEXPDF_API_URL;
  process.env.BRAINHEXPDF_API_URL = "http://fake-brainhexpdf.test";
  globalThis.fetch = (async () => ({
    ok: true,
    status: 200,
    json: async () => ({
      success: true,
      url: "https://fake.supabase/conteudo_aluno/x.html",
      storage_path: "x.html",
      bucket: "conteudo_aluno",
      slide_count: 8,
      dbWritten: true,
    }),
  })) as unknown as typeof fetch;
  try {
    await archiveToSupabase({
      profile,
      storagePath: "brainhex/socializer/classe-1/topico-2",
      bucket: "conteudo_aluno",
      refId: "ref-dbwritten",
      markdown: "# Título\n\nConteúdo",
      audioScript: "roteiro",
      presentationTheme,
      mp3Base64: Buffer.from("audio-fake").toString("base64"),
      wavBase64: null,
      personalizacaoId: 42,
      fence: { cicloId: "ciclo-1", sourceHash: "hash-a", generationKey: "ciclo-1:hash-a" },
    });

    const updates = getLastRpcUpdates();
    assert.ok(updates, "esperava que o RPC de merge tivesse sido chamado (audio/markdown)");
    assert.equal("apresentacao" in (updates as any), false);
  } finally {
    setSupabaseClientForTesting(null);
    globalThis.fetch = originalFetch;
    if (originalBrainHexPdfUrl === undefined) delete process.env.BRAINHEXPDF_API_URL;
    else process.env.BRAINHEXPDF_API_URL = originalBrainHexPdfUrl;
  }
});

test("archiveToSupabase inclui apresentacao com fallback quando dbWritten:false", async () => {
  const { client, getLastRpcUpdates } = createFakeSupabaseClient();
  setSupabaseClientForTesting(client);
  const originalFetch = globalThis.fetch;
  const originalBrainHexPdfUrl = process.env.BRAINHEXPDF_API_URL;
  process.env.BRAINHEXPDF_API_URL = "http://fake-brainhexpdf.test";
  globalThis.fetch = (async () => ({
    ok: false,
    status: 502,
    json: async () => ({ success: false, stage: "upload", error: "timeout" }),
  })) as unknown as typeof fetch;
  try {
    await archiveToSupabase({
      profile,
      storagePath: "brainhex/socializer/classe-1/topico-2",
      bucket: "conteudo_aluno",
      refId: "ref-fallback",
      markdown: "# Título\n\nConteúdo",
      audioScript: "roteiro",
      presentationTheme,
      mp3Base64: Buffer.from("audio-fake").toString("base64"),
      wavBase64: null,
      personalizacaoId: 42,
      fence: { cicloId: "ciclo-1", sourceHash: "hash-a", generationKey: "ciclo-1:hash-a" },
    });

    const updates = getLastRpcUpdates();
    assert.ok(updates, "esperava que o RPC de merge tivesse sido chamado");
    assert.equal((updates as any).apresentacao.metadata.status, "failed");
  } finally {
    setSupabaseClientForTesting(null);
    globalThis.fetch = originalFetch;
    if (originalBrainHexPdfUrl === undefined) delete process.env.BRAINHEXPDF_API_URL;
    else process.env.BRAINHEXPDF_API_URL = originalBrainHexPdfUrl;
  }
});

test("archiveMultiPartToSupabase nao monta apresentacao quando todas as partes gravaram (dbWritten:true)", async () => {
  const { client, getLastRpcUpdates } = createFakeSupabaseClient();
  setSupabaseClientForTesting(client);
  const originalFetch = globalThis.fetch;
  const originalBrainHexPdfUrl = process.env.BRAINHEXPDF_API_URL;
  process.env.BRAINHEXPDF_API_URL = "http://fake-brainhexpdf.test";
  let call = 0;
  globalThis.fetch = (async (_url: any, init: any) => {
    call += 1;
    const body = JSON.parse(init.body);
    return {
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        url: `https://fake.supabase/p${body.ordem}.html`,
        storage_path: `p${body.ordem}.html`,
        bucket: "conteudo_aluno",
        slide_count: 8,
        dbWritten: true,
      }),
    } as any;
  }) as unknown as typeof fetch;
  try {
    await archiveMultiPartToSupabase({
      profile,
      storagePath: "brainhex/socializer/classe-1/topico-2",
      bucket: "conteudo_aluno",
      refId: "ref-multi-dbwritten",
      parts: [
        { ordem: 1, titulo: "Parte 1", markdown: "md-1", audioScript: "audio-1", slides: [], mp3Base64: Buffer.from("a1").toString("base64"), wavBase64: null } as any,
        { ordem: 2, titulo: "Parte 2", markdown: "md-2", audioScript: "audio-2", slides: [], mp3Base64: Buffer.from("a2").toString("base64"), wavBase64: null } as any,
      ],
      presentationTheme,
      personalizacaoId: 42,
      fence: { cicloId: "ciclo-1", sourceHash: "hash-a", generationKey: "ciclo-1:hash-a" },
    });

    assert.equal(call, 2);
    const updates = getLastRpcUpdates();
    assert.ok(updates, "esperava merge de audio/markdown");
    assert.equal("apresentacao" in (updates as any), false);
  } finally {
    setSupabaseClientForTesting(null);
    globalThis.fetch = originalFetch;
    if (originalBrainHexPdfUrl === undefined) delete process.env.BRAINHEXPDF_API_URL;
    else process.env.BRAINHEXPDF_API_URL = originalBrainHexPdfUrl;
  }
});

test("archiveMultiPartToSupabase grava fallback so pra apresentacao quando 1 parte falha o transporte", async () => {
  const { client, getLastRpcUpdates } = createFakeSupabaseClient();
  setSupabaseClientForTesting(client);
  const originalFetch = globalThis.fetch;
  const originalBrainHexPdfUrl = process.env.BRAINHEXPDF_API_URL;
  process.env.BRAINHEXPDF_API_URL = "http://fake-brainhexpdf.test";
  globalThis.fetch = (async (_url: any, init: any) => {
    const body = JSON.parse(init.body);
    if (body.ordem === 2) {
      return { ok: false, status: 502, json: async () => ({ success: false, stage: "upload", error: "timeout" }) } as any;
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        url: `https://fake.supabase/p${body.ordem}.html`,
        storage_path: `p${body.ordem}.html`,
        bucket: "conteudo_aluno",
        slide_count: 8,
        dbWritten: true,
      }),
    } as any;
  }) as unknown as typeof fetch;
  try {
    await archiveMultiPartToSupabase({
      profile,
      storagePath: "brainhex/socializer/classe-1/topico-2",
      bucket: "conteudo_aluno",
      refId: "ref-multi-fallback",
      parts: [
        { ordem: 1, titulo: "Parte 1", markdown: "md-1", audioScript: "audio-1", slides: [], mp3Base64: Buffer.from("a1").toString("base64"), wavBase64: null } as any,
        { ordem: 2, titulo: "Parte 2", markdown: "md-2", audioScript: "audio-2", slides: [], mp3Base64: Buffer.from("a2").toString("base64"), wavBase64: null } as any,
      ],
      presentationTheme,
      personalizacaoId: 42,
      fence: { cicloId: "ciclo-1", sourceHash: "hash-a", generationKey: "ciclo-1:hash-a" },
    });

    const updates = getLastRpcUpdates();
    assert.ok(updates, "esperava merge de audio/markdown/apresentacao");
    const apresentacao = (updates as any).apresentacao;
    assert.equal(apresentacao.partes.length, 2);
    assert.equal(apresentacao.partes[1].failed, true);
    assert.equal(apresentacao.metadata.status, "failed");
  } finally {
    setSupabaseClientForTesting(null);
    globalThis.fetch = originalFetch;
    if (originalBrainHexPdfUrl === undefined) delete process.env.BRAINHEXPDF_API_URL;
    else process.env.BRAINHEXPDF_API_URL = originalBrainHexPdfUrl;
  }
});

test("archiveMultiPartToSupabase: falha de upload numa parte nao impede as demais partes", async () => {
  const { client, calls } = createFakeSupabaseClient([
    "brainhex/socializer/classe-1/topico-2/audio/material-ref-fail-parte-01.mp3",
  ]);
  setSupabaseClientForTesting(client);
  try {
    const result = await archiveMultiPartToSupabase({
      storagePath: "brainhex/socializer/classe-1/topico-2",
      bucket: "conteudo_aluno",
      refId: "ref-fail",
      parts: [
        { ordem: 1, titulo: "Parte 1", markdown: "md-1", audioScript: "audio-1", slides: [], mp3Base64: Buffer.from("a1").toString("base64"), wavBase64: null } as any,
        { ordem: 2, titulo: "Parte 2", markdown: "md-2", audioScript: "audio-2", slides: [], mp3Base64: Buffer.from("a2").toString("base64"), wavBase64: null } as any,
      ],
      presentationResults: fakePresentationResults(2),
      presentationTheme,
      personalizacaoId: null,
    });

    // A parte 1 de audio falhou (uploadBuffer lanca e e capturado por-parte),
    // mas a parte 2 de audio e ambas as partes de markdown ainda foram tentadas.
    const paths = calls.map((c) => c.path);
    assert.ok(paths.some((p) => p.endsWith("audio/material-ref-fail-parte-02.mp3")));
    assert.ok(paths.some((p) => p.endsWith("markdown/material-ref-fail-parte-01.md")));
    assert.ok(paths.some((p) => p.endsWith("markdown/material-ref-fail-parte-02.md")));
    // audioMp3Url reflete a parte 1 (primeira), que falhou -> null.
    assert.equal(result.audioMp3Url, null);
  } finally {
    setSupabaseClientForTesting(null);
  }
});

// Regressao: apresentacao agora e resolvida ANTES de chamar esta funcao (em
// paralelo com o audio - ver runAudioAndPresentationInParallel), nao mais
// chamada aqui dentro. archiveMultiPartToSupabase so precisa consumir o
// resultado ja pronto (por indice, alinhado com `parts`) e refletir isso no
// merge persistido.
test("archiveMultiPartToSupabase usa os presentationResults ja resolvidos (nao chama a rede)", async () => {
  const { client, getLastRpcUpdates } = createFakeSupabaseClient();
  setSupabaseClientForTesting(client);
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = (async () => {
    fetchCalls++;
    throw new Error("nao deveria chamar fetch - presentationResults ja veio resolvido");
  }) as unknown as typeof fetch;
  try {
    const result = await archiveMultiPartToSupabase({
      storagePath: "brainhex/socializer/classe-1/topico-2",
      bucket: "conteudo_aluno",
      refId: "ref-pre-resolved",
      parts: [
        { ordem: 1, titulo: "Única", markdown: "md-1", audioScript: "audio-1", slides: [], mp3Base64: Buffer.from("a1").toString("base64"), wavBase64: null } as any,
      ],
      presentationResults: [
        { presentationUrl: "https://fake.supabase/conteudo_aluno/apresentacao.html", failure: null },
      ],
      presentationTheme,
      personalizacaoId: 42,
      fence: { cicloId: "ciclo-1", sourceHash: "hash-a", generationKey: "ciclo-1:hash-a" },
    });

    assert.equal(fetchCalls, 0);
    assert.equal(result.presentationUrl, "https://fake.supabase/conteudo_aluno/apresentacao.html");
    assert.equal(result.presentationFailure, null);
    const updates = getLastRpcUpdates();
    assert.equal(
      (updates as any).apresentacao.arquivo_url,
      "https://fake.supabase/conteudo_aluno/apresentacao.html",
    );
    assert.equal((updates as any).apresentacao.metadata.status, "completed");
  } finally {
    setSupabaseClientForTesting(null);
    globalThis.fetch = originalFetch;
  }
});
