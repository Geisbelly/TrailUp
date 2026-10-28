// Quantas colunas o mapa da Trilha usa. No celular, as colunas que cabem na
// largura (e o mapa cresce para baixo). No quadro da web em tela larga (#346,
// protótipo v4), as fileiras que cabem na altura decidem as colunas, e o mapa
// cresce para o lado. As medidas são as de MapaViewStable.
export const MAPA = { paddingX: 48, paddingY: 100, cellH: 200, territorioAltura: 154, folgaBaixo: 120, deriva: 18 };

export function fileirasNoQuadro(altura: number): number {
  const util = altura - 24 - MAPA.paddingY - MAPA.territorioAltura - MAPA.folgaBaixo - MAPA.deriva;
  return Math.max(1, Math.floor(util / MAPA.cellH) + 1);
}

export function colunasDoMapa(total: number, largura: number, altura: number, quadro: boolean): number {
  if (quadro) return Math.max(2, Math.ceil(total / fileirasNoQuadro(altura)));
  const util = Math.max(largura, 360) - MAPA.paddingX * 2;
  return Math.max(2, Math.floor(util / 270));
}

/** Abaixo desta largura o mapa vira o mosaico do celular (mobile-v1, `MapaMosaicoCelular`). */
export const LARGURA_MAXIMA_CELULAR = 600;

export function mapaDoCelular(largura: number): boolean {
  return largura < LARGURA_MAXIMA_CELULAR;
}
