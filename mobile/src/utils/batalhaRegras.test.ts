import assert from "node:assert/strict";
import test from "node:test";

import { batalhaPausadaPeloEstado } from "./batalhaRegras";

test("batalha pausada: só quando a leitura emocional desligou", () => {
  assert.equal(batalhaPausadaPeloEstado([{ enabled: false, disabledReason: "mental_state" }]), true);
  assert.equal(batalhaPausadaPeloEstado([null, { enabled: false, disabledReason: "mental_state" }]), true);
  assert.equal(batalhaPausadaPeloEstado([{ enabled: false, disabledReason: "user_preference" }]), false);
  assert.equal(batalhaPausadaPeloEstado([{ enabled: false, disabledReason: "runtime_safety" }]), false);
  assert.equal(batalhaPausadaPeloEstado([{ enabled: true, disabledReason: null }]), false);
  assert.equal(batalhaPausadaPeloEstado([]), false);
});
