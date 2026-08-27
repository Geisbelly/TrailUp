import assert from "node:assert/strict";
import test from "node:test";

import {
  resolveActiveBrainHexProfile,
  resolveRepresentativeBrainHexProfiles,
} from "./brainHex";

test("inclui os dois perfis mais fortes com afinidade positiva", () => {
  assert.deepEqual(
    resolveRepresentativeBrainHexProfiles([
      { nome: "survivor", afinidade: 42 },
      { nome: "mastermind", afinidade: 35 },
      { nome: "seeker", afinidade: 8 },
    ]),
    ["survivor", "mastermind"],
  );
});

test("inclui outros perfis que tambem tenham sinal relevante", () => {
  assert.deepEqual(
    resolveRepresentativeBrainHexProfiles([
      { nome: "achiever", afinidade: 45 },
      { nome: "conqueror", afinidade: 30 },
      { nome: "socializer", afinidade: 22 },
      { nome: "seeker", afinidade: 3 },
    ]),
    ["achiever", "conqueror", "socializer"],
  );
});

test("nao transforma afinidade residual em perfil representativo", () => {
  assert.deepEqual(
    resolveRepresentativeBrainHexProfiles([
      { nome: "mastermind", afinidade: 60 },
      { nome: "seeker", afinidade: 0 },
      { nome: "daredevil", afinidade: 0 },
    ]),
    ["mastermind"],
  );
});

test("respeita a escolha ativa quando ela continua representativa", () => {
  assert.equal(
    resolveActiveBrainHexProfile(
      [
        { nome: "seeker", afinidade: 42 },
        { nome: "socializer", afinidade: 35 },
      ],
      "socializer",
    ),
    "socializer",
  );
});

test("volta ao dominante quando a escolha salva nao e representativa", () => {
  assert.equal(
    resolveActiveBrainHexProfile(
      [
        { nome: "mastermind", afinidade: 55 },
        { nome: "achiever", afinidade: 30 },
        { nome: "seeker", afinidade: 2 },
      ],
      "seeker",
    ),
    "mastermind",
  );
});
