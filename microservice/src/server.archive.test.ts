import { test } from "node:test";
import assert from "node:assert/strict";
import { archiveToSupabase, archiveMultiPartToSupabase } from "../server";
import { setSupabaseClientForTesting } from "./services/supabaseService";
import { BRAIN_HEX_CONFIG } from "./constants/brainHex";

type FakeUploadCall = { bucket: string; path: string; contentType: string };

function createFakeSupabaseClient(failingPaths: string[] = []) {
  const calls: FakeUploadCall[] = [];
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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
  return { client, calls };
}

const profile = "socializer" as const;
const presentationTheme = {
  accent: BRAIN_HEX_CONFIG.socializer.color,
} as any;

test("archiveToSupabase monta os 3 paths (audio/markdown/apresentacao) sem sufixo de parte", async () => {
  const { client, calls } = createFakeSupabaseClient();
  setSupabaseClientForTesting(client);
  try {
    const result = await archiveToSupabase({
      profile,
      storagePath: "brainhex/socializer/classe-1/topico-2",
      bucket: "conteudo_aluno",
      refId: "ref-abc",
      markdown: "# Título\n\nConteúdo",
      audioScript: "Mateo: oi\nZuri: oi",
      slides: [],
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
      slides: [],
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

test("archiveMultiPartToSupabase usa sufixo -parte-NN (2 digitos) quando ha mais de 1 parte", async () => {
  const { client, calls } = createFakeSupabaseClient();
  setSupabaseClientForTesting(client);
  try {
    await archiveMultiPartToSupabase({
      profile,
      storagePath: "brainhex/socializer/classe-1/topico-2",
      bucket: "conteudo_aluno",
      refId: "ref-multi",
      parts: [
        { ordem: 1, titulo: "Parte 1", markdown: "md-1", audioScript: "audio-1", slides: [], mp3Base64: Buffer.from("a1").toString("base64"), wavBase64: null } as any,
        { ordem: 2, titulo: "Parte 2", markdown: "md-2", audioScript: "audio-2", slides: [], mp3Base64: Buffer.from("a2").toString("base64"), wavBase64: null } as any,
      ],
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
      profile,
      storagePath: "brainhex/socializer/classe-1/topico-2",
      bucket: "conteudo_aluno",
      refId: "ref-single",
      parts: [
        { ordem: 1, titulo: "Única", markdown: "md-1", audioScript: "audio-1", slides: [], mp3Base64: Buffer.from("a1").toString("base64"), wavBase64: null } as any,
      ],
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

test("archiveMultiPartToSupabase: falha de upload numa parte nao impede as demais partes", async () => {
  const { client, calls } = createFakeSupabaseClient([
    "brainhex/socializer/classe-1/topico-2/audio/material-ref-fail-parte-01.mp3",
  ]);
  setSupabaseClientForTesting(client);
  try {
    const result = await archiveMultiPartToSupabase({
      profile,
      storagePath: "brainhex/socializer/classe-1/topico-2",
      bucket: "conteudo_aluno",
      refId: "ref-fail",
      parts: [
        { ordem: 1, titulo: "Parte 1", markdown: "md-1", audioScript: "audio-1", slides: [], mp3Base64: Buffer.from("a1").toString("base64"), wavBase64: null } as any,
        { ordem: 2, titulo: "Parte 2", markdown: "md-2", audioScript: "audio-2", slides: [], mp3Base64: Buffer.from("a2").toString("base64"), wavBase64: null } as any,
      ],
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
