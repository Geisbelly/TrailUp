import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import tinycolor from "tinycolor2";
import { buildProfileShellPaletteFromAccent } from "@/utils/profileShellPalette";
import { coresDaExplicacao } from "./coresDaExplicacao";

// `profileImages.ts` não carrega no runner (require de PNG): as 7 cores-assinatura saem da fonte.
const fonte = readFileSync(join(process.cwd(), "src", "constants", "profileImages.ts"), "utf8");
const bloco = fonte.slice(fonte.indexOf("seeker: {"), fonte.indexOf("export const getBrainHexConfig"));
const CORES = [...bloco.matchAll(/color: "([^"]+)"/g)].map((m) => m[1]);

test("as 7 cores-assinatura foram lidas", () => {
  assert.equal(CORES.length, 7);
});

test("texto e títulos da explicação passam AAA (7:1) nos 7 perfis", () => {
  for (const cor of CORES) {
    const shell = buildProfileShellPaletteFromAccent(cor);
    const cores = coresDaExplicacao({
      texto: shell.text,
      suave: shell.textMuted,
      fundo: shell.surface,
      borda: shell.border,
      destaque: shell.accent,
    });
    assert.ok(tinycolor.readability(cores.texto, cores.fundo) >= 7, `texto em ${cor}`);
    assert.ok(tinycolor.readability(cores.suave, cores.fundo) >= 7, `suave em ${cor}: ${tinycolor.readability(cores.suave, cores.fundo)}`);
    assert.ok(tinycolor.readability(cores.destaque, cores.fundo) >= 3, `ícone em ${cor}`);
  }
});

test("cor com transparência vira a cor que aparece de fato sobre o fundo", () => {
  const c = coresDaExplicacao({ texto: "#ffffff", suave: "rgba(255,255,255,0.5)", fundo: "#000000", borda: "#333", destaque: "#fff" });
  assert.equal(tinycolor(c.suave).getAlpha(), 1);
  assert.equal(tinycolor(c.suave).toHexString(), "#808080");
});
