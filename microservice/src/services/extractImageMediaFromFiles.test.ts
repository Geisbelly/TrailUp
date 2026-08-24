import assert from "node:assert/strict";
import test from "node:test";
import JSZip from "jszip";

import { extractImageMediaFromFiles, extractRawFromDOCX } from "./geminiService";

const PPTX_MIME = "application/vnd.openxmlformats-officedocument.presentationml.presentation";
const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

// 1x1 PNG valido (menor PNG possivel) - so precisa ser bytes reais, o
// conteudo da imagem em si nao importa pro teste.
const TINY_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";

async function buildFakePptxBase64(imageName = "image1.png"): Promise<string> {
  const zip = new JSZip();
  zip.file("ppt/media/" + imageName, TINY_PNG_BASE64, { base64: true });
  const buffer = await zip.generateAsync({ type: "nodebuffer" });
  return buffer.toString("base64");
}

const MINIMAL_DOCUMENT_XML =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
  '<w:body><w:p><w:r><w:t>Conteudo de teste.</w:t></w:r></w:p></w:body>' +
  "</w:document>";

async function buildFakeDocxBase64(imageName = "image1.png"): Promise<string> {
  const zip = new JSZip();
  // mammoth precisa de uma estrutura minima valida de .docx pra nao lancar
  // erro ao extrair o texto (document.xml e obrigatorio).
  zip.file("word/document.xml", MINIMAL_DOCUMENT_XML);
  zip.file("word/media/" + imageName, TINY_PNG_BASE64, { base64: true });
  const buffer = await zip.generateAsync({ type: "nodebuffer" });
  return buffer.toString("base64");
}

test("extrai imagens embutidas de um .pptx (conteudo base do professor)", async () => {
  const pptxBase64 = await buildFakePptxBase64();
  const filesData = [{ data: pptxBase64, mimeType: PPTX_MIME, name: "aula.pptx" }];

  const media = await extractImageMediaFromFiles(filesData);

  assert.equal(media.length, 1);
  assert.equal(media[0].mimeType, "image/png");
  assert.equal(media[0].data, TINY_PNG_BASE64);
});

test("extrai imagens embutidas de um .docx (conteudo base do professor)", async () => {
  const docxBase64 = await buildFakeDocxBase64();
  const filesData = [{ data: docxBase64, mimeType: DOCX_MIME, name: "aula.docx" }];

  const media = await extractImageMediaFromFiles(filesData);

  assert.equal(media.length, 1);
  assert.equal(media[0].mimeType, "image/png");
});

test("ignora arquivos que nao sao pptx/docx (ex.: imagem avulsa, texto)", async () => {
  const filesData = [
    { data: TINY_PNG_BASE64, mimeType: "image/png", name: "foto.png" },
    { data: "dGV4dG8=", mimeType: "text/plain", name: "notas.txt" },
  ];

  const media = await extractImageMediaFromFiles(filesData);

  assert.deepEqual(media, []);
});

test("agrega imagens de varios arquivos pptx/docx numa lista so", async () => {
  const pptxBase64 = await buildFakePptxBase64("image1.png");
  const docxBase64 = await buildFakeDocxBase64("image1.png");
  const filesData = [
    { data: pptxBase64, mimeType: PPTX_MIME, name: "aula1.pptx" },
    { data: docxBase64, mimeType: DOCX_MIME, name: "aula2.docx" },
  ];

  const media = await extractImageMediaFromFiles(filesData);

  assert.equal(media.length, 2);
});

test("pptx corrompido/invalido nao derruba a extracao - so nao produz imagem pra aquele arquivo", async () => {
  const filesData = [{ data: "isso-nao-e-um-zip-valido", mimeType: PPTX_MIME, name: "corrompido.pptx" }];

  const media = await extractImageMediaFromFiles(filesData);

  assert.deepEqual(media, []);
});

test("lista vazia de arquivos retorna lista vazia de midia, sem quebrar", async () => {
  assert.deepEqual(await extractImageMediaFromFiles([]), []);
});

test("extractRawFromDOCX extrai o TEXTO do documento (mammoth.extractRawText com 'buffer', nao 'arrayBuffer')", async () => {
  const zip = new JSZip();
  zip.file("word/document.xml", MINIMAL_DOCUMENT_XML);
  const buffer = await zip.generateAsync({ type: "nodebuffer" });

  const result = await extractRawFromDOCX(
    buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength),
  );

  assert.equal(result.blocks.length, 1);
  assert.match(result.blocks[0].text, /Conteudo de teste\./);
});
