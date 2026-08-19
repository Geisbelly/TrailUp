import { test } from "node:test";
import assert from "node:assert/strict";
import { runAudioAndPresentationInParallel } from "../server";
import type { ContentPart } from "./services/geminiService";

if (!process.env.OPENAI_API_KEY?.trim()) {
  process.env.OPENAI_API_KEY = "test-openai-key";
}

function delay<T>(ms: number, value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

function fakePart(ordem: number): ContentPart {
  return {
    ordem,
    titulo: `Parte ${ordem}`,
    markdown: `md-${ordem}`,
    audioScript: `audio-${ordem}`,
    slides: [],
  };
}

// Achado do code review: apresentacao (chamada de rede ao BrainHexPDF) nao
// pode mais esperar o audio inteiro terminar primeiro - as duas devem
// disparar concorrentemente. Testa isso via tempo decorrido: se fossem
// sequenciais, o total seria >= soma dos dois delays; em paralelo, fica
// perto do maior delay isolado.
test("runAudioAndPresentationInParallel dispara audio e apresentacao concorrentemente (nao em serie)", async () => {
  const parts = [fakePart(1), fakePart(2)];
  const DELAY_MS = 80;

  const start = Date.now();
  await runAudioAndPresentationInParallel(parts, {
    generateAudio: (audioScript) => delay(DELAY_MS, { mp3: audioScript, wav: null }),
    audioConcurrency: parts.length,
    renderPresentation: (part) =>
      delay(DELAY_MS, { presentationUrl: `https://fake/${part.titulo}`, failure: null, dbWritten: false }),
  });
  const elapsed = Date.now() - start;

  // Sequencial (audio inteiro, so depois apresentacao) daria >= 2 * DELAY_MS
  // so pra 1 parte (e mais ainda com 2 partes). Paralelo fica perto de 1x.
  assert.ok(
    elapsed < DELAY_MS * 2,
    `esperava < ${DELAY_MS * 2}ms (paralelo), levou ${elapsed}ms`,
  );
});

test("runAudioAndPresentationInParallel preserva a ordem das partes e nao deixa uma falha derrubar as outras", async () => {
  const parts = [fakePart(1), fakePart(2), fakePart(3)];

  const result = await runAudioAndPresentationInParallel(parts, {
    generateAudio: (audioScript) =>
      audioScript === "audio-2"
        ? Promise.reject(new Error("falha simulada de audio"))
        : Promise.resolve({ mp3: audioScript, wav: null }),
    audioConcurrency: parts.length,
    renderPresentation: (part) =>
      Promise.resolve({ presentationUrl: `https://fake/${part.titulo}`, failure: null, dbWritten: false }),
  });

  assert.equal(result.audioSettled.length, 3);
  assert.equal(result.audioSettled[0].status, "fulfilled");
  assert.equal(result.audioSettled[1].status, "rejected");
  assert.equal(result.audioSettled[2].status, "fulfilled");

  assert.deepEqual(
    result.presentationResults.map((p) => p.presentationUrl),
    ["https://fake/Parte 1", "https://fake/Parte 2", "https://fake/Parte 3"],
  );
});
