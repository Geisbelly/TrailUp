import { type BrainHexProfile } from "@/constants/brainHexProfiles";
import tinycolor from "tinycolor2";

export type SystemVisualTheme = "real" | "medieval" | "magica";

export type ProfileShellPalette = {
  profile?: BrainHexProfile;
  theme: SystemVisualTheme;
  accent: string;
  accentStrong: string;
  accentSoft: string;
  accentMuted: string;
  background: string;
  surface: string;
  surfaceElevated: string;
  border: string;
  borderStrong: string;
  text: string;
  textMuted: string;
  textSubtle: string;
  progressTrack: string;
  inactive: string;
};

export function resolveSystemVisualTheme(profileName?: string | null): SystemVisualTheme {
  const profile = String(profileName ?? "").trim().toLowerCase();
  if (["socializer", "socialiser", "seeker"].includes(profile)) return "magica";
  if (["conqueror", "survivor", "daredevil"].includes(profile)) return "medieval";
  return "real";
}

/**
 * Eleva a luminosidade (HSL) de `color` ate atingir `minRatio` de contraste WCAG
 * contra `background`, mantendo matiz E saturacao intactos — ao contrario de
 * misturar com branco (que desatura e deixa a cor "apagada"), aqui só a
 * luminosidade sobe, preservando a identidade/vibração da cor-assinatura do perfil.
 */
function ensureMinContrast(
  color: string,
  background: tinycolor.Instance | string,
  minRatio: number,
  stepL = 0.04,
  maxSteps = 20
): string {
  const hsl = tinycolor(color).toHsl();
  let adjusted = tinycolor(hsl);
  for (let i = 0; i < maxSteps; i += 1) {
    if (tinycolor.readability(adjusted, background) >= minRatio) break;
    if (hsl.l >= 1) break;
    hsl.l = Math.min(1, hsl.l + stepL);
    adjusted = tinycolor(hsl);
  }
  return adjusted.toHexString();
}

export function buildProfileShellPaletteFromAccent(
  accentSource?: string | null,
  theme: SystemVisualTheme = "medieval"
): ProfileShellPalette {
  const accentBase = tinycolor(accentSource || "#707c88").isValid()
    ? tinycolor(accentSource || "#707c88").toHexString()
    : "#707c88";
  const { h, s } = tinycolor(accentBase).toHsl();
  const tone = (l: number) => tinycolor({ h, s: Math.min(s, 0.55), l }).toHexString();
  const backgroundBase = tone(0.1);
  const surfaceBase = tone(0.16);
  const elevatedBase = tone(0.22);
  const text = tinycolor({ h, s: Math.min(s, 0.18), l: 0.96 }).toHexString();

  // WCAG AAA: o accent (usado como texto/icone/borda) precisa ficar legivel sobre a
  // superficie MAIS CLARA em que aparece (pior caso = elevatedBase). Garantimos >= 4.5:1
  // (AAA para texto grande, acima do 3:1 minimo de componentes de UI) elevando apenas a
  // luminosidade (HSL) do accent — matiz e saturacao ficam intactos, entao a cor
  // continua vibrante/reconhecivel em vez de "apagada" como um mix com branco deixaria.
  const accent = ensureMinContrast(accentBase, elevatedBase, 4.5);

  return {
    theme,
    accent,
    accentStrong: tinycolor(accentBase).darken(8).toHexString(),
    accentSoft: tinycolor(accent).setAlpha(0.18).toRgbString(),
    accentMuted: tinycolor(accent).setAlpha(0.12).toRgbString(),
    background: backgroundBase,
    surface: surfaceBase,
    surfaceElevated: elevatedBase,
    border: tone(0.35),
    borderStrong: tone(0.55),
    text,
    textMuted: tinycolor(text).setAlpha(0.82).toRgbString(),
    textSubtle: tinycolor(text).setAlpha(0.62).toRgbString(),
    progressTrack: backgroundBase,
    inactive: tinycolor.mix(text, accentBase, 16).setAlpha(0.6).toRgbString(),
  };
}
