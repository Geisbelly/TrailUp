import assert from "node:assert/strict";
import test from "node:test";

import { materialCacheVersion, versionedCacheKey } from "./materialCacheVersion";

test("versao usa revisao, generation_key e updated_at juntos", () => {
  assert.equal(
    materialCacheVersion({
      revisao: 3,
      metadata: { generation_key: "abc", updated_at: "2026-08-28T04:00:00Z" },
    }),
    "r3|abc|2026-08-28T04:00:00Z",
  );
});

test("material antigo sem revisao conta como r1", () => {
  assert.equal(materialCacheVersion({ metadata: { generation_key: "abc" } }), "r1|abc");
});

test("devolve so a revisao quando nao ha mais nada", () => {
  assert.equal(materialCacheVersion({}), "r1");
  assert.equal(materialCacheVersion(null), "r1");
});

test("chave compoe url e versao", () => {
  assert.equal(versionedCacheKey("https://x/a.mp3", { revisao: 2 }), "https://x/a.mp3#r2");
});

test("chaves diferentes para revisoes diferentes da MESMA url", () => {
  // E o ponto inteiro: a URL nao muda quando o professor regenera.
  const url = "https://x/generation-abc/audio.mp3";
  assert.notEqual(
    versionedCacheKey(url, { revisao: 1 }),
    versionedCacheKey(url, { revisao: 2 }),
  );
});

test("url vazia continua vazia, sem sufixo solto", () => {
  assert.equal(versionedCacheKey("", { revisao: 2 }), "");
});
