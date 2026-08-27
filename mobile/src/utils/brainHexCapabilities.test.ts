import assert from "node:assert/strict";
import test from "node:test";

import { getBrainHexProfileCapabilities } from "./brainHexCapabilities";

test("recursos são determinados somente pelo perfil ativo", () => {
  assert.deepEqual(getBrainHexProfileCapabilities("seeker"), {
    hasTimer: false,
    hasBattle: false,
    hasChat: true,
  });
  assert.deepEqual(getBrainHexProfileCapabilities("socializer"), {
    hasTimer: false,
    hasBattle: false,
    hasChat: true,
  });
  assert.deepEqual(getBrainHexProfileCapabilities("mastermind"), {
    hasTimer: true,
    hasBattle: false,
    hasChat: false,
  });
  assert.deepEqual(getBrainHexProfileCapabilities("achiever"), {
    hasTimer: true,
    hasBattle: false,
    hasChat: false,
  });
  assert.deepEqual(getBrainHexProfileCapabilities("survivor"), {
    hasTimer: true,
    hasBattle: true,
    hasChat: false,
  });
  assert.deepEqual(getBrainHexProfileCapabilities("daredevil"), {
    hasTimer: true,
    hasBattle: true,
    hasChat: false,
  });
  assert.deepEqual(getBrainHexProfileCapabilities("conqueror"), {
    hasTimer: true,
    hasBattle: true,
    hasChat: false,
  });
});

test("aliases em português usam as mesmas capacidades", () => {
  assert.deepEqual(
    getBrainHexProfileCapabilities("conquistador"),
    getBrainHexProfileCapabilities("conqueror"),
  );
  assert.deepEqual(
    getBrainHexProfileCapabilities("socializador"),
    getBrainHexProfileCapabilities("socializer"),
  );
});
