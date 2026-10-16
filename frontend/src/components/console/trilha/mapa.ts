export type Ponto = { x: number; y: number };
export type Vista = { zoom: number; offset: Ponto };

export const ZOOM_MIN = 0.2;
export const ZOOM_MAX = 2.0;

const limitar = (z: number) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));

/**
 * "Ajustar à tela": maior zoom (até 1x) em que todos os cartões cabem na janela,
 * com margem, e o conjunto centralizado. Sem cartões, volta à vista inicial.
 * `posicoes` são as coordenadas do canto superior esquerdo de cada cartão no
 * "mundo" do canvas.
 */
export function enquadrar(
  posicoes: Ponto[],
  janela: { largura: number; altura: number },
  cartao: { largura: number; altura: number },
  margem = 48,
): Vista {
  if (posicoes.length === 0 || janela.largura <= 0 || janela.altura <= 0) return { zoom: 1, offset: { x: 0, y: 0 } };
  const minX = Math.min(...posicoes.map((p) => p.x));
  const minY = Math.min(...posicoes.map((p) => p.y));
  const maxX = Math.max(...posicoes.map((p) => p.x)) + cartao.largura;
  const maxY = Math.max(...posicoes.map((p) => p.y)) + cartao.altura;
  const largura = maxX - minX;
  const altura = maxY - minY;
  const zoom = limitar(
    Math.min(1, (janela.largura - 2 * margem) / largura, (janela.altura - 2 * margem) / altura),
  );
  return {
    zoom,
    offset: {
      x: (janela.largura - largura * zoom) / 2 - minX * zoom,
      y: (janela.altura - altura * zoom) / 2 - minY * zoom,
    },
  };
}

/** "Centralizar": mantém o zoom e leva o centro do conjunto de cartões ao centro da janela. */
export function centralizar(
  posicoes: Ponto[],
  zoom: number,
  janela: { largura: number; altura: number },
  cartao: { largura: number; altura: number },
): Ponto {
  if (posicoes.length === 0) return { x: 0, y: 0 };
  const minX = Math.min(...posicoes.map((p) => p.x));
  const minY = Math.min(...posicoes.map((p) => p.y));
  const maxX = Math.max(...posicoes.map((p) => p.x)) + cartao.largura;
  const maxY = Math.max(...posicoes.map((p) => p.y)) + cartao.altura;
  return {
    x: janela.largura / 2 - ((minX + maxX) / 2) * zoom,
    y: janela.altura / 2 - ((minY + maxY) / 2) * zoom,
  };
}

/** Seqüência vem de `ordem`; sem ordem, a posição na lista. */
export function numeroNaSequencia(ordem: number | null | undefined, indice: number): number {
  return ordem != null && ordem > 0 ? ordem : indice + 1;
}

export function resumoDaTurma(topicos: number, alunos: number | null): string {
  const t = `${topicos} ${topicos === 1 ? "tópico" : "tópicos"}`;
  return alunos == null ? t : `${t} · ${alunos} ${alunos === 1 ? "aluno" : "alunos"}`;
}
