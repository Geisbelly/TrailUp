// Velocidade do áudio narrado do Tópico (mobile-v1, `04-topico.html`: o "1.0×" ao
// lado do trilho). Cada toque passa para a próxima; depois de 2× volta para 0,75×.

export const VELOCIDADES_AUDIO = [1, 1.25, 1.5, 2, 0.75] as const;

export function proximaVelocidade(atual: number): number {
  const i = VELOCIDADES_AUDIO.findIndex((v) => v === atual);
  return VELOCIDADES_AUDIO[(i + 1) % VELOCIDADES_AUDIO.length];
}

/** "1.0×", "1.25×", "0.75×": sempre com uma casa, como no protótipo. */
export function rotuloVelocidade(v: number): string {
  return `${Number.isInteger(v) ? v.toFixed(1) : String(v)}×`;
}
