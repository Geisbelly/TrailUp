import { test } from "node:test";
import assert from "node:assert/strict";
import { capitalizeProfile } from "./capitalizeProfile";

const PROFILES: Array<[string, string]> = [
  ["achiever", "Achiever"],
  ["seeker", "Seeker"],
  ["mastermind", "Mastermind"],
  ["conqueror", "Conqueror"],
  ["socializer", "Socializer"],
  ["daredevil", "Daredevil"],
  ["survivor", "Survivor"],
];

for (const [input, expected] of PROFILES) {
  test(`capitalizeProfile("${input}") -> "${expected}"`, () => {
    assert.equal(capitalizeProfile(input), expected);
  });
}

test("capitalizeProfile aceita entrada ja capitalizada ou em maiusculas", () => {
  assert.equal(capitalizeProfile("Mastermind"), "Mastermind");
  assert.equal(capitalizeProfile("MASTERMIND"), "Mastermind");
});

test("capitalizeProfile remove espacos nas bordas antes de capitalizar", () => {
  assert.equal(capitalizeProfile("  seeker  "), "Seeker");
});

test("capitalizeProfile de perfil invalido devolve string capitalizada, sem lancar - quem valida contra BRAIN_HEX_PROFILES e o chamador", () => {
  assert.equal(capitalizeProfile("naoexiste"), "Naoexiste");
});

test("capitalizeProfile de entrada vazia/undefined devolve string vazia", () => {
  assert.equal(capitalizeProfile(""), "");
  assert.equal(capitalizeProfile(undefined as unknown as string), "");
});
