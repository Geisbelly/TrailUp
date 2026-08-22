import assert from "node:assert/strict";
import { test } from "node:test";

import { shouldHideQuiz, withHideQuizParam } from "./quizVisibility";

test("shouldHideQuiz: 'Misto' mostra o quiz (nao esconde)", () => {
  assert.equal(shouldHideQuiz("Misto"), false);
});

test("shouldHideQuiz: variacao de capitalizacao/espaco ainda conta como Misto", () => {
  assert.equal(shouldHideQuiz("  misto "), false);
  assert.equal(shouldHideQuiz("MISTO"), false);
});

test("shouldHideQuiz: qualquer outro modo esconde o quiz", () => {
  assert.equal(shouldHideQuiz("Conteúdo Primeiro"), true);
  assert.equal(shouldHideQuiz("Pergunta Primeiro"), true);
  assert.equal(shouldHideQuiz("Perguntas Final"), true);
});

test("shouldHideQuiz: sem dado (null/undefined/vazio) mostra o quiz por padrao", () => {
  assert.equal(shouldHideQuiz(null), false);
  assert.equal(shouldHideQuiz(undefined), false);
  assert.equal(shouldHideQuiz(""), false);
  assert.equal(shouldHideQuiz("   "), false);
});

test("withHideQuizParam: adiciona ?hideQuiz=1 quando hide=true e a URL nao tem query string", () => {
  assert.equal(
    withHideQuizParam("https://storage.example.com/deck.html", true),
    "https://storage.example.com/deck.html?hideQuiz=1",
  );
});

test("withHideQuizParam: usa & quando a URL ja tem query string", () => {
  assert.equal(
    withHideQuizParam("https://storage.example.com/deck.html?token=abc", true),
    "https://storage.example.com/deck.html?token=abc&hideQuiz=1",
  );
});

test("withHideQuizParam: retorna a URL sem alteracao quando hide=false", () => {
  assert.equal(
    withHideQuizParam("https://storage.example.com/deck.html?token=abc", false),
    "https://storage.example.com/deck.html?token=abc",
  );
});
