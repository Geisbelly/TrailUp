import { test } from "node:test";
import assert from "node:assert/strict";
import {
  generateDecorativeIconImage,
  generateSceneImage,
  isOpenAiBillingHardLimitError,
  resetOpenAiImageCircuit,
} from "./openaiImageService";

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

test("isOpenAiBillingHardLimitError reconhece limite de billing atingido", () => {
  const error = Object.assign(new Error("400 Billing hard limit has been reached."), { status: 400 });
  assert.equal(isOpenAiBillingHardLimitError(error), true);
  assert.equal(isOpenAiBillingHardLimitError(new Error("429 rate_limit_exceeded")), false);
  assert.equal(isOpenAiBillingHardLimitError(new Error("imagem vazia")), false);
});

test("limite de billing da OpenAI abre circuito e as proximas imagens falham rapido sem nova chamada", async () => {
  resetOpenAiImageCircuit();
  let calls = 0;
  let now = 10_000;
  const generate = async () => {
    calls += 1;
    const error = new Error("400 Billing hard limit has been reached.");
    Object.assign(error, { status: 400 });
    throw error;
  };

  await assert.rejects(
    () => generateSceneImage("cena 1", 0, 0, { now: () => now, generate }),
    /Billing hard limit/,
  );
  assert.equal(calls, 1);

  now += 1_000; // ainda dentro do cooldown do circuito
  await assert.rejects(
    () => generateSceneImage("cena 2", 0, 0, { now: () => now, generate }),
    /circuito/i,
  );
  assert.equal(calls, 1, "nao deveria chamar o provedor de novo com o circuito aberto");

  resetOpenAiImageCircuit();
});

test("gera icone via OpenAI usando OPENAI_IMAGE_QUALITY (padrao medium)", async () => {
  resetOpenAiImageCircuit();
  let receivedQuality: unknown;
  const generate = async (args: { quality?: string }) => {
    receivedQuality = args.quality;
    return { data: [{ b64_json: "abc" }] };
  };
  const image = await generateDecorativeIconImage("icone", 0, 0, { generate });
  assert.equal(image, "abc");
  assert.equal(receivedQuality, "medium");
});

test("override de quality por chamada tem precedencia sobre OPENAI_IMAGE_QUALITY", async () => {
  resetOpenAiImageCircuit();
  const original = process.env.OPENAI_IMAGE_QUALITY;
  process.env.OPENAI_IMAGE_QUALITY = "low";
  try {
    let receivedQuality: unknown;
    const generate = async (args: { quality?: string }) => {
      receivedQuality = args.quality;
      return { data: [{ b64_json: "abc" }] };
    };
    await generateDecorativeIconImage("icone", 0, 0, { generate, quality: "high" });
    assert.equal(receivedQuality, "high");
  } finally {
    if (original !== undefined) process.env.OPENAI_IMAGE_QUALITY = original;
    else delete process.env.OPENAI_IMAGE_QUALITY;
  }
});
