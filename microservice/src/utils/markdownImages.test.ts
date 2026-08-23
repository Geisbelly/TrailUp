import assert from "node:assert/strict";
import test from "node:test";

import { deriveImagesForMedia, insertImagesIntoMarkdown } from "./markdownImages";

test("insere uma imagem apos cada heading de nivel 2, em round-robin", () => {
  const markdown = "## Primeira Seção\n\nTexto 1.\n\n## Segunda Seção\n\nTexto 2.\n\n## Terceira Seção\n\nTexto 3.";
  const images = [{ url: "https://x.test/a.png" }, { url: "https://x.test/b.png" }];

  const result = insertImagesIntoMarkdown(markdown, images);

  assert.match(result, /## Primeira Seção\n\n!\[Imagem de referência\]\(https:\/\/x\.test\/a\.png\)/);
  assert.match(result, /## Segunda Seção\n\n!\[Imagem de referência\]\(https:\/\/x\.test\/b\.png\)/);
  // 3a secao repete a 1a imagem (round-robin com so 2 imagens disponiveis)
  assert.match(result, /## Terceira Seção\n\n!\[Imagem de referência\]\(https:\/\/x\.test\/a\.png\)/);
});

test("sem imagens disponiveis: retorna o markdown sem alteracao", () => {
  const markdown = "## Única Seção\n\nTexto.";
  assert.equal(insertImagesIntoMarkdown(markdown, []), markdown);
});

test("markdown sem nenhum heading de nivel 2: retorna sem alteracao", () => {
  const markdown = "Texto solto, sem headings.\n\nMais texto.";
  const images = [{ url: "https://x.test/a.png" }];
  assert.equal(insertImagesIntoMarkdown(markdown, images), markdown);
});

test("preserva o conteudo original integralmente, so adiciona as linhas de imagem", () => {
  const markdown = "## Seção\n\nParágrafo importante que não pode sumir.";
  const images = [{ url: "https://x.test/a.png" }];

  const result = insertImagesIntoMarkdown(markdown, images);

  assert.match(result, /Parágrafo importante que não pode sumir\./);
});

test("deriveImagesForMedia: imagem do professor sempre vence quando existe", () => {
  const attachments = [{ url: "https://x.test/professor.png" }];
  const generated = { DNS: "data:image/png;base64,AAA" };

  assert.deepEqual(deriveImagesForMedia(attachments, generated), attachments);
});

test("deriveImagesForMedia: sem imagem do professor, cai pras imagens geradas por IA", () => {
  const generated = { DNS: "data:image/png;base64,AAA", Cache: "data:image/jpeg;base64,BBB" };

  assert.deepEqual(deriveImagesForMedia([], generated), [
    { url: "data:image/png;base64,AAA" },
    { url: "data:image/jpeg;base64,BBB" },
  ]);
});

test("deriveImagesForMedia: sem professor e sem gerada, retorna array vazio", () => {
  assert.deepEqual(deriveImagesForMedia([], undefined), []);
  assert.deepEqual(deriveImagesForMedia([], null), []);
  assert.deepEqual(deriveImagesForMedia([], {}), []);
});
