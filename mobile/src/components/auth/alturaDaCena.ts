// Quanto da tela a cena do topo ocupa nas telas de entrar e de recuperar senha no celular.
// Fica fora de AuthCelular.tsx para ser testável sem React Native.

/** Faixa da cena com o teclado aberto (ou quando não sobra espaço): só a marca e o voltar. */
export const ALTURA_CENA_COM_TECLADO = 72;
/** A folha sobe 24px por cima da cena, para o canto arredondado não deixar um vão. */
export const SOBREPOSICAO = 24;
/**
 * Abaixo disso (fora a área do status) a frase não cabe: são duas linhas de 32px entre o voltar
 * (que vai até 54px) e os 38px de baixo (14 + a sobreposição), 156px, com folga para não encostar.
 */
export const ALTURA_CENA_COM_FRASE = 180;

/**
 * A cena tem ~31% da altura quando a folha cabe embaixo dela. Em tela baixa ela cede espaço para o
 * formulário caber inteiro (Entrar, Google e cadastro à vista sem rolar), até virar a faixa estreita
 * do teclado; se nem assim couber (fonte grande do sistema), a folha rola.
 *
 * `alturaFolha` é a altura medida do que vai dentro da folha (alça, conteúdo e respiro de baixo);
 * 0 enquanto ainda não foi medida, e aí vale a altura de sempre.
 */
export function alturaDaCena({
  alturaTela,
  topo,
  alturaFolha,
  compacta,
}: {
  alturaTela: number;
  topo: number;
  alturaFolha: number;
  compacta: boolean;
}): { altura: number; comFrase: boolean } {
  const minima = topo + ALTURA_CENA_COM_TECLADO;
  if (compacta) return { altura: minima, comFrase: false };
  const ideal = Math.round(alturaTela * 0.31) + 28 + topo;
  const queCabe = alturaFolha > 0 ? alturaTela - alturaFolha + SOBREPOSICAO : ideal;
  const altura = Math.max(minima, Math.min(ideal, Math.floor(queCabe)));
  return { altura, comFrase: altura - topo >= ALTURA_CENA_COM_FRASE };
}
