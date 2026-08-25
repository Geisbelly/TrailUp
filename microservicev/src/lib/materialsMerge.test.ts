import { test } from "node:test";
import assert from "node:assert/strict";
import { computeMergedMaterials, computeAggregatedApresentacaoEntry } from "./materialsMerge";

const completed = (kind: string) => ({ metadata: { status: "completed", media_kind: kind, updated_at: "x" } });
const failed    = (kind: string) => ({ metadata: { status: "failed",    media_kind: kind, updated_at: "x" } });
const pending   = (kind: string) => ({ metadata: { status: "pending",   media_kind: kind, updated_at: "x" } });

test("filter: não sobrescreve formato com status=completed", () => {
  const current = { audio: completed("audio") };
  const updates = { audio: failed("audio") };
  const { merged } = computeMergedMaterials(current, updates, "processando_midias");
  assert.deepEqual(merged.audio, completed("audio"));
});

test("filter: sobrescreve formato com status != completed", () => {
  const current = { audio: failed("audio") };
  const updates = { audio: completed("audio") };
  const { merged } = computeMergedMaterials(current, updates, "processando_midias");
  assert.deepEqual(merged.audio, completed("audio"));
});

test("filter: nova generation_key substitui formato completed antigo", () => {
  const current = {
    audio: { metadata: { status: "completed", generation_key: "ciclo-1:hash-1" } },
  };
  const updates = {
    audio: { metadata: { status: "completed", generation_key: "ciclo-2:hash-2" } },
  };

  const { merged } = computeMergedMaterials(current, updates, "processando_midias");

  assert.deepEqual(merged.audio, updates.audio);
});

test("merge: adiciona novos formatos sem afetar existentes", () => {
  const current = { audio: completed("audio") };
  const updates = { markdown: completed("markdown") };
  const { merged } = computeMergedMaterials(current, updates, "processando_midias");
  assert.deepEqual(merged, {
    audio:    completed("audio"),
    markdown: completed("markdown"),
  });
});

test("status: 'pronto' é sticky (não regride)", () => {
  const current = { audio: completed("audio") };
  const updates = { markdown: pending("markdown") };
  const { newStatus } = computeMergedMaterials(current, updates, "pronto");
  assert.equal(newStatus, "pronto");
});

test("status: todos terminais -> 'pronto'", () => {
  const current = {};
  const updates = {
    audio:        completed("audio"),
    markdown:     completed("markdown"),
    apresentacao: failed("apresentacao"),
  };
  const { newStatus } = computeMergedMaterials(current, updates, "processando_midias");
  assert.equal(newStatus, "pronto");
});

test("status: failed_quality também conta como terminal", () => {
  const current = {};
  const updates = {
    audio: { metadata: { status: "failed_quality", media_kind: "audio", updated_at: "x" } },
  };
  const { newStatus } = computeMergedMaterials(current, updates, "processando_midias");
  assert.equal(newStatus, "pronto");
});

test("status: algum pending -> 'processando_midias'", () => {
  const current = { audio: completed("audio") };
  const updates = { markdown: pending("markdown") };
  const { newStatus } = computeMergedMaterials(current, updates, "novo");
  assert.equal(newStatus, "processando_midias");
});

test("status: nenhum status (materiais vazio após merge) -> mantém currentStatus", () => {
  const { newStatus } = computeMergedMaterials({}, {}, "qualquer_estado");
  assert.equal(newStatus, "qualquer_estado");
});

test("status: misto não-terminal não-pending -> mantém currentStatus", () => {
  const current = { audio: { metadata: { status: "weird_state", media_kind: "audio", updated_at: "x" } } };
  const updates = {};
  const { newStatus } = computeMergedMaterials(current, updates, "processando_midias");
  assert.equal(newStatus, "processando_midias");
});

test("aceita current null/undefined sem crash", () => {
  const r1 = computeMergedMaterials(null,      { a: completed("a") }, "novo");
  const r2 = computeMergedMaterials(undefined, { a: completed("a") }, "novo");
  assert.deepEqual(r1.merged, { a: completed("a") });
  assert.deepEqual(r2.merged, { a: completed("a") });
});

