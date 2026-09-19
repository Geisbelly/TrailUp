import { test } from "node:test";
import assert from "node:assert/strict";
import { validateRenderAndStoreInput } from "./renderAndStoreValidation";

// Cobre o stage "validate" de /api/v1/render-and-store (server.ts,
// BrainHexPDF) - as 3 checagens antes de qualquer chamada ao Gemini/Storage.

test("recusa quando targetProfile esta ausente", () => {
  const result = validateRenderAndStoreInput({
    targetProfile: undefined,
    bucket: "conteudo_aluno",
    storagePath: "a/b.html",
  });
  assert.equal(result.ok, false);
  assert.match((result as any).error, /targetProfile é obrigatório/);
});

test("recusa quando bucket esta ausente", () => {
  const result = validateRenderAndStoreInput({
    targetProfile: "seeker",
    bucket: undefined,
    storagePath: "a/b.html",
  });
  assert.equal(result.ok, false);
  assert.match((result as any).error, /bucket e storagePath são obrigatórios/);
});

test("recusa quando storagePath esta ausente", () => {
  const result = validateRenderAndStoreInput({
    targetProfile: "seeker",
    bucket: "conteudo_aluno",
    storagePath: undefined,
  });
  assert.equal(result.ok, false);
  assert.match((result as any).error, /bucket e storagePath são obrigatórios/);
});

test("recusa targetProfile que nao existe em BRAIN_HEX_PROFILES", () => {
  const result = validateRenderAndStoreInput({
    targetProfile: "perfil-inexistente",
    bucket: "conteudo_aluno",
    storagePath: "a/b.html",
  });
  assert.equal(result.ok, false);
  assert.match((result as any).error, /targetProfile inválido: perfil-inexistente/);
});

test("aceita os 7 perfis BrainHex validos (minusculos, como o microservice envia)", () => {
  const profiles = [
    "achiever", "seeker", "mastermind", "conqueror", "socializer", "daredevil", "survivor",
  ];
  for (const targetProfile of profiles) {
    const result = validateRenderAndStoreInput({
      targetProfile,
      bucket: "conteudo_aluno",
      storagePath: "a/b.html",
    });
    assert.equal(result.ok, true, `esperava ${targetProfile} valido`);
    if (result.ok) {
      assert.ok(result.theme, `esperava theme resolvido pra ${targetProfile}`);
    }
  }
});
