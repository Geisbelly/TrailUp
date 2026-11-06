// Contas das duas barras do topo do Tópico no celular.

/** Distância do chip de batalha à borda direita (`floatingBattleWrap`). */
const CHIP_DISTANCIA_DA_BORDA = 16;
const CHIP_FOLGA_DO_CONTADOR = 8;

/**
 * Quanto a barra de partes guarda à direita para o chip de batalha, que flutua
 * por cima dela. Parte da largura medida porque o chip nem sempre é desenhado: ele
 * some nos perfis sem batalha e quando o modo está desligado. Com 96 px fixos, a
 * barra parava antes do fim e deixava um vazio à direita do contador nesses casos.
 */
export function reservaDoChipDeBatalha(larguraDoChip: number): number {
  if (!(larguraDoChip > 0)) return 0;
  return Math.ceil(larguraDoChip) + CHIP_DISTANCIA_DA_BORDA + CHIP_FOLGA_DO_CONTADOR;
}

/** Seta (56) + cronômetro compacto (~92) + vão (6) + guia (36) + margem (18). */
const OCUPADO_NO_CABECALHO = 208;
const TITULO_LARGURA_MINIMA = 112;

/**
 * Largura máxima do título, alinhado à esquerda logo depois da seta. Centralizado,
 * ele descontava a largura do lado maior nos dois lados e sobrava vazio junto à seta.
 */
export function larguraMaximaDoTitulo(larguraDaTela: number): number {
  return Math.max(TITULO_LARGURA_MINIMA, larguraDaTela - OCUPADO_NO_CABECALHO);
}
