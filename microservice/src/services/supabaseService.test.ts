import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildMateriaisGeradosSnapshot,
  type GenerationFence,
  type PersistedMaterialsMerge,
} from "./supabaseService";

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
