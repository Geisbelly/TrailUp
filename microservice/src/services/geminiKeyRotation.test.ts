import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseGeminiApiKeys,
  pickAvailableGeminiKey,
  rotateGeminiKeyAfterFailure,
  resetGeminiKeyRotationForTests,
  resolveGeminiTextFallbackModels,
  resolveGeminiTtsFallbackModels,
  resolveGeminiImageFallbackModels,
  geminiApiKeys,
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

test("pickAvailableGeminiKey avanca o round-robin em toda chamada, nao so em falha - distribui chamadas concorrentes entre as chaves", () => {
  // Regressao: chamadas concorrentes (parts.map de audio, por exemplo) que
  // dao certo de primeira antes convergiam todas na MESMA chave, porque o
  // indice global so avancava quando uma chave estava de cooldown. Isso
  // estourava RPM numa unica conta mesmo com varias chaves configuradas.
  resetGeminiKeyRotationForTests();
  const keys = ["key-1", "key-2", "key-3"];
  assert.equal(pickAvailableGeminiKey(keys, PRIMARY_MODEL), "key-1");
  assert.equal(pickAvailableGeminiKey(keys, PRIMARY_MODEL), "key-2");
  assert.equal(pickAvailableGeminiKey(keys, PRIMARY_MODEL), "key-3");
  assert.equal(pickAvailableGeminiKey(keys, PRIMARY_MODEL), "key-1"); // completa a volta
});

test("rotateGeminiKeyAfterFailure só roda pra erro de cota/rate-limit, nunca pra erro genérico", () => {
  withGeminiApiKeys("key-1,key-2", () => {
    assert.equal(
      rotateGeminiKeyAfterFailure(new Error("Connection timed out"), PRIMARY_MODEL, "key-1"),
      false,
    );
  });
});

test("rotateGeminiKeyAfterFailure não alterna quando só há uma chave configurada", () => {
  withGeminiApiKeys("key-1", () => {
    assert.equal(
      rotateGeminiKeyAfterFailure(new Error("429 RESOURCE_EXHAUSTED: quota exceeded"), PRIMARY_MODEL, "key-1"),
      false,
    );
  });
});

test("rotateGeminiKeyAfterFailure alterna pra próxima chave disponível quando uma esgota a cota", () => {
  withGeminiApiKeys("key-1,key-2", () => {
    const keys = ["key-1", "key-2"];
    const usedKey = pickAvailableGeminiKey(keys, PRIMARY_MODEL);
    assert.equal(usedKey, "key-1");

    const hadAnotherKey = rotateGeminiKeyAfterFailure(
      new Error("429 RESOURCE_EXHAUSTED: quota exceeded"),
      PRIMARY_MODEL,
      usedKey!,
    );

    assert.equal(hadAnotherKey, true);
    assert.equal(pickAvailableGeminiKey(keys, PRIMARY_MODEL), "key-2");
  });
});

test("rotateGeminiKeyAfterFailure tambem alterna chave pra 503 UNAVAILABLE (sobrecarga transitoria)", () => {
  // Reproduz o bug real: "This model is currently experiencing high demand"
  // e sobrecarga transitoria do servidor, nao um problema da chave - vale
  // tentar a proxima chave em vez de propagar o erro imediatamente.
  withGeminiApiKeys("key-1,key-2", () => {
    const keys = ["key-1", "key-2"];
    const usedKey = pickAvailableGeminiKey(keys, PRIMARY_MODEL);
    assert.equal(usedKey, "key-1");

    const hadAnotherKey = rotateGeminiKeyAfterFailure(
      new Error("503 UNAVAILABLE. This model is currently experiencing high demand."),
      PRIMARY_MODEL,
      usedKey!,
    );

    assert.equal(hadAnotherKey, true);
    assert.equal(pickAvailableGeminiKey(keys, PRIMARY_MODEL), "key-2");
  });
});

test("rotateGeminiKeyAfterFailure devolve false quando todas as chaves já esgotaram a cota do modelo", () => {
  withGeminiApiKeys("key-1,key-2", () => {
    const keys = ["key-1", "key-2"];
    assert.equal(
      rotateGeminiKeyAfterFailure(new Error("429 RESOURCE_EXHAUSTED: quota exceeded"), PRIMARY_MODEL, "key-1"),
      true,
    );
    const nextKey = pickAvailableGeminiKey(keys, PRIMARY_MODEL);
    assert.equal(nextKey, "key-2");
    assert.equal(
      rotateGeminiKeyAfterFailure(new Error("429 RESOURCE_EXHAUSTED: quota exceeded"), PRIMARY_MODEL, nextKey!),
      false,
    );
  });
});

