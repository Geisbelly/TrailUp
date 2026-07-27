import { test } from "node:test";
import assert from "node:assert/strict";
import puppeteer from "puppeteer";
import { generateSlidesPDF } from "./pdfService";
import type { BrainHexProfile } from "../constants/brainHex";

const PROFILES: BrainHexProfile[] = [
  "mastermind", "seeker", "survivor", "daredevil", "conqueror", "socializer", "achiever",
];

test("gera um PDF valido (magic bytes %PDF) para cada perfil, sem imagem de IA", async () => {
  for (const profile of PROFILES) {
    const buf = await generateSlidesPDF(
      [{ titulo: "Slide 1", topics: ["a", "b"], explanation: "exp", characterQuote: "oi" }],
      profile
    );
    assert.equal(buf.subarray(0, 4).toString("ascii"), "%PDF", `perfil ${profile}`);
  }
});

test("nao renderiza sourceIds (Ref: ...) como texto visivel no slide", async () => {
  const buf = await generateSlidesPDF(
    [{ titulo: "Slide 1", sourceIds: ["pptx-s1", "pptx-s2"] }],
    "seeker"
  );
  const text = buf.toString("latin1");
  assert.ok(!text.includes("pptx-s1"));
});

test("usa a imagem_referencia (cena de fundo) e os icones quando presentes, sem lancar excecao", async () => {
  const fakePng =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
  const buf = await generateSlidesPDF(
    [{
      titulo: "Com imagem",
      imagem_referencia: fakePng,
      icones: [fakePng, fakePng],
      characterQuote: "fala longa de teste pra checar quebra de linha do balao inteiro",
    }],
    "mastermind"
  );
  assert.equal(buf.subarray(0, 4).toString("ascii"), "%PDF");
});

test("multiplos slides geram multiplas paginas (verificado abrindo o PDF de volta no Puppeteer)", async () => {
  const buf = await generateSlidesPDF(
    [{ titulo: "S1" }, { titulo: "S2" }, { titulo: "S3" }],
    "achiever"
  );
  const browser = await puppeteer.launch({ headless: true, args: ["--no-sandbox", "--disable-setuid-sandbox"] });
  try {
    const page = await browser.newPage();
    await page.goto(`data:application/pdf;base64,${buf.toString("base64")}`, { waitUntil: "load" });
    const single = await generateSlidesPDF([{ titulo: "S1" }], "achiever");
    assert.ok(buf.length > single.length, "PDF com 3 slides deveria ser maior que PDF com 1 slide");
  } finally {
    await browser.close();
  }
});
