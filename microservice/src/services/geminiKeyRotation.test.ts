import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseGeminiApiKeys,
  pickAvailableGeminiKey,
  rotateGeminiKeyAfterFailure,
  resetGeminiKeyRotationForTests,
} from "./geminiService";

const PRIMARY_MODEL = "gemini-3.6-flash";
const FALLBACK_MODEL = "gemini-2.5-flash-lite";

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
  assert.equal(pickAvailableGeminiKey(["key-1", "key-2"], PRIMARY_MODEL), "key-1");
});

test("rotateGeminiKeyAfterFailure só roda pra erro de cota/rate-limit, nunca pra erro genérico", () => {
  withGeminiApiKeys("key-1,key-2", () => {
    assert.equal(
      rotateGeminiKeyAfterFailure(new Error("Connection timed out"), PRIMARY_MODEL),
      false,
    );
  });
});

test("rotateGeminiKeyAfterFailure não alterna quando só há uma chave configurada", () => {
  withGeminiApiKeys("key-1", () => {
    assert.equal(
      rotateGeminiKeyAfterFailure(new Error("429 RESOURCE_EXHAUSTED: quota exceeded"), PRIMARY_MODEL),
      false,
    );
  });
});

test("rotateGeminiKeyAfterFailure alterna pra próxima chave disponível quando uma esgota a cota", () => {
  withGeminiApiKeys("key-1,key-2", () => {
    const keys = ["key-1", "key-2"];
    assert.equal(pickAvailableGeminiKey(keys, PRIMARY_MODEL), "key-1");

    const hadAnotherKey = rotateGeminiKeyAfterFailure(
      new Error("429 RESOURCE_EXHAUSTED: quota exceeded"),
      PRIMARY_MODEL,
    );

    assert.equal(hadAnotherKey, true);
    assert.equal(pickAvailableGeminiKey(keys, PRIMARY_MODEL), "key-2");
  });
});

test("rotateGeminiKeyAfterFailure devolve false quando todas as chaves já esgotaram a cota do modelo", () => {
  withGeminiApiKeys("key-1,key-2", () => {
    assert.equal(
      rotateGeminiKeyAfterFailure(new Error("429 RESOURCE_EXHAUSTED: quota exceeded"), PRIMARY_MODEL),
      true,
    );
    assert.equal(
      rotateGeminiKeyAfterFailure(new Error("429 RESOURCE_EXHAUSTED: quota exceeded"), PRIMARY_MODEL),
      false,
    );
  });
});

test("cooldown de cota e por (chave, modelo) - uma chave esgotada no modelo principal continua livre no fallback", () => {
  withGeminiApiKeys("key-1", () => {
    assert.equal(
      rotateGeminiKeyAfterFailure(new Error("429 RESOURCE_EXHAUSTED: quota exceeded"), PRIMARY_MODEL),
      false, // so 1 chave: nao ha OUTRA chave pro mesmo modelo
    );

    // mas a mesma chave continua disponivel pro modelo alternativo, porque a
    // cota do free tier e rastreada por (chave, modelo) na API do Gemini.
    assert.equal(pickAvailableGeminiKey(["key-1"], PRIMARY_MODEL), null);
    assert.equal(pickAvailableGeminiKey(["key-1"], FALLBACK_MODEL), "key-1");
  });
});