test("entry sem metadata é ignorada nos cálculos de status mas preservada no merge", () => {
  const current = {};
  // Cast: o tipo formal exige `metadata?` mas a função deve tolerar entradas
  // arbitrárias vindas do banco que talvez não sigam o schema.
  const updates = {
    weird: { foo: "bar" } as unknown as { metadata?: { status?: string } },
    audio: completed("audio"),
  };
  const { merged, newStatus } = computeMergedMaterials(current, updates, "processando_midias");
  assert.deepEqual(merged.weird, { foo: "bar" });
  assert.equal(newStatus, "pronto"); // só audio conta, e é completed
});

test("cenário realista: terceira fase (PDF) completando após audio+markdown", () => {
  const current = {
    audio:    completed("audio"),
    markdown: completed("markdown"),
  };
  const updates = { apresentacao: completed("apresentacao") };
  const { merged, newStatus } = computeMergedMaterials(current, updates, "processando_midias");
  assert.equal(newStatus, "pronto");
  assert.equal(Object.keys(merged).length, 3);
});

test("cenário realista: retry de audio falhado não sobrescreve markdown completo", () => {
  const current = {
    audio:    failed("audio"),       // falhou antes
    markdown: completed("markdown"), // sucesso antes
  };
  const updates = {
    audio:    completed("audio"),    // retry com sucesso
    markdown: failed("markdown"),    // tentativa absurda de sobrescrever
  };
  const { merged } = computeMergedMaterials(current, updates, "processando_midias");
  assert.deepEqual(merged.audio,    completed("audio"));    // retry venceu
  assert.deepEqual(merged.markdown, completed("markdown")); // completed protegido
});

test("computeAggregatedApresentacaoEntry: mantem status atual quando faltam partes", () => {
  const result = computeAggregatedApresentacaoEntry(
    [],
    { ordem: 1, titulo: "Introducao", arquivo_url: "https://storage/p1.html", storage_path: "p1.html", failed: false },
    2,
    "pending",
  );
  assert.equal(result.status, "pending");
  assert.equal(result.partes.length, 1);
});

test("computeAggregatedApresentacaoEntry: completed quando todas as partes chegaram sem falha", () => {
  const currentPartes = [
    { ordem: 1, titulo: "Introducao", arquivo_url: "https://storage/p1.html", storage_path: "p1.html", failed: false },
  ];
  const result = computeAggregatedApresentacaoEntry(
    currentPartes,
    { ordem: 2, titulo: "Conclusao", arquivo_url: "https://storage/p2.html", storage_path: "p2.html", failed: false },
    2,
    "pending",
  );
  assert.equal(result.status, "completed");
  assert.equal(result.headline.arquivo_url, "https://storage/p1.html");
});

test("computeAggregatedApresentacaoEntry: failed se qualquer parte falhou", () => {
  const currentPartes = [
    { ordem: 1, titulo: "Introducao", arquivo_url: "https://storage/p1.html", storage_path: "p1.html", failed: false },
  ];
  const result = computeAggregatedApresentacaoEntry(
    currentPartes,
    { ordem: 2, titulo: "Conclusao", arquivo_url: null, storage_path: null, failed: true },
    2,
    "pending",
  );
  assert.equal(result.status, "failed");
});

test("computeAggregatedApresentacaoEntry: substitui parte com mesma ordem, nao duplica", () => {
  const currentPartes = [
    { ordem: 1, titulo: "Introducao", arquivo_url: null, storage_path: null, failed: true },
    { ordem: 2, titulo: "Conclusao", arquivo_url: "https://storage/p2.html", storage_path: "p2.html", failed: false },
  ];
  const result = computeAggregatedApresentacaoEntry(
    currentPartes,
    { ordem: 1, titulo: "Introducao", arquivo_url: "https://storage/p1-retry.html", storage_path: "p1-retry.html", failed: false },
    2,
    "failed",
  );
  assert.equal(result.partes.length, 2);
  assert.equal(result.status, "completed");
});
