import assert from "node:assert/strict";
import { test } from "node:test";

import { parseImageCues } from "./audioImageCues";

test("parseia uma lista valida de cues, ordenada por startSec", () => {
  const raw = [
    { startSec: 30, imageUrl: "https://x.test/b.png" },
    { startSec: 0, imageUrl: "https://x.test/a.png" },
  ];
  assert.deepEqual(parseImageCues(raw), [
    { startSec: 0, imageUrl: "https://x.test/a.png" },
    { startSec: 30, imageUrl: "https://x.test/b.png" },
  ]);
});

test("retorna null quando nao e um array", () => {
  assert.equal(parseImageCues("nao e array"), null);
  assert.equal(parseImageCues(undefined), null);
  assert.equal(parseImageCues(null), null);
});

test("retorna null quando algum item tem startSec ou imageUrl invalidos", () => {
  assert.equal(parseImageCues([{ startSec: "0", imageUrl: "x" }]), null);
  assert.equal(parseImageCues([{ startSec: 0, imageUrl: "" }]), null);
  assert.equal(parseImageCues([{ startSec: 0 }]), null);
});

test("array vazio retorna array vazio", () => {
  assert.deepEqual(parseImageCues([]), []);
});
