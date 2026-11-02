// Tokens de cor do deck HTML, por perfil BrainHex e por modo (claro/escuro).
//
// A cor-assinatura de cada perfil vem de microservice/src/constants/brainHex.ts
// (fonte oficial, espelhada em PROFILE_SIGNATURES abaixo). Regras do CLAUDE.md:
//  - o accent sai da cor-assinatura so' mexendo na LUMINOSIDADE HSL (sobe no
//    escuro, desce no claro). Nunca mistura com branco/preto: isso desatura e
//    "apaga" a cor do perfil mesmo passando no contraste;
//  - success/warning/danger/info sao FIXOS por modo, nao derivados do accent;
//  - todo texto passa em WCAG AAA (7:1) contra a superficie mais clara (no
//    escuro) ou mais escura (no claro) em que ele pode aparecer.

export type DeckMode = 'dark' | 'light';

export type DeckProfileKey =
  | 'seeker'
  | 'survivor'
  | 'daredevil'
  | 'mastermind'
  | 'conqueror'
  | 'socializer'
  | 'achiever';

/** Espelho de BRAIN_HEX_CONFIG[perfil].color do microservice. */
export const PROFILE_SIGNATURES: Record<DeckProfileKey, string> = {
  seeker: '#17a398',
  survivor: '#4e5a66',
  daredevil: '#d7263d',
  mastermind: '#5b3fd9',
  conqueror: '#1e4fd6',
  socializer: '#f4623a',
  achiever: '#c9a227',
};

export const AAA_TEXT = 7;
export const UI_BOUNDARY = 3;

export interface DeckColorTokens {
  bg: string;
  surface: string;
  surface2: string;
  surfaceAccent: string;
  border: string;
  borderStrong: string;
  ink: string;
  inkMuted: string;
  accent: string;
  onAccent: string;
  focus: string;
  success: string;
  successSurface: string;
  warning: string;
  warningSurface: string;
  danger: string;
  dangerSurface: string;
  info: string;
}

// Fixos (nao derivados do accent), conferidos nos testes contra as
// superficies dos 7 perfis.
const FIXED_SEMANTIC: Record<DeckMode, Pick<DeckColorTokens, 'success' | 'warning' | 'danger' | 'info'>> = {
  dark: { success: '#86efac', warning: '#fcd34d', danger: '#fecaca', info: '#93c5fd' },
  light: { success: '#14532d', warning: '#5f370e', danger: '#7f1d1d', info: '#1e3a8a' },
};

export function profileKeyOf(profile: string | undefined | null): DeckProfileKey {
  const p = String(profile || '').toLowerCase();
  const found = (Object.keys(PROFILE_SIGNATURES) as DeckProfileKey[]).find((k) => p.includes(k));
  return found || 'achiever';
}

// ---------------------------------------------------------------- cor ----

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '').slice(0, 6);
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16)) as [number, number, number];
}

function rgbToHex([r, g, b]: [number, number, number]): string {
  return '#' + [r, g, b].map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0')).join('');
}

export function hexToHsl(hex: string): [number, number, number] {
  const [r, g, b] = hexToRgb(hex).map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l * 100];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h * 60, s * 100, l * 100];
}

export function hslToHex(h: number, s: number, l: number): string {
  const sat = Math.min(100, Math.max(0, s)) / 100;
  const lig = Math.min(100, Math.max(0, l)) / 100;
  const k = (n: number) => (n + h / 30) % 12;
  const a = sat * Math.min(lig, 1 - lig);
  const f = (n: number) => lig - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return rgbToHex([f(0) * 255, f(8) * 255, f(4) * 255]);
}

export function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/**
 * Anda so' na luminosidade HSL da cor ate atingir o contraste pedido contra
 * TODOS os fundos. direction 'up' clareia (modo escuro), 'down' escurece
 * (modo claro). Matiz e saturacao ficam intactas.
 */
