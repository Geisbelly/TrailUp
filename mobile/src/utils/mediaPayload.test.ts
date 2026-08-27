import assert from "node:assert/strict";
import test from "node:test";

import { resolveMediaText, resolveMediaTitle, resolveMediaUrl } from "./mediaPayload";

test("acha a url no campo obvio", () => {
  assert.equal(resolveMediaUrl({ url: "https://x.test/a.mp3" }), "https://x.test/a.mp3");
  assert.equal(resolveMediaUrl({ uri: "https://x.test/b.mp3" }), "https://x.test/b.mp3");
  assert.equal(resolveMediaUrl({ src: "https://x.test/c.mp3" }), "https://x.test/c.mp3");
});

test("acha em arquivo_url - o caso que fazia a midia DESAPARECER", () => {
  // O banco grava assim; audio/video/imagem liam so url/uri/src e devolviam
  // null, entao o bloco nao renderizava nada e o aluno via espaco vazio.
  assert.equal(resolveMediaUrl({ arquivo_url: "https://x.test/audio.mp3" }), "https://x.test/audio.mp3");
});

test("cobre os apelidos que aparecem no projeto", () => {
  for (const chave of [
    "arquivoUrl",
    "file_url",
    "fileUrl",
    "documento_url",
    "documentoUrl",
    "audio_url",
    "publicUrl",
    "signedUrl",
    "storage_path",
    "storagePath",
  ]) {
    assert.equal(resolveMediaUrl({ [chave]: "https://x.test/m" }), "https://x.test/m", chave);
  }
});

test("url no metadata tambem vale (payload sem campo de cima)", () => {
  assert.equal(
    resolveMediaUrl({ metadata: { arquivo_url: "https://x.test/no-metadata.mp3" } }),
    "https://x.test/no-metadata.mp3",
  );
});

test("material multi-parte: cai na parte 1 quando o campo de cima esta vazio", () => {
  const payload = {
    partes: [
      { ordem: 1, arquivo_url: "https://x.test/parte-01.mp3" },
      { ordem: 2, arquivo_url: "https://x.test/parte-02.mp3" },
    ],
  };

  assert.equal(resolveMediaUrl(payload), "https://x.test/parte-01.mp3");
});

test("o campo de cima ganha da parte 1 (nao troca o que ja funcionava)", () => {
  const payload = {
    arquivo_url: "https://x.test/completo.mp3",
    partes: [{ ordem: 1, arquivo_url: "https://x.test/parte-01.mp3" }],
  };

  assert.equal(resolveMediaUrl(payload), "https://x.test/completo.mp3");
});

test("payload string e a propria url", () => {
  assert.equal(resolveMediaUrl("https://x.test/direto.mp3"), "https://x.test/direto.mp3");
});

test("campo presente mas vazio nao conta como url", () => {
  assert.equal(resolveMediaUrl({ url: "   " }), null);
  assert.equal(resolveMediaUrl(""), null);
});

test("payload sem nada utilizavel devolve null", () => {
  assert.equal(resolveMediaUrl(null), null);
  assert.equal(resolveMediaUrl(undefined), null);
  assert.equal(resolveMediaUrl({}), null);
  assert.equal(resolveMediaUrl({ titulo: "sem midia" }), null);
  assert.equal(resolveMediaUrl([1, 2, 3]), null);
});

test("ordem de preferencia: url antes de storage_path", () => {
  const payload = { storage_path: "pasta/arquivo.mp3", url: "https://x.test/publico.mp3" };
  assert.equal(resolveMediaUrl(payload), "https://x.test/publico.mp3");
});

test("resolveMediaText le os apelidos de texto", () => {
  assert.equal(resolveMediaText({ markdown: "# Titulo" }), "# Titulo");
  assert.equal(resolveMediaText({ texto: "corpo" }), "corpo");
  assert.equal(resolveMediaText({ roteiro: "narracao" }), "narracao");
  assert.equal(resolveMediaText("solto"), "solto");
  assert.equal(resolveMediaText({ url: "https://x.test" }), null);
});

test("resolveMediaTitle acha o rotulo quando existe", () => {
  assert.equal(resolveMediaTitle({ titulo: "Aula 4" }), "Aula 4");
  assert.equal(resolveMediaTitle({ title: "Lesson" }), "Lesson");
  assert.equal(resolveMediaTitle({ url: "x" }), null);
});
