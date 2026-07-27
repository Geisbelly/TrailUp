import { test } from "node:test";
import assert from "node:assert/strict";
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
  // Regressao: sourceIds e metadado de rastreabilidade interna que antes
  // vazava como "Ref: pptx-sN" visivel no PDF do aluno.
  const buf = await generateSlidesPDF(
    [{ titulo: "Slide 1", sourceIds: ["pptx-s1", "pptx-s2"] }],
    "seeker"
  );
  const text = buf.toString("latin1");
  assert.ok(!text.includes("pptx-s1"));
});

test("usa a imagem_referencia (full-bleed) quando presente, sem lancar excecao", async () => {
  const fakePng =
    "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
  const buf = await generateSlidesPDF(
    [{ titulo: "Com imagem", imagem_referencia: fakePng, characterQuote: "fala longa de teste pra checar quebra de linha do balao inteiro" }],
    "mastermind"
  );
  assert.equal(buf.subarray(0, 4).toString("ascii"), "%PDF");
});

test("multiplos slides geram multiplas paginas", async () => {
  const buf = await generateSlidesPDF(
    [{ titulo: "S1" }, { titulo: "S2" }, { titulo: "S3" }],
    "achiever"
  );
  const text = buf.toString("latin1");
  const pageCountMatch = text.match(/\/Type\s*\/Page[^s]/g) || [];
  assert.equal(pageCountMatch.length, 3);
});
