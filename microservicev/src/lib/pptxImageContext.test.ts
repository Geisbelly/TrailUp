import assert from "node:assert/strict";
import test from "node:test";

import {
  buildImageSourceContexts,
  parseSlideImageRelIds,
  parseSlideImageRels,
  parseSlideText,
} from "./pptxImageContext";

const SLIDE_SOCKETS = `<?xml version="1.0"?><p:sld xmlns:a="x" xmlns:r="y">
  <p:cSld><p:spTree>
    <p:sp><p:txBody><a:p><a:r><a:t>Abstração de Sockets</a:t></a:r></a:p>
      <a:p><a:r><a:t>O socket é o ponto final da comunicação.</a:t></a:r></a:p></p:txBody></p:sp>
    <p:pic><p:blipFill><a:blip r:embed="rId2"/></p:blipFill></p:pic>
  </p:spTree></p:cSld></p:sld>`;

const RELS_SOCKETS = `<?xml version="1.0"?><Relationships>
  <Relationship Id="rId1" Type=".../slideLayout" Target="../slideLayouts/slideLayout1.xml"/>
  <Relationship Id="rId2" Type=".../image" Target="../media/image7.png"/>
</Relationships>`;

const SLIDE_PORTAS = `<?xml version="1.0"?><p:sld xmlns:a="x" xmlns:r="y">
  <p:cSld><p:spTree>
    <p:sp><p:txBody><a:p><a:r><a:t>Portas e Multiplexação</a:t></a:r></a:p></p:txBody></p:sp>
    <p:pic><p:blipFill><a:blip r:embed="rId5"/></p:blipFill></p:pic>
  </p:spTree></p:cSld></p:sld>`;

const RELS_PORTAS = `<?xml version="1.0"?><Relationships>
  <Relationship Id="rId5" Type=".../image" Target="../media/image2.jpeg"/>
</Relationships>`;

test("le os ids de relacionamento de imagem do slide", () => {
  assert.deepEqual(parseSlideImageRelIds(SLIDE_SOCKETS), ["rId2"]);
});

test("nao repete o mesmo id quando a imagem aparece duas vezes no slide", () => {
  const xml = '<a:blip r:embed="rId2"/><a:blip r:embed="rId2"/><a:blip r:embed="rId9"/>';
  assert.deepEqual(parseSlideImageRelIds(xml), ["rId2", "rId9"]);
});

test("reconhece imagem vinculada por r:link, nao so por r:embed", () => {
  assert.deepEqual(parseSlideImageRelIds('<a:blip r:link="rId4"/>'), ["rId4"]);
});

test("traduz o id do relacionamento para o arquivo em ppt/media", () => {
  const rels = parseSlideImageRels(RELS_SOCKETS);

  assert.equal(rels.get("rId2"), "ppt/media/image7.png");
});

test("ignora relacionamento que nao aponta pra media (layout, notas, tema)", () => {
  const rels = parseSlideImageRels(RELS_SOCKETS);

  assert.equal(rels.has("rId1"), false);
  assert.equal(rels.size, 1);
});

test("ignora imagem externa por URL (nao ha bytes dela no pacote)", () => {
  const rels = parseSlideImageRels(
    '<Relationships><Relationship Id="rId3" Target="https://x.test/foto.png"/></Relationships>',
  );

  assert.equal(rels.size, 0);
});

test("extrai o texto visivel do slide em uma linha", () => {
  assert.equal(
    parseSlideText(SLIDE_SOCKETS),
    "Abstração de Sockets O socket é o ponto final da comunicação.",
  );
});

test("relaciona cada imagem ao texto do slide de onde ela veio", () => {
  const contextos = buildImageSourceContexts([
    { slideXml: SLIDE_SOCKETS, relsXml: RELS_SOCKETS },
    { slideXml: SLIDE_PORTAS, relsXml: RELS_PORTAS },
  ]);

  assert.match(contextos.get("ppt/media/image7.png")!.sourceText, /Abstração de Sockets/);
  assert.match(contextos.get("ppt/media/image2.jpeg")!.sourceText, /Portas e Multiplexação/);
});

test("guarda a posicao do slide na ordem real (1-based)", () => {
  const contextos = buildImageSourceContexts([
    { slideXml: SLIDE_SOCKETS, relsXml: RELS_SOCKETS },
    { slideXml: SLIDE_PORTAS, relsXml: RELS_PORTAS },
  ]);

  assert.equal(contextos.get("ppt/media/image7.png")!.sourceOrder, 1);
  assert.equal(contextos.get("ppt/media/image2.jpeg")!.sourceOrder, 2);
});

test("imagem repetida em varios slides acumula o texto dos dois (sinal de que nao e de um assunto so)", () => {
  const contextos = buildImageSourceContexts([
    { slideXml: SLIDE_SOCKETS, relsXml: RELS_SOCKETS },
    // Mesmo arquivo de midia referenciado por outro slide, com outro rId.
    {
      slideXml: SLIDE_PORTAS.replace("rId5", "rId8"),
      relsXml: '<Relationships><Relationship Id="rId8" Target="../media/image7.png"/></Relationships>',
    },
  ]);

  const contexto = contextos.get("ppt/media/image7.png")!;
  assert.match(contexto.sourceText, /Abstração de Sockets/);
  assert.match(contexto.sourceText, /Portas e Multiplexação/);
  // A posicao continua sendo a da PRIMEIRA aparicao.
  assert.equal(contexto.sourceOrder, 1);
});

test("slide sem imagem nao entra no mapa", () => {
  const contextos = buildImageSourceContexts([
    { slideXml: "<p:sld><a:t>Só texto</a:t></p:sld>", relsXml: "<Relationships/>" },
  ]);

  assert.equal(contextos.size, 0);
});

test("rels ausente/vazio nao quebra a extracao", () => {
  const contextos = buildImageSourceContexts([{ slideXml: SLIDE_SOCKETS, relsXml: "" }]);

  assert.equal(contextos.size, 0);
});
