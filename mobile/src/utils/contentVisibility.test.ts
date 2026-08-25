import assert from "node:assert/strict";
import { test } from "node:test";

import { shouldHideChecklist, shouldHideNotes, shouldHideQuiz, withHideParams } from "./contentVisibility";

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

test("shouldHideChecklist: mesma regra de shouldHideQuiz ('Misto' mostra, resto esconde)", () => {
  assert.equal(shouldHideChecklist("Misto"), false);
  assert.equal(shouldHideChecklist("  MISTO "), false);
  assert.equal(shouldHideChecklist("Conteúdo Primeiro"), true);
  assert.equal(shouldHideChecklist(null), false);
  assert.equal(shouldHideChecklist(undefined), false);
});

test("shouldHideNotes: mesma regra de shouldHideQuiz ('Misto' mostra, resto esconde)", () => {
  assert.equal(shouldHideNotes("Misto"), false);
  assert.equal(shouldHideNotes("  MISTO "), false);
  assert.equal(shouldHideNotes("Perguntas Final"), true);
  assert.equal(shouldHideNotes(null), false);
  assert.equal(shouldHideNotes(undefined), false);
});

test("withHideParams: nao adiciona nenhum param quando todas as flags sao false", () => {
  assert.equal(
    withHideParams("https://storage.example.com/deck.html", { hideQuiz: false, hideChecklist: false, hideNotes: false }),
    "https://storage.example.com/deck.html",
  );
});

test("withHideParams: adiciona so os params das flags true, separados por &", () => {
  assert.equal(
    withHideParams("https://storage.example.com/deck.html", { hideQuiz: true, hideChecklist: false, hideNotes: true }),
    "https://storage.example.com/deck.html?hideQuiz=1&hideNotes=1",
  );
});

test("withHideParams: usa & quando a URL ja tem query string", () => {
  assert.equal(
    withHideParams("https://storage.example.com/deck.html?token=abc", { hideQuiz: true, hideChecklist: true, hideNotes: true }),
    "https://storage.example.com/deck.html?token=abc&hideQuiz=1&hideChecklist=1&hideNotes=1",
  );
});
