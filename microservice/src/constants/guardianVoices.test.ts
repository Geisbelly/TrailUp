import assert from "node:assert/strict";
import { test } from "node:test";
import { GUARDIAN_VOICE_PROFILES } from "./guardianVoices";

test("define uma voz e uma direção cultural sem caricatura para cada perfil", () => {
  assert.equal(Object.keys(GUARDIAN_VOICE_PROFILES).length, 7);

  for (const profile of Object.values(GUARDIAN_VOICE_PROFILES)) {
    assert.ok(profile.voice);
    assert.match(profile.direction, /jovem adult/);
    assert.match(profile.direction, /sem caricatura/);
  }
});

test("mantém Mateo e Zuri como diálogo de gêmeos com vozes de sexos distintos", () => {
  const socializer = GUARDIAN_VOICE_PROFILES.socializer;

  assert.equal(socializer.voice, "Achird");
  assert.match(socializer.direction, /voz masculina/);
  assert.equal(socializer.secondaryVoice, "Sulafat");
  assert.match(socializer.secondaryDirection ?? "", /voz feminina/);
  assert.match(socializer.secondaryDirection ?? "", /irmã gêmea/);
});

test("usa os presets selecionados para idade, sexo e personalidade", () => {
  assert.deepEqual(
    Object.fromEntries(
      Object.entries(GUARDIAN_VOICE_PROFILES).map(([profile, config]) => [
        profile,
        config.voice,
      ]),
    ),
    {
      mastermind: "Charon",
      seeker: "Leda",
      survivor: "Schedar",
      daredevil: "Zephyr",
      conqueror: "Kore",
      socializer: "Achird",
      achiever: "Orus",
    },
  );
});
