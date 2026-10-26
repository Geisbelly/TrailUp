import assert from "node:assert/strict";
import test from "node:test";

import { dadosDeLoginValidos, emailDeLoginValido, emailDeRecuperacaoValido } from "./authValidacao";

test("login aceita e-mail com formato válido e recusa o resto", () => {
  assert.equal(emailDeLoginValido("aluno@escola.edu.br"), true);
  assert.equal(emailDeLoginValido("aluno@escola"), false);
  assert.equal(emailDeLoginValido("aluno escola@x.com"), false);
  assert.equal(emailDeLoginValido(""), false);
});

test("recuperar senha é mais frouxo que o login, mas exige arroba e ponto", () => {
  assert.equal(emailDeRecuperacaoValido("a@b.c"), true);
  assert.equal(emailDeLoginValido("a@b.c"), false);
  assert.equal(emailDeRecuperacaoValido("a@b"), false);
  assert.equal(emailDeRecuperacaoValido("a b@c.com"), false);
});

test("Entrar só habilita com e-mail válido e senha preenchida", () => {
  assert.equal(dadosDeLoginValidos("aluno@escola.edu.br", "senha1234"), true);
  assert.equal(dadosDeLoginValidos("aluno@escola.edu.br", ""), false);
  assert.equal(dadosDeLoginValidos("aluno@escola.edu.br", "   "), false);
  assert.equal(dadosDeLoginValidos("aluno@escola", "senha1234"), false);
});
