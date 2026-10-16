import assert from "node:assert/strict";
import test from "node:test";

import { sequenciaDeDias } from "@/utils/sequenciaDias";

test("conta os dias seguidos terminando hoje", () => {
  assert.equal(sequenciaDeDias([0, 0, 1, 2, 0, 3, 1]), 2);
  assert.equal(sequenciaDeDias([1, 1, 1, 1, 1, 1, 1]), 7);
});

test("hoje ainda sem estudo não zera: conta até ontem", () => {
  assert.equal(sequenciaDeDias([0, 0, 0, 2, 5, 1, 0]), 3);
});

test("sem atividade recente, zero", () => {
  assert.equal(sequenciaDeDias([1, 0, 0, 0, 0, 0, 0]), 0);
  assert.equal(sequenciaDeDias([]), 0);
});
