import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveRealSlideOrder } from "./pptxSlideOrder";

const RELS_XML = `<?xml version="1.0"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type=".../slide" Target="slides/slide1.xml"/>
  <Relationship Id="rId2" Type=".../slide" Target="slides/slide2.xml"/>
  <Relationship Id="rId3" Type=".../slide" Target="slides/slide8.xml"/>
  <Relationship Id="rId9" Type=".../slideMaster" Target="slideMasters/slideMaster1.xml"/>
</Relationships>`;

function presentationXmlWithOrder(relIds: string[]): string {
  const sldIds = relIds
    .map((id, i) => `<p:sldId id="${256 + i}" r:id="${id}"/>`)
    .join("");
  return `<?xml version="1.0"?>
<p:presentation xmlns:p="p" xmlns:r="r">
  <p:sldIdLst>${sldIds}</p:sldIdLst>
</p:presentation>`;
}

test("usa a ordem real de sldIdLst, nao o numero no nome do arquivo", () => {
  // Professor moveu o slide8 para o inicio no PowerPoint sem "salvar como" —
  // o arquivo continua se chamando slide8.xml, mas e logicamente o primeiro.
  const presentationXml = presentationXmlWithOrder(["rId3", "rId1", "rId2"]);
  const availableSlideFiles = [
    "ppt/slides/slide1.xml",
    "ppt/slides/slide2.xml",
    "ppt/slides/slide8.xml",
  ];

  const order = resolveRealSlideOrder(presentationXml, RELS_XML, availableSlideFiles);

  assert.deepEqual(order, [
    "ppt/slides/slide8.xml",
    "ppt/slides/slide1.xml",
    "ppt/slides/slide2.xml",
  ]);
});

test("cai para ordem por nome de arquivo quando presentation.xml nao pode ser resolvido", () => {
  const availableSlideFiles = [
    "ppt/slides/slide2.xml",
    "ppt/slides/slide10.xml",
    "ppt/slides/slide1.xml",
  ];

  const order = resolveRealSlideOrder("<xml sem sldIdLst/>", RELS_XML, availableSlideFiles);

  assert.deepEqual(order, [
    "ppt/slides/slide1.xml",
    "ppt/slides/slide2.xml",
    "ppt/slides/slide10.xml",
  ]);
});

test("nunca perde nem duplica slides mesmo se a resolucao for parcial", () => {
  // rId3 (slide8) nao esta nos rels resolvidos aqui de proposito.
  const partialRels = `<Relationships>
    <Relationship Id="rId1" Target="slides/slide1.xml"/>
  </Relationships>`;
  const presentationXml = presentationXmlWithOrder(["rId1", "rId3"]);
  const availableSlideFiles = ["ppt/slides/slide1.xml", "ppt/slides/slide8.xml"];

  const order = resolveRealSlideOrder(presentationXml, partialRels, availableSlideFiles);

  assert.equal(order.length, availableSlideFiles.length);
  assert.deepEqual([...order].sort(), [...availableSlideFiles].sort());
  // O resolvido (slide1) vem antes do nao resolvido (slide8, caiu no fallback).
  assert.deepEqual(order, ["ppt/slides/slide1.xml", "ppt/slides/slide8.xml"]);
});
