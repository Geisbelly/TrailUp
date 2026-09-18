import test from "node:test";
import assert from "node:assert/strict";

import { buildRankingProfileMap } from "./rankingProfiles";

test("buildRankingProfileMap usa perfil_ativo retornado pelo RPC social", () => {
  const profiles = buildRankingProfileMap(
    [
      { aluno_id: "a-1", perfil_ativo: "Conqueror" },
      { aluno_id: "a-2", perfil_ativo: "socialiser" },
    ],
    ["a-1", "a-2", "a-3"],
  );

  assert.equal(profiles["a-1"].key, "conqueror");
  assert.notEqual(profiles["a-1"].label, "Perfil não definido");
  assert.equal(profiles["a-2"].key, "socializer");
  assert.equal(profiles["a-3"].key, null);
  assert.equal(profiles["a-3"].label, "Perfil não definido");
});

test("buildRankingProfileMap inclui o perfil ativo do aluno logado", () => {
  const profiles = buildRankingProfileMap(
    [{ aluno_id: "a-2", perfil_ativo: "conqueror" }],
    ["a-1", "a-2"],
    { alunoId: "a-1", perfilAtivo: "achiever" },
  );

  assert.equal(profiles["a-1"].key, "achiever");
  assert.equal(profiles["a-1"].label, "Realizador");
  assert.equal(profiles["a-2"].key, "conqueror");
});
