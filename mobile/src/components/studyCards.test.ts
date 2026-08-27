import assert from "node:assert/strict";
import test from "node:test";

// StudyCardsBlock puxa react-native; so a regra pura vem pro harness do node.
import { assinaturaDoDeck } from "./studyCardsDeck";

const card = (id: unknown, frente: string) => ({ id, frente, verso: "v" }) as any;

test("baralhos diferentes tem assinaturas diferentes", () => {
  // E o que dispara o reset: sem isso, um baralho regenerado herdava indice e
  // face virada do anterior.
  assert.notEqual(
    assinaturaDoDeck([card(1, "a"), card(2, "b")]),
    assinaturaDoDeck([card(3, "c")])
  );
});

test("mesmo baralho recriado nao dispara reset", () => {
  // normalizeCards devolve objetos novos a cada render do payload; comparar por
  // referencia zeraria o card do aluno a toda re-renderizacao.
  assert.equal(
    assinaturaDoDeck([card(1, "a"), card(2, "b")]),
    assinaturaDoDeck([card(1, "a"), card(2, "b")])
  );
});

test("card sem id cai no texto da frente", () => {
  assert.notEqual(
    assinaturaDoDeck([card(undefined, "pergunta velha")]),
    assinaturaDoDeck([card(undefined, "pergunta nova")])
  );
});

test("ordem diferente conta como baralho diferente", () => {
  assert.notEqual(
    assinaturaDoDeck([card(1, "a"), card(2, "b")]),
    assinaturaDoDeck([card(2, "b"), card(1, "a")])
  );
});

test("baralho vazio tem assinatura estavel", () => {
  assert.equal(assinaturaDoDeck([]), assinaturaDoDeck([]));
});
