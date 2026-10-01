// Contraste WCAG entre duas cores #rrggbb.
function canais(hex: string): [number, number, number] {
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number];
}

function luminancia(hex: string): number {
  const [r, g, b] = canais(hex).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contraste(a: string, b: string): number {
  const [x, y] = [luminancia(a), luminancia(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

/** Cor `frente` com opacidade `alfa` pintada sobre `fundo`. */
export function misturar(frente: string, fundo: string, alfa: number): string {
  const f = canais(frente);
  const b = canais(fundo);
  return (
    "#" +
    f
      .map((v, i) => Math.round((v * alfa + b[i] * (1 - alfa)) * 255).toString(16).padStart(2, "0"))
      .join("")
  );
}
