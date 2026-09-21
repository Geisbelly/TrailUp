import assert from "node:assert/strict";
import test from "node:test";

import { detalhesDoErro, mensagemDoErro } from "./detalhesDoErro";

const ANDROID = { os: "android", versao: 34 };

test("erro normal vira nome, mensagem, plataforma e pilha", () => {
  const erro = new TypeError("x is not a function");
  const texto = detalhesDoErro(erro, ANDROID);
  assert.match(texto, /TypeError: x is not a function/);
  assert.match(texto, /plataforma: android 34/);
  assert.match(texto, /detalhesDoErro/, "a pilha real entra no texto");
});

test("erro SEM stack diz que faltou, em vez de linha vazia", () => {
  // Build de produção com minificação agressiva perde `stack`. Uma linha vazia
  // faria quem lê o relato achar que não havia pilha, e não que ela sumiu.
  const erro = new Error("quebrou");
  erro.stack = undefined;
  assert.match(detalhesDoErro(erro, ANDROID), /\(sem stack\)/);
});

test("o que foi lançado nem sempre e um Error", () => {
  // `throw "texto"` e `throw { code }` chegam aqui. A tela de erro nao pode
  // estourar lendo `.name` de uma string -- isso a devolveria para a tela
  // branca, agora por culpa dela mesma.
  assert.match(detalhesDoErro("deu ruim", ANDROID), /deu ruim/);
  assert.match(detalhesDoErro({ name: "Falha", message: "sem rede" }, ANDROID), /Falha: sem rede/);
  assert.match(detalhesDoErro({ message: "so mensagem" }, ANDROID), /so mensagem/);
  assert.doesNotThrow(() => detalhesDoErro(null, ANDROID));
  assert.doesNotThrow(() => detalhesDoErro(undefined, ANDROID));
  assert.doesNotThrow(() => detalhesDoErro({ code: 42 }, ANDROID));
});

test("a mensagem em destaque nunca fica em branco", () => {
  // O titulo vermelho da tela e' o que o aluno le primeiro; vazio ali e' o
  // mesmo nada que a tela branca dava.
  assert.equal(mensagemDoErro(new Error("falhou")), "falhou");
  assert.equal(mensagemDoErro(new Error("")), "Erro sem mensagem.");
  assert.equal(mensagemDoErro(null), "Erro sem mensagem.");
  assert.equal(mensagemDoErro({ message: "" }), "Erro sem mensagem.");
  assert.equal(mensagemDoErro("string crua"), "string crua");
});

test("versao da plataforma nao precisa ser numero", () => {
  // `Platform.Version` e string no iOS e numero no Android.
  assert.match(detalhesDoErro(new Error("x"), { os: "ios", versao: "17.4" }), /plataforma: ios 17\.4/);
});