export function shiftLightnessForContrast(
  hex: string,
  backgrounds: string[],
  minRatio: number,
  direction: 'up' | 'down',
): string {
  const [h, s, l0] = hexToHsl(hex);
  const ok = (c: string) => backgrounds.every((bg) => contrastRatio(c, bg) >= minRatio);
  if (ok(hex)) return hex;
  for (let step = 0.5; step <= 100; step += 0.5) {
    const l = direction === 'up' ? l0 + step : l0 - step;
    if (l < 0 || l > 100) break;
    const candidate = hslToHex(h, s, l);
    if (ok(candidate)) return candidate;
  }
  return direction === 'up' ? '#ffffff' : '#000000';
}

// ------------------------------------------------------------- tokens ----

export function buildDeckColorTokens(profile: string | undefined | null, mode: DeckMode): DeckColorTokens {
  const signature = PROFILE_SIGNATURES[profileKeyOf(profile)];
  const [h, s] = hexToHsl(signature);
  // Superficies levam o matiz do perfil com saturacao contida, para o texto
  // ficar neutro e o accent ser o unico ponto de cor forte.
  const ts = Math.min(s, 60) * 0.45;

  if (mode === 'dark') {
    const bg = hslToHex(h, ts, 6);
    const surface = hslToHex(h, ts, 9.5);
    const surface2 = hslToHex(h, ts, 13);
    const surfaceAccent = hslToHex(h, Math.min(s, 70) * 0.55, 15);
    const lightest = [surface, surface2, surfaceAccent];
    const ink = shiftLightnessForContrast(hslToHex(h, 18, 94), lightest, AAA_TEXT, 'up');
    const inkMuted = shiftLightnessForContrast(hslToHex(h, 12, 74), lightest, AAA_TEXT, 'up');
    const accent = shiftLightnessForContrast(signature, lightest, AAA_TEXT, 'up');
    const fixed = FIXED_SEMANTIC.dark;
    return {
      bg,
      surface,
      surface2,
      surfaceAccent,
      border: hslToHex(h, ts, 22),
      borderStrong: shiftLightnessForContrast(signature, [surface, surface2], UI_BOUNDARY, 'up'),
      ink,
      inkMuted,
      accent,
      onAccent: bg,
      focus: accent,
      ...fixed,
      successSurface: '#0c2a18',
      warningSurface: '#2c2208',
      dangerSurface: '#30100f',
    };
  }

  const bg = hslToHex(h, ts, 97);
  const surface = hslToHex(h, ts, 99.5);
  const surface2 = hslToHex(h, ts, 94);
  const surfaceAccent = hslToHex(h, Math.min(s, 70) * 0.6, 92);
  const darkest = [bg, surface, surface2, surfaceAccent];
  const ink = shiftLightnessForContrast(hslToHex(h, 30, 12), darkest, AAA_TEXT, 'down');
  const inkMuted = shiftLightnessForContrast(hslToHex(h, 14, 32), darkest, AAA_TEXT, 'down');
  const accent = shiftLightnessForContrast(signature, darkest, AAA_TEXT, 'down');
  const fixed = FIXED_SEMANTIC.light;
  return {
    bg,
    surface,
    surface2,
    surfaceAccent,
    border: hslToHex(h, ts, 84),
    borderStrong: shiftLightnessForContrast(signature, [surface, surface2], UI_BOUNDARY, 'down'),
    ink,
    inkMuted,
    accent,
    onAccent: surface,
    focus: accent,
    ...fixed,
    successSurface: '#e7f6ec',
    warningSurface: '#fbf3dc',
    dangerSurface: '#fbe9e9',
  };
}

const CSS_VAR_NAMES: Record<keyof DeckColorTokens, string> = {
  bg: '--bg',
  surface: '--surface',
  surface2: '--surface-2',
  surfaceAccent: '--surface-accent',
  border: '--border',
  borderStrong: '--border-strong',
  ink: '--ink',
  inkMuted: '--ink-muted',
  accent: '--accent',
  onAccent: '--on-accent',
  focus: '--focus',
  success: '--success',
  successSurface: '--success-surface',
  warning: '--warning',
  warningSurface: '--warning-surface',
  danger: '--danger',
  dangerSurface: '--danger-surface',
  info: '--info',
};

export function deckTokensToCss(tokens: DeckColorTokens): string {
  return (Object.keys(CSS_VAR_NAMES) as (keyof DeckColorTokens)[])
    .map((k) => `${CSS_VAR_NAMES[k]}: ${tokens[k]};`)
    .join(' ');
}
