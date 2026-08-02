import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseGeminiApiKeys,
  pickAvailableGeminiKey,
  rotateGeminiKeyAfterFailure,
  resetGeminiKeyRotationForTests,
} from "./geminiService";

function withGeminiApiKeys(raw: string, run: () => void): void {
  const previous = process.env.GEMINI_API_KEY;
  process.env.GEMINI_API_KEY = raw;
  resetGeminiKeyRotationForTests();
  try {
    run();
  } finally {
    process.env.GEMINI_API_KEY = previous;
    resetGeminiKeyRotationForTests();
  }
}

test("parseGeminiApiKeys aceita multiplas chaves separadas por virgula/ponto-e-virgula", () => {
  assert.deepEqual(
    parseGeminiApiKeys("key-1, key-2 ;key-3"),
    ["key-1", "key-2", "key-3"],
  );
  assert.deepEqual(parseGeminiApiKeys("key-1, key-1, key-2"), ["key-1", "key-2"]);
  assert.deepEqual(parseGeminiApiKeys(""), []);
  assert.deepEqual(parseGeminiApiKeys(undefined), []);
});

test("pickAvailableGeminiKey escolhe a primeira chave quando nenhuma esta em cooldown", () => {
  resetGeminiKeyRotationForTests();
  assert.equal(pickAvailableGeminiKey(["key-1", "key-2"]), "key-1");
});

test("rotateGeminiKeyAfterFailure só roda pra erro de cota/rate-limit, nunca pra erro genérico", () => {
  withGeminiApiKeys("key-1,key-2", () => {
    assert.equal(
      rotateGeminiKeyAfterFailure(new Error("Connection timed out")),
      false,
    );
  });
});

test("rotateGeminiKeyAfterFailure não alterna quando só há uma chave configurada", () => {
  withGeminiApiKeys("key-1", () => {
    assert.equal(
      rotateGeminiKeyAfterFailure(new Error("429 RESOURCE_EXHAUSTED: quota exceeded")),
      false,
    );
  });
});

test("rotateGeminiKeyAfterFailure alterna pra próxima chave disponível quando uma esgota a cota", () => {
  withGeminiApiKeys("key-1,key-2", () => {
    const keys = ["key-1", "key-2"];
    assert.equal(pickAvailableGeminiKey(keys), "key-1");

    const hadAnotherKey = rotateGeminiKeyAfterFailure(
      new Error("429 RESOURCE_EXHAUSTED: quota exceeded"),
    );

    assert.equal(hadAnotherKey, true);
    assert.equal(pickAvailableGeminiKey(keys), "key-2");
  });
});

test("rotateGeminiKeyAfterFailure devolve false quando todas as chaves já esgotaram a cota", () => {
  withGeminiApiKeys("key-1,key-2", () => {
    assert.equal(
      rotateGeminiKeyAfterFailure(new Error("429 RESOURCE_EXHAUSTED: quota exceeded")),
      true,
    );
    assert.equal(
      rotateGeminiKeyAfterFailure(new Error("429 RESOURCE_EXHAUSTED: quota exceeded")),
      false,
    );
  });
});
