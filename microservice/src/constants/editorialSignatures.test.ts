import { test } from "node:test";
import assert from "node:assert/strict";
import { editorialSignatureFor } from "./editorialSignatures";
import type { BrainHexProfile } from "./brainHex";
import assinaturas from "./editorialSignatures.json";

const PERFIS: BrainHexProfile[] = ["seeker", "survivor", "daredevil", "mastermind", "conqueror", "socializer", "achiever"];
const CAMPOS_TEXTO = ["tom_voz", "ritmo", "abertura_estilo", "convencimento_estilo", "progressao_narrativa", "fechamento_estilo", "narrativa_preferencial"] as const;

test("cada perfil tem os 9 campos da assinatura preenchidos", () => {
  for (const perfil of PERFIS) {
    const a = editorialSignatureFor(perfil);
    for (const campo of CAMPOS_TEXTO) assert.ok(a[campo].trim().length > 0, `${perfil}.${campo} vazio`);
    assert.ok(a.marcadores_linguisticos.length > 0, `${perfil} sem marcadores`);
    assert.ok(a.proibicoes_estilo.length > 0, `${perfil} sem proibições`);
  }
});

test("o socializer usa a chave Socialiser, a grafia do Python", () => {
  assert.deepEqual(editorialSignatureFor("socializer"), (assinaturas as Record<string, unknown>).Socialiser);
});
