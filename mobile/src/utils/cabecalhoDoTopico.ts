// Largura do título no cabeçalho do Tópico, no celular.

/**
 * Seta (56) + cronômetro compacto (80) + vão e guia (42) = 178, medidos na versão web
 * a 320, 360 e 412 px, + 14 de folga até o cronômetro, que cresce com os dígitos.
 */
const OCUPADO_NO_CABECALHO = 192;
const TITULO_LARGURA_MINIMA = 112;

/**
 * Largura máxima do título, alinhado à esquerda logo depois da seta. Centralizado,
 * ele descontava a largura do lado maior nos dois lados e sobrava vazio junto à seta.
 */
export function larguraMaximaDoTitulo(larguraDaTela: number): number {
  return Math.max(TITULO_LARGURA_MINIMA, larguraDaTela - OCUPADO_NO_CABECALHO);
}
