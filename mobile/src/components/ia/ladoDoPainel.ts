/**
 * O painel aberto do guia fica do lado do botão que o abriu (07/11).
 *
 * O botão mora no canto direito. Aberto, o painel do módulo tinha `alignSelf: "stretch"` com
 * largura fixa (até 496 px): no celular isso ocupa a tela toda, mas na tela larga a largura fixa
 * vence o stretch e o cartão encostava na ESQUERDA, por cima do texto e longe do botão.
 *
 * Quando a janela tem folga para o painel e as margens, ele se alinha à direita, onde o aluno
 * acabou de tocar. Sem folga (celular), segue como era: ocupando a largura.
 */
export const MARGEM_DO_PAINEL = 16;

export function painelAoLadoDoBotao({
  temAncora,
  larguraJanela,
  larguraPainel,
}: {
  /** Com âncora (coluna do confronto), a posição já vem de fora. */
  temAncora: boolean;
  larguraJanela: number;
  larguraPainel: number;
}): boolean {
  if (temAncora) return false;
  return larguraJanela >= larguraPainel + 3 * MARGEM_DO_PAINEL;
}
