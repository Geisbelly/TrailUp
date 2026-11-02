import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { FORMULA_AS_PLAIN_TEXT_RULE } from "./geminiService";

// #652: o gerador pede fórmula em texto corrido. O mobile converte LaTeX só na
// leitura do markdown (#588); áudio (TTS) e slides (BrainHexPDF) não passam por lá.

test("a regra proíbe LaTeX com os comandos escritos como o modelo os veria", () => {
  assert.match(FORMULA_AS_PLAIN_TEXT_RULE, /NUNCA use LaTeX nem cifrões para matemática/);
  // Barra simples no texto final: com escape errado no template literal,
  // `\f` virava form feed e o modelo leria "rac{a}{b}".
  assert.ok(FORMULA_AS_PLAIN_TEXT_RULE.includes("`\\frac{a}{b}`"));
  assert.ok(FORMULA_AS_PLAIN_TEXT_RULE.includes("`\\sqrt{2}`"));
  assert.ok(FORMULA_AS_PLAIN_TEXT_RULE.includes("`$x$`"));
  assert.ok(!FORMULA_AS_PLAIN_TEXT_RULE.includes("\f"));
});

test("a regra diz o que escrever no lugar e preserva o cifrão de reais", () => {
  assert.ok(FORMULA_AS_PLAIN_TEXT_RULE.includes("`x² + 3x = 0`"));
  assert.ok(FORMULA_AS_PLAIN_TEXT_RULE.includes("`a ≠ 0`"));
  assert.match(FORMULA_AS_PLAIN_TEXT_RULE, /No audioScript, escreva por extenso/);
  assert.ok(FORMULA_AS_PLAIN_TEXT_RULE.includes("R$ 1.200"));
});

test("a geração e as três regenerações usam a regra", () => {
  // A regra só vale se estiver no prompt de cada chamada que escreve material:
  // a instrução da geração (buildContentGenerationInstruction, usada por
  // processMediaWithGemini e pelo roteiro da retomada, #652),
  // regenerateChapterContent, regenerateSlideContent e regenerateDocumentMarkdown.
  const source = readFileSync(new URL("./geminiService.ts", import.meta.url), "utf-8");
  const usos = source.split("${FORMULA_AS_PLAIN_TEXT_RULE}").length - 1;
  assert.equal(usos, 4);
  for (const fn of ["processMediaWithGemini", "generateAudioScriptsWithGemini"]) {
    const inicio = source.indexOf(`export async function ${fn}(`);
    const proxima = source.indexOf("\nexport ", inicio + 1);
    assert.ok(source.slice(inicio, proxima).includes("buildContentGenerationInstruction("), `${fn} sem a instrução`);
  }
  for (const fn of [
    "buildContentGenerationInstruction",
    "regenerateChapterContent",
    "regenerateSlideContent",
    "regenerateDocumentMarkdown",
  ]) {
    const inicio = Math.max(
      source.indexOf(`export async function ${fn}(`),
      source.indexOf(`export function ${fn}(`),
    );
    assert.ok(inicio >= 0, fn);
    const proxima = source.indexOf("\nexport ", inicio + 1);
    const corpo = source.slice(inicio, proxima === -1 ? undefined : proxima);
    assert.ok(corpo.includes("${FORMULA_AS_PLAIN_TEXT_RULE}"), `${fn} sem a regra`);
  }
});
