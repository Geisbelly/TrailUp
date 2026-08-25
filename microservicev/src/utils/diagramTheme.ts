// Base compartilhada pelos desenhadores de diagrama (flowDiagram, laneDiagram):
// cores do tema, medidas de texto, escape de XML e a codificacao da data URI.
// Cor de texto sempre clara sobre o fundo escuro (contraste AAA); a cor do
// perfil entra so em traco/borda/numero, onde 3:1 basta.

export const DIAGRAM_BG = "#161a27";
export const DIAGRAM_SURFACE = "#1e2334";
export const TEXT_COLOR = "#f3f1ed";
export const MUTED_TEXT_COLOR = "#d4d4d8";
export const FONT_STACK = "Inter, system-ui, sans-serif";

export const FONT_SIZE = 13;
export const LINE_HEIGHT = 18;
export const CHAR_WIDTH = 6.9; // largura media de 13px sans-serif, o bastante pro wrap

export function escapeXml(texto: string): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export function wrapLabel(label: string, maxWidth: number, padding = 14): string[] {
  const maxChars = Math.max(6, Math.floor((maxWidth - padding * 2) / CHAR_WIDTH));
  const palavras = label.split(/\s+/).filter(Boolean);
  const linhas: string[] = [];
  let atual = "";
  for (const palavra of palavras) {
    const candidato = atual ? `${atual} ${palavra}` : palavra;
    if (candidato.length <= maxChars) {
      atual = candidato;
      continue;
    }
    if (atual) linhas.push(atual);
    atual = palavra.length > maxChars ? palavra.slice(0, maxChars - 1) + "…" : palavra;
  }
  if (atual) linhas.push(atual);
  return linhas.length > 0 ? linhas : [label];
}

function hexToRgb(hex: string): [number, number, number] {
  const limpo = hex.replace("#", "").trim();
  const cheio = limpo.length === 3 ? limpo.split("").map((c) => c + c).join("") : limpo;
  return [
    parseInt(cheio.slice(0, 2), 16),
    parseInt(cheio.slice(2, 4), 16),
    parseInt(cheio.slice(4, 6), 16),
  ];
}

function relativeLuminance(hex: string): number {
  const canal = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = hexToRgb(hex).map(canal);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

function rgbToHsl(hex: string): [number, number, number] {
  const [r, g, b] = hexToRgb(hex).map((v) => v / 255);
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
  else if (max === g) h = ((b - r) / d + 2) / 6;
  else h = ((r - g) / d + 4) / 6;
  return [h, s, l];
}

function hslToHex(h: number, s: number, l: number): string {
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
 * Eleva a LUMINOSIDADE HSL da cor do perfil ate ela atingir o contraste minimo
 * contra o fundo do diagrama. Nunca mistura com branco: misturar dessatura e
 * "apaga" a cor-assinatura do perfil mesmo passando no contraste.
 */
export function ensureContrast(hex: string, background: string, minRatio: number): string {
  const [h, s, lInicial] = rgbToHsl(hex);
  let l = lInicial;
  let atual = hex;
  for (let i = 0; i < 50 && contrastRatio(atual, background) < minRatio; i += 1) {
    l = Math.min(1, l + 0.02);
    atual = hslToHex(h, s, l);
  }
  return atual;
}

/**
 * Data URI percent-encoded, nao base64. Motivo: o mobile (React Native) nao tem
 * decoder de base64 nem dependencia que traga um, e precisa do XML cru pra
 * desenhar o SVG com react-native-svg (o <Image> do RN nao renderiza SVG).
 * Percent-encoding sai de graca no cliente (decodeURIComponent) e o navegador
 * (console e deck) renderiza igual.
 *
 * Os parenteses vao escapados a mao: encodeURIComponent os preserva, e a URI
 * fica dentro de "![alt](...)" no markdown - um ")" cru ali fecharia o link no
 * meio do SVG. O "#" (cor hex, url(#seta)) ja e escapado por
 * encodeURIComponent, senao viraria fragmento da URI.
 */
export function svgToDataUri(svg: string): string {
  const encoded = encodeURIComponent(svg).replace(/\(/g, "%28").replace(/\)/g, "%29");
  return `data:image/svg+xml,${encoded}`;
}

/** Marcador de seta reaproveitado pelos dois desenhadores. */
export function arrowMarkerDefs(accent: string, id = "seta"): string {
  return (
    `<defs><marker id="${id}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" ` +
    `orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="${accent}" /></marker></defs>`
  );
}
