import { test } from "node:test";
import assert from "node:assert/strict";
import { criarExigirSegredo, deckPodeSerServido } from "./autorizacao";

function chamar(env: Record<string, string | undefined>, headers: Record<string, string> = {}) {
  const resultado = { status: 0, passou: false };
  const req = { header: (nome: string) => headers[nome.toLowerCase()] } as any;
  const res = {
    status(codigo: number) {
      resultado.status = codigo;
      return this;
    },
    json() {
      return this;
    },
  } as any;
  criarExigirSegredo(env)(req, res, () => {
    resultado.passou = true;
  });
  return resultado;
}

test("sem segredo, producao recusa e desenvolvimento passa", () => {
  assert.deepEqual(chamar({ NODE_ENV: "production" }), { status: 503, passou: false });
  assert.deepEqual(chamar({ NODE_ENV: "production", API_SHARED_SECRET: "   " }), { status: 503, passou: false });
  assert.equal(chamar({}).passou, true);
});

test("com segredo, desenvolvimento tambem exige", () => {
  assert.deepEqual(chamar({ API_SHARED_SECRET: "s3gredo" }), { status: 401, passou: false });
});

test("aceita x-api-secret e Bearer, recusa valor errado ou de outro tamanho", () => {
  const env = { NODE_ENV: "production", API_SHARED_SECRET: "s3gredo" };
  assert.equal(chamar(env, { "x-api-secret": "s3gredo" }).passou, true);
  assert.equal(chamar(env, { authorization: "Bearer s3gredo" }).passou, true);
  assert.equal(chamar(env, { "x-api-secret": "s3gredX" }).status, 401);
  assert.equal(chamar(env, { "x-api-secret": "curto" }).status, 401);
  assert.equal(chamar(env, { "x-api-secret": "" }).status, 401);
});

test("serve so deck: bucket, prefixo e extensao", () => {
  const deck = "brainhex/survivor/classe-32/topico-125/generation-d536/apresentacao/material-1-parte-01.html";
  assert.equal(deckPodeSerServido("conteudo_aluno", deck), true);
  assert.equal(deckPodeSerServido("conteudos", deck), false);
  assert.equal(deckPodeSerServido("conteudo_aluno", "fontes/classe-1/prova.html"), false);
  assert.equal(deckPodeSerServido("conteudo_aluno", "brainhex/survivor/classe-1/audio.mp3"), false);
  assert.equal(deckPodeSerServido("conteudo_aluno", "brainhex/../fontes/prova.html"), false);
  assert.equal(deckPodeSerServido("conteudo_aluno", "brainhex\\prova.html"), false);
});
