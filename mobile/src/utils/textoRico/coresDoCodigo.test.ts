import assert from "node:assert/strict";
import test from "node:test";

import tinycolor from "tinycolor2";

import type { BrainHexProfile } from "@/constants/brainHexProfiles";
import { getProfileShellPalette } from "@/utils/profileShellTheme";

import { CONTRASTE_DO_CODIGO, coresDoCodigo } from "./coresDoCodigo";

const PERFIS: BrainHexProfile[] = ["seeker", "survivor", "daredevil", "mastermind", "conqueror", "socializer", "achiever"];

for (const perfil of PERFIS) {
  test(`código com contraste AAA no perfil ${perfil}`, () => {
    const cores = coresDoCodigo(getProfileShellPalette(perfil));
    for (const [papel, cor] of Object.entries(cores)) {
      if (papel === "fundo" || papel === "borda") continue;
      const minimo = papel === "numeroDaLinha" ? 4.5 : CONTRASTE_DO_CODIGO;
      const contraste = tinycolor.readability(cor, cores.fundo);
      assert.ok(contraste >= minimo, `${papel} ${cor} sobre ${cores.fundo}: ${contraste.toFixed(2)}`);
    }
  });
}

test("a palavra-chave mantém o matiz do accent do perfil", () => {
  const paleta = getProfileShellPalette("seeker");
  const cores = coresDoCodigo(paleta);
  const diferenca = Math.abs(tinycolor(cores.palavra).toHsl().h - tinycolor(paleta.accent).toHsl().h);
  assert.ok(Math.min(diferenca, 360 - diferenca) < 3);
});
