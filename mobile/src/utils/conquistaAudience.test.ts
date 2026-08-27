import assert from "node:assert/strict";
import test from "node:test";

import {
  conquistaVisivelParaPerfil,
  conquistaVisivelParaPerfis,
  normalizeConquistaEscopo,
} from "./conquistaAudience";

test("conquista antiga sem escopo continua comum", () => {
  assert.equal(normalizeConquistaEscopo(undefined), "comum");
  assert.equal(conquistaVisivelParaPerfil({}, "survivor"), true);
});

test("conquista comum aparece para qualquer perfil", () => {
  assert.equal(
    conquistaVisivelParaPerfil({ escopo: "comum" }, "mastermind"),
    true,
  );
});

test("conquista de perfil aparece apenas para o perfil alvo", () => {
  const conquista = { escopo: "perfil", perfil_alvo: "survivor" };
  assert.equal(conquistaVisivelParaPerfil(conquista, "survivor"), true);
  assert.equal(conquistaVisivelParaPerfil(conquista, "achiever"), false);
});

test("conquista de perfil sem alvo nao vaza para outros alunos", () => {
  assert.equal(
    conquistaVisivelParaPerfil({ escopo: "perfil", perfil_alvo: null }, "seeker"),
    false,
  );
});

test("aceita conquistas de todos os perfis representativos", () => {
  const perfis = ["survivor", "mastermind"];
  assert.equal(
    conquistaVisivelParaPerfis(
      { escopo: "perfil", perfil_alvo: "survivor" },
      perfis,
    ),
    true,
  );
  assert.equal(
    conquistaVisivelParaPerfis(
      { escopo: "perfil", perfil_alvo: "mastermind" },
      perfis,
    ),
    true,
  );
  assert.equal(
    conquistaVisivelParaPerfis(
      { escopo: "perfil", perfil_alvo: "seeker" },
      perfis,
    ),
    false,
  );
});
