import { test } from "node:test";
import assert from "node:assert/strict";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  buildMateriaisGeradosSnapshot,
  downloadStorageText,
  fetchPersonalizacaoMateriais,
  setSupabaseClientForTesting,
  uploadBuffer,
  type GenerationFence,
  type PersistedMaterialsMerge,
} from "./supabaseService";

type FakeUploadCall = {
  bucket: string;
  path: string;
  data: Buffer;
  contentType: string;
  upsert: boolean;
};

function createFakeSupabaseClient(options?: {
  uploadError?: { message: string } | null;
  publicUrl?: string;
}) {
  const calls: FakeUploadCall[] = [];
  const client = {
    storage: {
      from(bucket: string) {
        return {
          upload: async (
            path: string,
            data: Buffer,
            opts: { contentType: string; upsert: boolean },
          ) => {
            calls.push({
              bucket,
              path,
              data,
              contentType: opts.contentType,
              upsert: opts.upsert,
            });
            return { error: options?.uploadError ?? null };
          },
          getPublicUrl: (path: string) => ({
            data: {
              publicUrl: options?.publicUrl ?? `https://fake.supabase/${bucket}/${path}`,
            },
          }),
        };
      },
    },
  } as unknown as SupabaseClient;
  return { client, calls };
}

test("uploadBuffer usa o client injetado via setSupabaseClientForTesting, sem tocar process.env", async () => {
  const { client, calls } = createFakeSupabaseClient({
    publicUrl: "https://fake.supabase/meu-bucket/caminho/arquivo.mp3",
  });
  setSupabaseClientForTesting(client);
  try {
    const url = await uploadBuffer(
      "meu-bucket",
      "caminho/arquivo.mp3",
      Buffer.from("dados de audio"),
      "audio/mpeg",
    );

    assert.equal(url, "https://fake.supabase/meu-bucket/caminho/arquivo.mp3");
    assert.equal(calls.length, 1);
    assert.equal(calls[0].bucket, "meu-bucket");
    assert.equal(calls[0].path, "caminho/arquivo.mp3");
    assert.equal(calls[0].contentType, "audio/mpeg");
    assert.equal(calls[0].upsert, true);
  } finally {
    setSupabaseClientForTesting(null);
  }
});

test("uploadBuffer lanca com o storagePath na mensagem quando o client retorna erro", async () => {
  const { client } = createFakeSupabaseClient({
    uploadError: { message: "bucket não encontrado" },
  });
  setSupabaseClientForTesting(client);
  try {
    await assert.rejects(
      uploadBuffer("meu-bucket", "caminho/quebrado.mp3", Buffer.from("x"), "audio/mpeg"),
      /caminho\/quebrado\.mp3.*bucket não encontrado/,
    );
  } finally {
    setSupabaseClientForTesting(null);
  }
});

const fence: GenerationFence = {
  cicloId: "ciclo-2",
  sourceHash: "hash-2",
  generationKey: "ciclo-2:hash-2",
};

const material = (
  tipo: string,
  status: string,
  generationKey = fence.generationKey,
) => ({
  payload: { origem: `${tipo}-${status}` },
  arquivo_url: `https://cdn.test/${tipo}-${status}`,
  storage_path: `${tipo}/${status}`,
  metadata: {
    status,
    media_kind: tipo,
    generation_key: generationKey,
  },
});

test("materiais_gerados espelha o agregado persistido, não o upload tentado", () => {
  const attemptedAudio = material("audio", "failed");
  const persistedAudio = material("audio", "completed");
  const persisted: PersistedMaterialsMerge = {
    status: "pronto",
    generation_key: fence.generationKey,
    materiais: {
      audio: persistedAudio,
      markdown: material("markdown", "completed"),
      apresentacao: material("apresentacao", "completed"),
    },
  };

  const snapshot = buildMateriaisGeradosSnapshot(
    persisted,
    fence,
    ["audio", "markdown", "apresentacao"],
  );

  assert.equal(snapshot[0]?.metadata.status, "completed");
  assert.equal(snapshot[0]?.arquivo_url, persistedAudio.arquivo_url);
  assert.notEqual(snapshot[0]?.arquivo_url, attemptedAudio.arquivo_url);
});

