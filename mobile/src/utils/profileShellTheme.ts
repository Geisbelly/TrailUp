import { getBrainHexConfig } from "@/constants/profileImages";
import { Color } from "@/styles/GlobalStyle";
import tinycolor from "tinycolor2";

export type SystemVisualTheme = "real" | "medieval" | "magica";

export type ProfileShellPalette = {
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

type ThemeTone = {
  neutralBase: string;
  neutralSurface: string;
  neutralElevated: string;
  backgroundMix: number;
  surfaceMix: number;
  elevatedMix: number;
};

const THEME_TONES: Record<SystemVisualTheme, ThemeTone> = {
  real: {
    neutralBase: "#0e1118",
    neutralSurface: "#151b26",
    neutralElevated: "#1c2436",
    backgroundMix: 3,
    surfaceMix: 7,
    elevatedMix: 11,
  },
  medieval: {
    neutralBase: "#080e1a",
    neutralSurface: "#0f1828",
    neutralElevated: "#141f33",
    backgroundMix: 4,
    surfaceMix: 7,
    elevatedMix: 10,
  },
  magica: {
    neutralBase: "#0e0b1e",
    neutralSurface: "#15112e",
    neutralElevated: "#1e183e",
    backgroundMix: 8,
    surfaceMix: 14,
    elevatedMix: 20,
  },
};

export function resolveSystemVisualTheme(profileName?: string | null): SystemVisualTheme {
  const profile = String(profileName ?? "").trim().toLowerCase();
  if (["socializer", "socialiser", "seeker"].includes(profile)) return "magica";
  if (["conqueror", "survivor", "daredevil"].includes(profile)) return "medieval";
  return "real";
}

export function buildProfileShellPaletteFromAccent(
  accentSource?: string | null,
  theme: SystemVisualTheme = "medieval"
): ProfileShellPalette {
  const accentBase = tinycolor(accentSource || "#707c88").isValid()
    ? tinycolor(accentSource || "#707c88").toHexString()
    : "#707c88";
  const tone = THEME_TONES[theme];
  const accent = tinycolor(accentBase).lighten(1).desaturate(10).toHexString();
  const backgroundBase = tinycolor
    .mix(tone.neutralBase, accentBase, tone.backgroundMix)
    .darken(theme === "magica" ? 3 : 5)
    .toHexString();
  const surfaceBase = tinycolor.mix(tone.neutralSurface, accentBase, tone.surfaceMix).toRgbString();
  const elevatedBase = tinycolor
    .mix(tone.neutralElevated, accentBase, tone.elevatedMix)
    .toRgbString();

  return {
    theme,
    accent,
    accentStrong: tinycolor(accentBase).darken(8).toHexString(),
    accentSoft: tinycolor(accent).setAlpha(0.18).toRgbString(),
    accentMuted: tinycolor(accent).setAlpha(0.12).toRgbString(),
    background: backgroundBase,
    surface: surfaceBase,
    surfaceElevated: elevatedBase,
    border: tinycolor(accent).setAlpha(0.22).toRgbString(),
    borderStrong: tinycolor(accent).setAlpha(0.4).toRgbString(),
    text: Color.colorAliceblue,
    textMuted: tinycolor(Color.colorAliceblue).setAlpha(0.82).toRgbString(),
    textSubtle: tinycolor(Color.colorAliceblue).setAlpha(0.62).toRgbString(),
    progressTrack: tinycolor.mix("#172236", accentBase, 9).darken(7).toRgbString(),
    inactive: tinycolor.mix(Color.colorAliceblue, accentBase, 16).setAlpha(0.6).toRgbString(),
  };
}

export function getProfileShellPalette(profileName?: string | null): ProfileShellPalette {
  const config = getBrainHexConfig(profileName ?? undefined);
  const theme = resolveSystemVisualTheme(profileName);
  return buildProfileShellPaletteFromAccent(config.color, theme);
}
