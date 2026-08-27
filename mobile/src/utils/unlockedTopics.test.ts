import assert from "node:assert/strict";
import test from "node:test";

import {
  buildUnlockedTopicsStorageKey,
  mergeUnlockedTopicIds,
  normalizeRemoteTopicLocked,
} from "./unlockedTopics";

test("um tópico já desbloqueado não volta a ser bloqueado", () => {
  assert.deepEqual(mergeUnlockedTopicIds(["1", "2"], ["1"]), ["1", "2"]);
});

test("novos desbloqueios são unidos sem duplicação", () => {
  assert.deepEqual(mergeUnlockedTopicIds(["1", "2"], ["2", "3"]), ["1", "2", "3"]);
});

test("a persistência é isolada por aluno e classe", () => {
  assert.notEqual(
    buildUnlockedTopicsStorageKey("aluno-a", 10),
    buildUnlockedTopicsStorageKey("aluno-a", 11),
  );
  assert.notEqual(
    buildUnlockedTopicsStorageKey("aluno-a", 10),
    buildUnlockedTopicsStorageKey("aluno-b", 10),
  );
});

test("interpreta formatos de locked usados pela API sem liberar campo ausente", () => {
  assert.equal(normalizeRemoteTopicLocked(false), false);
  assert.equal(normalizeRemoteTopicLocked("false"), false);
  assert.equal(normalizeRemoteTopicLocked(0), false);
  assert.equal(normalizeRemoteTopicLocked("true"), true);
  assert.equal(normalizeRemoteTopicLocked(undefined), true);
});

test("aceita sinais remotos explícitos de desbloqueio", () => {
  assert.equal(normalizeRemoteTopicLocked(undefined, true), false);
  assert.equal(normalizeRemoteTopicLocked(undefined, "desbloqueado"), false);
  assert.equal(normalizeRemoteTopicLocked(undefined, undefined, "available"), false);
});
