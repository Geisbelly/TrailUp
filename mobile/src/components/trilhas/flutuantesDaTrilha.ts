/**
 * A faixa dos botões flutuantes da Trilha no celular: o rastreador de missões à esquerda e o
 * lançador do mentor à direita, na mesma linha, logo acima da folha recolhida do tópico.
 */
import { ALTURA_FOLHA_RECOLHIDA } from "./FolhaTopicoTrilha";

/** Altura do lançador do mentor e do botão de missões. */
export const ALTURA_DO_FLUTUANTE = 58;

/** Distância do pé da Trilha até a base dos flutuantes: a folha recolhida e 16 de respiro. */
export const BASE_DOS_FLUTUANTES = ALTURA_FOLHA_RECOLHIDA + 16;

/**
 * Folga no fim da rolagem do mapa, da árvore e da lista: o último tópico consegue subir acima
 * dos flutuantes em vez de ficar escondido atrás deles (16 de respiro, o botão, e mais 8).
 */
export const RESERVA_DOS_FLUTUANTES = 16 + ALTURA_DO_FLUTUANTE + 8;
