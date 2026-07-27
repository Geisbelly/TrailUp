import { test } from "node:test";
import assert from "node:assert/strict";

test("generateSceneImage lanca erro claro quando OPENAI_API_KEY nao esta configurada", async () => {
  const original = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  try {
    const { generateSceneImage } = await import("./openaiImageService.ts?nocache=" + Date.now());
    await assert.rejects(
      () => generateSceneImage("um teste qualquer"),
      /OPENAI_API_KEY/
    );
  } finally {
    if (original !== undefined) process.env.OPENAI_API_KEY = original;
  }
});
