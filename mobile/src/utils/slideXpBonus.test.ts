import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildSlideBonusDedupeKey,
  computeSlideBonusPercent,
  isSlideItemKey,
} from "./slideXpBonus";

test("isSlideItemKey reconhece apenas chaves com prefixo slide:", () => {
  assert.equal(isSlideItemKey("slide:3:quiz"), true);
  assert.equal(isSlideItemKey("slide:0:boss"), true);
  assert.equal(isSlideItemKey("content:12:personalization:5:algo"), false);
  assert.equal(isSlideItemKey("outra-coisa"), false);
});

test("buildSlideBonusDedupeKey combina topico e item_key para evitar colisao entre topicos", () => {
  assert.equal(buildSlideBonusDedupeKey(7, "slide:3:quiz"), "7:slide:3:quiz");
  assert.notEqual(
    buildSlideBonusDedupeKey(7, "slide:3:quiz"),
    buildSlideBonusDedupeKey(8, "slide:3:quiz")
  );
});

test("computeSlideBonusPercent soma 2% por interacao distinta", () => {
  assert.equal(computeSlideBonusPercent(new Set()), 0);
  assert.equal(computeSlideBonusPercent(new Set(["a"])), 2);
  assert.equal(computeSlideBonusPercent(new Set(["a", "b", "c"])), 6);
});

test("computeSlideBonusPercent tem teto de 10%", () => {
  const keys = new Set(["a", "b", "c", "d", "e", "f", "g"]);
  assert.equal(computeSlideBonusPercent(keys), 10);
});
