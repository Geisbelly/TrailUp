// Geometria da árvore da Trilha no celular (mobile-v1, `03-trilha.html`,
// `arvore()`): cada nível do grafo vira uma fileira; o tópico fica com o
// hexágono à esquerda e o nome ao lado. Puro: só números e paths SVG.

export const ARVORE_TOPO = 44;
export const ARVORE_PASSO = 104;
/** Metade do hexágono (48px): a ligação sai de baixo de um e chega em cima do outro. */
const MEIO_HEX = 24;

export type PosicaoArvore = { x: number; y: number; larguraRotulo: number };
export type LayoutArvore = { altura: number; pos: Record<string, PosicaoArvore> };

/**
 * Tópico sozinho no nível fica a 24% da largura, com 200px de nome; dois no mesmo
 * nível ficam a 12% e 56%, com 110px cada. O protótipo só tem níveis de até 2;
 * um nível maior é quebrado em fileiras de 2, para o nome nunca sair da tela.
 */
export function layoutArvoreCelular(niveis: readonly (readonly string[])[], largura: number): LayoutArvore {
  const fileiras = niveis.flatMap((nivel) => {
    const partes: string[][] = [];
    for (let i = 0; i < nivel.length; i += 2) partes.push(nivel.slice(i, i + 2));
    return partes;
  });
  const pos: Record<string, PosicaoArvore> = {};
  fileiras.forEach((fileira, r) => {
    fileira.forEach((id, i) => {
      const dupla = fileira.length > 1;
      pos[id] = {
        x: Math.round(dupla ? (i ? largura * 0.56 : largura * 0.12) : largura * 0.24),
        y: ARVORE_TOPO + r * ARVORE_PASSO,
        larguraRotulo: dupla ? 110 : 200,
      };
    });
  });
  return { altura: ARVORE_TOPO + fileiras.length * ARVORE_PASSO, pos };
}

/** Ligação de um tópico ao seguinte: sai de baixo do hexágono e entra por cima do outro. */
export function caminhoLigacao(de: PosicaoArvore, para: PosicaoArvore): string {
  const meio = (de.y + para.y) / 2;
  return `M${de.x} ${de.y + MEIO_HEX} C${de.x} ${meio},${para.x} ${meio},${para.x} ${para.y - MEIO_HEX}`;
}
