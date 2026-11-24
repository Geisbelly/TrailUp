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

/**
 * Distância do painel ABERTO até o pé da janela (24/11).
 *
 * Fechado, o botão fica acima da barra de "Continuar" (`bottomOffset`, 148 na trilha). Aberto na
 * web em tela larga, o painel herdava essa mesma base e ficava pendurado no meio da tela, com o
 * fim bem acima do rodapé. Lá ele desce até a margem, como um chat flutuante; a conversa cobre a
 * barra só enquanto está aberta. No aparelho e no celular segue a base de antes (barra de abas e
 * área segura), e com âncora a base já vem de fora.
 */
export function baseDoPainelAberto({
  web,
  aoLadoDoBotao,
  base,
}: {
  web: boolean;
  aoLadoDoBotao: boolean;
  /** Base do botão fechado (`bottomOffset`). */
  base: number;
}): number {
  if (web && aoLadoDoBotao) return Math.min(base, MARGEM_DO_PAINEL);
  return base;
}