test("cooldown de cota e por (chave, modelo) - uma chave esgotada no modelo principal continua livre no fallback", () => {
  withGeminiApiKeys("key-1", () => {
    assert.equal(
      rotateGeminiKeyAfterFailure(new Error("429 RESOURCE_EXHAUSTED: quota exceeded"), PRIMARY_MODEL, "key-1"),
      false, // so 1 chave: nao ha OUTRA chave pro mesmo modelo
    );

    // mas a mesma chave continua disponivel pro modelo alternativo, porque a
    // cota do free tier e rastreada por (chave, modelo) na API do Gemini.
    assert.equal(pickAvailableGeminiKey(["key-1"], PRIMARY_MODEL), null);
    assert.equal(pickAvailableGeminiKey(["key-1"], FALLBACK_MODEL), "key-1");
  });
});

test("resolveGeminiTextFallbackModels devolve os 11 modelos default, priorizando a serie 3.x", () => {
  // gemini-2.5-flash-lite (e outros 2.x) retornaram 404 "no longer available
  // to new users" em producao — 3.x vem primeiro por ter mais chance de
  // funcionar de fato numa conta nova. Variantes nao-lite da mesma geracao
  // geralmente vem depois da lite — exceto gemini-2.0-flash/-lite, que ja
  // estava na ordem inversa antes desta ampliacao e nao foi reordenado.
  // gemini-1.5-* fica por ultimo, mais residual ainda que a serie 2.x.
  assert.deepEqual(resolveGeminiTextFallbackModels({}), [
    "gemini-3.1-flash-lite",
    "gemini-3.1-flash",
    "gemini-3.5-flash-lite",
    "gemini-3.6-flash-lite",
    "gemini-2.5-flash-lite",
    "gemini-2.5-flash",
    "gemini-2.5-pro",
    "gemini-2.0-flash",
    "gemini-2.0-flash-lite",
    "gemini-1.5-flash",
    "gemini-1.5-pro",
  ]);
});

test("resolveGeminiTextFallbackModels respeita a lista configurada via env, separada por virgula", () => {
  assert.deepEqual(
    resolveGeminiTextFallbackModels({ GEMINI_TEXT_FALLBACK_MODELS: "model-a, model-b ;model-c" }),
    ["model-a", "model-b", "model-c"],
  );
});

test("geminiApiKeys inclui GEMINI_API_KEY_1..4 e GEMINI_API_KEYS, nao so GEMINI_API_KEY", () => {
  // Regressao: producao configurou 4 chaves de contas Google diferentes
  // (1 em GEMINI_API_KEY + 3 em GEMINI_API_KEY_1/2/3), esperando rotacao
  // entre as 4 pra multiplicar RPM/RPD efetivo - mas geminiApiKeys() (usada
  // por getAi() na geracao normal de texto/audio/TTS) so lia GEMINI_API_KEY,
  // entao a geracao inteira rodava com 1 chave so, sem os outros 3 servirem
  // pra nada (so alimentavam getActiveKeys(), usada exclusivamente pelos
  // endpoints de regeneracao por prompt do professor - um caminho
  // completamente diferente).
  const previous = {
    GEMINI_API_KEY: process.env.GEMINI_API_KEY,
    GEMINI_API_KEY_1: process.env.GEMINI_API_KEY_1,
    GEMINI_API_KEY_2: process.env.GEMINI_API_KEY_2,
    GEMINI_API_KEYS: process.env.GEMINI_API_KEYS,
  };
  process.env.GEMINI_API_KEY = "key-principal";
  process.env.GEMINI_API_KEY_1 = "key-conta-2";
  process.env.GEMINI_API_KEY_2 = "key-conta-3";
  process.env.GEMINI_API_KEYS = "key-conta-4";
  try {
    assert.deepEqual(
      new Set(geminiApiKeys()),
      new Set(["key-principal", "key-conta-2", "key-conta-3", "key-conta-4"]),
    );
  } finally {
    process.env.GEMINI_API_KEY = previous.GEMINI_API_KEY;
    process.env.GEMINI_API_KEY_1 = previous.GEMINI_API_KEY_1;
    process.env.GEMINI_API_KEY_2 = previous.GEMINI_API_KEY_2;
    process.env.GEMINI_API_KEYS = previous.GEMINI_API_KEYS;
  }
});

test("resolveGeminiTtsFallbackModels/resolveGeminiImageFallbackModels tem defaults proprios, sem depender do texto", () => {
  assert.deepEqual(resolveGeminiTtsFallbackModels({}), ["gemini-2.5-flash-preview-tts"]);
  assert.deepEqual(resolveGeminiImageFallbackModels({}), [
    "gemini-2.0-flash-preview-image-generation",
  ]);
  assert.deepEqual(
    resolveGeminiTtsFallbackModels({ GEMINI_TTS_FALLBACK_MODELS: "tts-a,tts-b" }),
    ["tts-a", "tts-b"],
  );
  assert.deepEqual(
    resolveGeminiImageFallbackModels({ GEMINI_IMAGE_FALLBACK_MODELS: "img-a,img-b" }),
    ["img-a", "img-b"],
  );
});
