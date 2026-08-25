// Moldura tematica da imagem do professor, na estetica do perfil BrainHex.
//
// A imagem do material base entra crua no meio de um conteudo que tem
// identidade visual forte por perfil (cor-assinatura, Guardiao, ornamentos) -
// e destoa. Aqui ela ganha borda, respiro e legenda na cor do perfil, SEM
// tocar nos pixels: e tratamento de apresentacao, o que significa custo zero
// de API, resultado instantaneo e - o que nenhuma reilustracao por IA
// consegue - GIF que continua animando.
//
// A camada de IA (reilustrar a imagem no clima do perfil) entra por cima
// desta, quando houver orcamento; esta continua sendo a de baixo, sempre.

const PADRAO_ACCENT = "#a057fd";

function hexParaRgb(hex: string): [number, number, number] | null {
  const limpo = hex.replace("#", "").trim();
  const cheio = limpo.length === 3 ? limpo.split("").map((c) => c + c).join("") : limpo;
  if (!/^[0-9a-f]{6}$/i.test(cheio)) return null;
  return [
    parseInt(cheio.slice(0, 2), 16),
    parseInt(cheio.slice(2, 4), 16),
    parseInt(cheio.slice(4, 6), 16),
  ];
}

function luminanciaRelativa(rgb: [number, number, number]): number {
  const canal = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = rgb.map(canal);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function rgbParaHsl([r, g, b]: [number, number, number]): [number, number, number] {
  const rr = r / 255;
  const gg = g / 255;
  const bb = b / 255;
  const max = Math.max(rr, gg, bb);
  const min = Math.min(rr, gg, bb);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === rr) h = ((gg - bb) / d + (gg < bb ? 6 : 0)) / 6;
  else if (max === gg) h = ((bb - rr) / d + 2) / 6;
  else h = ((rr - gg) / d + 4) / 6;
  return [h, s, l];
}

function hslParaHex(h: number, s: number, l: number): string {
  const f = (n: number) => {
    const k = (n + h * 12) % 12;
    const a = s * Math.min(l, 1 - l);
    const v = l - a * Math.max(-1, Math.min(k - 3, Math.min(9 - k, 1)));
    return Math.round(255 * v)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

/**
 * Sobe a LUMINOSIDADE HSL da cor do perfil ate ela ficar visivel sobre o fundo
 * escuro. Nunca mistura com branco: misturar dessatura e apaga a
 * cor-assinatura, mesmo passando no contraste.
 */
export function clarearParaFundoEscuro(hex: string, fundoHex = "#161a27", minRatio = 3): string {
  const rgb = hexParaRgb(hex);
  const fundo = hexParaRgb(fundoHex);
  if (!rgb || !fundo) return PADRAO_ACCENT;

  const lumFundo = luminanciaRelativa(fundo);
  const contraste = (c: [number, number, number]) => {
    const lum = luminanciaRelativa(c);
    const [hi, lo] = lum > lumFundo ? [lum, lumFundo] : [lumFundo, lum];
    return (hi + 0.05) / (lo + 0.05);
  };

  const [h, s] = rgbParaHsl(rgb);
  let [, , l] = rgbParaHsl(rgb);
  // Comeca ja normalizado em 6 digitos: entrada "#f43" com contraste suficiente
  // sairia curta e cada consumidor teria que expandir por conta propria.
  let atual = hslParaHex(h, s, l);
  for (let i = 0; i < 50 && contraste(hexParaRgb(atual) ?? rgb) < minRatio; i += 1) {
    l = Math.min(1, l + 0.02);
    atual = hslParaHex(h, s, l);
  }
  return atual;
}

export function corComAlpha(hex: string, alpha: number): string {
  const rgb = hexParaRgb(hex) ?? hexParaRgb(PADRAO_ACCENT)!;
  return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
}

export interface ProfileImageFrame {
  /** Cor de TRACO (borda, glow). 3:1 basta - elemento grafico, nao texto. */
  accent: string;
  /**
   * Cor de TEXTO da legenda. Sobe ate 7:1 (AAA) porque legenda e texto
   * pequeno: reusar o tom do traco deixaria a linha no limite da leitura.
   */
  accentTexto: string;
  borda: string;
  glow: string;
  fundo: string;
}

/**
 * Traduz a cor-assinatura do perfil nos tons da moldura. Cor ausente ou
 * invalida cai no violeta do TrailUp em vez de quebrar o layout.
 */
export function buildProfileImageFrame(corDoPerfil: string | null | undefined): ProfileImageFrame {
  const base = corDoPerfil && hexParaRgb(corDoPerfil) ? corDoPerfil : PADRAO_ACCENT;
  const accent = clarearParaFundoEscuro(base);
  return {
    accent,
    accentTexto: clarearParaFundoEscuro(base, "#161a27", 7),
    borda: corComAlpha(accent, 0.55),
    glow: corComAlpha(accent, 0.18),
    fundo: corComAlpha(accent, 0.06),
  };
}
