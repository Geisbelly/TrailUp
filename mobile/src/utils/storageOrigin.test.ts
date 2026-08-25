import assert from "node:assert/strict";
import test from "node:test";

import { origemDeStorageConfiavel, reancorarNaOrigemDoApp } from "./storageOrigin";

const APP = "https://xrebtkmdewolzmpsdwgh.supabase.co";
const INTERNO = "http://trailup-microservice-gmgqkw:3000";

test("origem igual a do app e confiavel", () => {
  assert.equal(origemDeStorageConfiavel(APP, APP), true);
});

test("host interno do deploy NAO e confiavel (caso real do ERR_NAME_NOT_RESOLVED)", () => {
  assert.equal(origemDeStorageConfiavel(INTERNO, APP), false);
});

test("compara ignorando barra final e caixa", () => {
  assert.equal(origemDeStorageConfiavel(`${APP}/`, APP), true);
  assert.equal(origemDeStorageConfiavel(APP.toUpperCase(), APP), true);
});

test("sem origem conhecida do app, mantem o que veio (nao quebra o que funciona)", () => {
  assert.equal(origemDeStorageConfiavel(INTERNO, null), true);
  assert.equal(origemDeStorageConfiavel(INTERNO, ""), true);
});

test("reancora o caminho do bucket na origem do app", () => {
  const url = reancorarNaOrigemDoApp({
    appOrigin: APP,
    bucket: "conteudo_aluno",
    objectPath: "brainhex/survivor/classe-32/apresentacao/material-abc.html",
  });

  assert.equal(
    url,
    `${APP}/storage/v1/object/public/conteudo_aluno/brainhex/survivor/classe-32/apresentacao/material-abc.html`,
  );
});

test("escapa cada segmento, sem transformar as barras em %2F", () => {
  const url = reancorarNaOrigemDoApp({
    appOrigin: APP,
    bucket: "conteudo_aluno",
    objectPath: "pasta com espaco/arquivo final.html",
  });

  assert.match(url ?? "", /pasta%20com%20espaco\/arquivo%20final\.html$/);
  assert.ok(!(url ?? "").includes("%2F"));
});

test("ignora barra final da origem, sem duplicar", () => {
  const url = reancorarNaOrigemDoApp({
    appOrigin: `${APP}/`,
    bucket: "b",
    objectPath: "x.html",
  });

  assert.equal(url, `${APP}/storage/v1/object/public/b/x.html`);
});

test("sem dados suficientes devolve null (quem chama mantem a url original)", () => {
  assert.equal(reancorarNaOrigemDoApp({ appOrigin: null, bucket: "b", objectPath: "x" }), null);
  assert.equal(reancorarNaOrigemDoApp({ appOrigin: APP, bucket: null, objectPath: "x" }), null);
  assert.equal(reancorarNaOrigemDoApp({ appOrigin: APP, bucket: "b", objectPath: "" }), null);
  assert.equal(reancorarNaOrigemDoApp({ appOrigin: APP, bucket: "b", objectPath: "///" }), null);
});
