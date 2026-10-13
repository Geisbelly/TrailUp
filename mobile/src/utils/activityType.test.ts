import assert from "node:assert/strict";
import test from "node:test";
import { activityRendererKey, normalizeActivityType } from "./activityType";

test("tipos conhecidos escolhem o renderizador certo, com ou sem questões", () => {
  assert.equal(activityRendererKey("quiz", false), "question");
  assert.equal(activityRendererKey("essay", true), "question");
  assert.equal(activityRendererKey("video", false), "video");
  assert.equal(activityRendererKey("texto", false), "texto");
});

test("missão (tipo desconhecido do app) com questões cai no renderizador de questões", () => {
  assert.equal(normalizeActivityType("missao"), "missao");
  assert.equal(activityRendererKey("missao", true), "question");
});

test("missão sem questões não renderiza nada, em vez de quebrar", () => {
  assert.equal(activityRendererKey("missao", false), undefined);
});

test("tipo vazio vira quiz, como sempre", () => {
  assert.equal(normalizeActivityType(""), "quiz");
  assert.equal(normalizeActivityType(null), "quiz");
});

test("apelidos continuam normalizando para o tipo canônico", () => {
  assert.equal(normalizeActivityType("Dissertativa"), "essay");
  assert.equal(normalizeActivityType("verdadeiro/falso"), "true_false");
  assert.equal(normalizeActivityType("lacuna"), "fill_blank");
});
