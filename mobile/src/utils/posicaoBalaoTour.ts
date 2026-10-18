export type Retangulo = { top: number; left: number; width: number; height: number };

/**
 * Onde fica o balão do tutorial na web em tela larga (#346), com a mesma regra
 * do protótipo v4 (`assets/tour.js`): à direita do alvo se couber, senão à
 * esquerda, senão abaixo, senão acima; sem espaço em lado nenhum, no canto
 * inferior direito. Sem alvo, no centro. Sempre a `margem` das bordas.
 */
export function posicaoBalaoTour(
  alvo: Retangulo | null,
  balao: { width: number; height: number },
  tela: { width: number; height: number },
  margem = 16,
): { top: number; left: number } {
  const { width: W, height: H } = tela;
  const { width: cw, height: ch } = balao;
  if (!alvo) return { left: Math.max(margem, (W - cw) / 2), top: Math.max(margem, (H - ch) / 2) };

  const direita = alvo.left + alvo.width;
  const baixo = alvo.top + alvo.height;
  const prenderY = (y: number) => Math.min(H - ch - margem, Math.max(margem, y));
  const prenderX = (x: number) => Math.min(W - cw - margem, Math.max(margem, x));

  if (direita + margem + cw < W) return { left: direita + margem, top: prenderY(alvo.top) };
  if (alvo.left - margem - cw > 0) return { left: alvo.left - margem - cw, top: prenderY(alvo.top) };
  if (baixo + margem + ch < H) return { left: prenderX(alvo.left), top: baixo + margem };
  if (alvo.top - margem - ch > 0) return { left: prenderX(alvo.left), top: alvo.top - margem - ch };
  return { left: W - cw - margem * 2, top: H - ch - margem * 2 };
}
