import assert from "node:assert/strict";
import test from "node:test";

import { BUCKETS_PRIVADOS, exigeAssinatura, normalizeObjectPath } from "./storageUrlShape";

const PROFESSOR = "b49f2e21-a6f9-4c8d-9533-5a32bb219754";

test("o bucket do material do professor (conteudos) e' privado desde a 20261024_10", () => {
  for (const bucket of ["conteudo_aluno", "conteudos", "perfil_fotos", "banners_fotos"]) {
    assert.ok(BUCKETS_PRIVADOS.has(bucket), bucket);
  }
});

test("URL publica antiga de bucket privado precisa ser assinada; a assinada e as publicas de verdade nao", () => {
  assert.equal(exigeAssinatura({ mode: "public", bucket: "conteudos" }), true);
  assert.equal(exigeAssinatura({ mode: "authenticated", bucket: "conteudos" }), true);
  assert.equal(exigeAssinatura({ mode: "sign", bucket: "conteudos" }), false);
  assert.equal(exigeAssinatura({ mode: "public", bucket: "trailup-slides" }), false);
});

test("caminho sem dica de bucket na pasta de um professor vai para conteudos", () => {
  assert.deepEqual(normalizeObjectPath(`${PROFESSOR}/114/1_aula.pdf`), {
    bucket: "conteudos",
    objectPath: `${PROFESSOR}/114/1_aula.pdf`,
  });
  // a dica explicita continua mandando
  assert.deepEqual(normalizeObjectPath(`${PROFESSOR}/114/1_aula.pdf`, "conteudo_aluno"), {
    bucket: "conteudo_aluno",
    objectPath: `${PROFESSOR}/114/1_aula.pdf`,
  });
  // o resto segue no conteudo_aluno
  assert.deepEqual(normalizeObjectPath("fontes/classe-1/a.pdf"), {
    bucket: "conteudo_aluno",
    objectPath: "fontes/classe-1/a.pdf",
  });
});
