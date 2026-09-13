import test from "node:test";
import assert from "node:assert/strict";
import { normalizePublicProfile } from "./publicProfileModel";

test("normaliza perfil público com guilda e conquistas", () => {
  const profile = normalizePublicProfile({ aluno_id: "a1", nome: "Marcie", guilda: { id: "g1", nome: "Aurora", emblema: "star", membros: 3 }, conquistas: [{ id: 4, nome: "Primeiro passo", pontos_recompensa: 10 }] });
  assert.equal(profile?.alunoId, "a1");
  assert.equal(profile?.guilda?.nome, "Aurora");
  assert.equal(profile?.conquistas[0]?.pontosRecompensa, 10);
});

test("perfil público inválido não gera objeto", () => {
  assert.equal(normalizePublicProfile(null), null);
  assert.equal(normalizePublicProfile({}), null);
});
