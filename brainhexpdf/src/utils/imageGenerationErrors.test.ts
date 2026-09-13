import assert from "node:assert/strict";
import { test } from "node:test";

import {
  ImageGenerationUnavailableError,
  isImageGenerationUnavailableError,
} from "./imageGenerationErrors";

test("reconhece o erro real de prepayment esgotado (case-insensitive)", () => {
  const err = new Error(
    '{"error":{"code":429,"message":"Your prepayment credits are depleted. Please go to AI Studio at https://ai.studio/projects to manage your project and billing.","status":"RESOURCE_EXHAUSTED"}}'
  );
  assert.equal(isImageGenerationUnavailableError(err), true);

  const shoutingCase = new Error("PREPAYMENT CREDITS ARE DEPLETED");
  assert.equal(isImageGenerationUnavailableError(shoutingCase), true);
});

test("nao reconhece falhas transitorias (rate-limit por minuto, sobrecarga) como irrecuperaveis", () => {
  const rateLimited = new Error(
    '{"error":{"code":429,"message":"You exceeded your current quota... Please retry in 24.383012224s.","status":"RESOURCE_EXHAUSTED"}}'
  );
  assert.equal(isImageGenerationUnavailableError(rateLimited), false);

  const overloaded = new Error("503 Sobrecarga");
  assert.equal(isImageGenerationUnavailableError(overloaded), false);
});

test("nao quebra com erro sem message ou valores nao-Error", () => {
  assert.equal(isImageGenerationUnavailableError({}), false);
  assert.equal(isImageGenerationUnavailableError(null), false);
  assert.equal(isImageGenerationUnavailableError(undefined), false);
  assert.equal(isImageGenerationUnavailableError("string crua"), false);
});

test("ImageGenerationUnavailableError preserva a mensagem e tem name proprio", () => {
  const err = new ImageGenerationUnavailableError("prepayment credits are depleted");
  assert.equal(err.message, "prepayment credits are depleted");
  assert.equal(err.name, "ImageGenerationUnavailableError");
  assert.ok(err instanceof Error);
});
