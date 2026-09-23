import assert from "node:assert/strict";
import test from "node:test";

import MarkdownIt from "markdown-it";

import {
  conteudoDeBloco,
  liberarImagensEmbutidas,
  permiteImagemEmbutida,
} from "./markdownDataUri";

// Do jeito que o microservice publica: percent-encoded (nao base64) e com ","
// no lugar do ";" — as duas coisas que o markdown-it barrava.
const SVG = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 760 200"></svg>';
const URI_DO_DIAGRAMA =
  "data:image/svg+xml," + encodeURIComponent(SVG).replace(/\(/g, "%28").replace(/\)/g, "%29");

function temTokenDeImagem(md: MarkdownIt, markdown: string): boolean {
  return JSON.stringify(md.parse(markdown, {})).includes('"type":"image"');
}

test("sem a liberacao, o markdown-it descarta o diagrama — e o aluno ve a URI crua", () => {
  const md = new MarkdownIt();
  const markdown = `![Diagrama de fluxo: A → B](${URI_DO_DIAGRAMA})`;

  assert.equal(temTokenDeImagem(md, markdown), false);
  // O trecho nao some: vira texto literal, com os kilobytes de percent-encoding.
  assert.ok(md.render(markdown).includes("data:image/svg+xml,%3Csvg"));
});

test("com a liberacao, o diagrama vira token de imagem com a URI intacta", () => {
  const md = liberarImagensEmbutidas(new MarkdownIt());
  const markdown = `![Diagrama de fluxo: A → B](${URI_DO_DIAGRAMA})`;

  assert.equal(temTokenDeImagem(md, markdown), true);

  const imagem = md
    .parse(markdown, {})
    .flatMap((token) => token.children ?? [])
    .find((token) => token.type === "image");
  // A URI precisa chegar inteira no src: e dela que o decodeInlineSvgDataUri
  // recupera o XML pra desenhar com react-native-svg.
  assert.equal(imagem?.attrGet("src"), URI_DO_DIAGRAMA);
});

test("imagem do professor em base64 continua passando", () => {
  const md = liberarImagensEmbutidas(new MarkdownIt());
  const uri = "data:image/png;base64,iVBORw0KGgo=";

  assert.equal(temTokenDeImagem(md, `![foto](${uri})`), true);
});

test("liberar imagem nao abre a porta para link executavel", () => {
  const md = liberarImagensEmbutidas(new MarkdownIt());

  for (const perigoso of [
    "data:text/html,<script>alert(1)</script>",
    "javascript:alert(1)",
    "file:///etc/passwd",
  ]) {
    assert.equal(md.validateLink(perigoso), false, `deveria barrar: ${perigoso}`);
  }
});

test("link http comum segue valido", () => {
  const md = liberarImagensEmbutidas(new MarkdownIt());

  assert.equal(md.validateLink("https://trailup.vercel.app/material.md"), true);
});

test("permiteImagemEmbutida ignora espaco e caixa, e recusa o resto", () => {
  assert.equal(permiteImagemEmbutida("  DATA:IMAGE/SVG+XML,%3Csvg"), true);
  assert.equal(permiteImagemEmbutida("data:image/svg+xml,<svg/>"), true);
  assert.equal(permiteImagemEmbutida("data:application/pdf;base64,AAAA"), false);
  assert.equal(permiteImagemEmbutida("https://exemplo.test/a.png"), false);
  assert.equal(permiteImagemEmbutida(undefined as unknown as string), false);
});

test("conteudoDeBloco tira so a quebra final, preservando o desenho", () => {
  // Arte ASCII depende de espaco e alinhamento: nada alem do "\n" final pode
  // ser mexido.
  const arte = "+-------+\n|  Nó   |\n+-------+";
  assert.equal(conteudoDeBloco(arte + "\n"), arte);
  assert.equal(conteudoDeBloco(arte), arte);
  assert.equal(conteudoDeBloco("linha\n\n"), "linha\n");
  assert.equal(conteudoDeBloco(undefined), "");
});