test("snapshot ignora materiais agregados que não foram solicitados pelo micro", () => {
  const persisted: PersistedMaterialsMerge = {
    status: "pronto",
    generation_key: fence.generationKey,
    materiais: {
      audio: material("audio", "completed"),
      cards: material("cards", "completed"),
    },
  };

  const snapshot = buildMateriaisGeradosSnapshot(persisted, fence, ["audio"]);

  assert.deepEqual(snapshot.map((entry) => entry.tipo), ["audio"]);
});

test("snapshot rejeita retorno RPC de outra geração", () => {
  const persisted: PersistedMaterialsMerge = {
    status: "pronto",
    generation_key: "ciclo-antigo:hash-antigo",
    materiais: {
      audio: material("audio", "completed"),
    },
  };

  assert.throws(
    () => buildMateriaisGeradosSnapshot(persisted, fence, ["audio"]),
    /outra generation_key/,
  );
});

test("fetchPersonalizacaoMateriais retorna a coluna materiais do registro", async () => {
  const client = {
    from(table: string) {
      assert.equal(table, "conteudo_personalizado");
      return {
        select(_cols: string) {
          return {
            eq(_col: string, _value: unknown) {
              return {
                limit: async (_n: number) => ({
                  data: [{ materiais: { audio: material("audio", "completed") } }],
                  error: null,
                }),
              };
            },
          };
        },
      };
    },
  } as unknown as SupabaseClient;
  setSupabaseClientForTesting(client);
  try {
    const materiais = await fetchPersonalizacaoMateriais(123);
    assert.equal(materiais?.audio?.metadata?.status, "completed");
  } finally {
    setSupabaseClientForTesting(null);
  }
});

test("fetchPersonalizacaoMateriais retorna null quando o registro nao existe", async () => {
  const client = {
    from() {
      return {
        select() {
          return {
            eq() {
              return {
                limit: async () => ({ data: [], error: null }),
              };
            },
          };
        },
      };
    },
  } as unknown as SupabaseClient;
  setSupabaseClientForTesting(client);
  try {
    const materiais = await fetchPersonalizacaoMateriais(999);
    assert.equal(materiais, null);
  } finally {
    setSupabaseClientForTesting(null);
  }
});

test("downloadStorageText baixa e devolve o conteudo como texto", async () => {
  const client = {
    storage: {
      from(bucket: string) {
        assert.equal(bucket, "meu-bucket");
        return {
          download: async (path: string) => {
            assert.equal(path, "markdown/material-x.md");
            return {
              data: { text: async () => "## Titulo\n\nConteudo em markdown." },
              error: null,
            };
          },
        };
      },
    },
  } as unknown as SupabaseClient;
  setSupabaseClientForTesting(client);
  try {
    const text = await downloadStorageText("meu-bucket", "markdown/material-x.md");
    assert.equal(text, "## Titulo\n\nConteudo em markdown.");
  } finally {
    setSupabaseClientForTesting(null);
  }
});

test("downloadStorageText devolve null quando o download falha", async () => {
  const client = {
    storage: {
      from() {
        return {
          download: async () => ({ data: null, error: { message: "not found" } }),
        };
      },
    },
  } as unknown as SupabaseClient;
  setSupabaseClientForTesting(client);
  try {
    const text = await downloadStorageText("meu-bucket", "markdown/ausente.md");
    assert.equal(text, null);
  } finally {
    setSupabaseClientForTesting(null);
  }
});

test("snapshot rejeita formato persistido de outra geração", () => {
  const persisted: PersistedMaterialsMerge = {
    status: "pronto",
    generation_key: fence.generationKey,
    materiais: {
      audio: material("audio", "completed", "ciclo-antigo:hash-antigo"),
    },
  };

  assert.throws(
    () => buildMateriaisGeradosSnapshot(persisted, fence, ["audio"]),
    /audio ausente ou pertence a outra generation_key/,
  );
});
