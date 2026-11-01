import type { Retangulo } from "./posicaoBalaoTour";

/** O que `measureInWindow` devolve: x, y, largura e altura do elemento. */
export type MedidaNaJanela = { x: number; y: number; width: number; height: number };

/**
 * Recorte do tutorial inicial em volta do elemento medido (#33), nas
 * coordenadas do Modal do tour, que cobre a tela inteira a partir do topo
 * físico. Devolve `null` quando a medida ainda não serve: elemento sem
 * tamanho (a tela está no meio da troca) ou inteiro fora da tela. Nesse caso
 * quem chama mantém o recorte que já tinha, em vez de acender um retângulo
 * grampeado na borda, sobre outro elemento.
 *
 * A barra de status só entra no Android. Lá o `measureInWindow` desconta a
 * área visível da janela (`RootViewUtil.getViewportOffset`), e a medida começa
 * abaixo da barra. No iOS ela vem nas coordenadas da UIWindow e na web vem do
 * `getBoundingClientRect`: as duas já partem do topo da tela. Somar o inset
 * nelas descia o recorte uma barra de status inteira e acendia metade do
 * elemento e metade do que vem embaixo.
 */
export function retanguloDoDestaque(
  medida: MedidaNaJanela,
  tela: { width: number; height: number },
  { plataforma, insetTopo, respiro = 8 }: { plataforma: string; insetTopo: number; respiro?: number },
): Retangulo | null {
  if (medida.width < 2 || medida.height < 2) return null;

  const deslocamento = plataforma === "android" ? insetTopo : 0;
  const topo = medida.y + deslocamento;
  const fora =
    topo + medida.height < 0 || topo > tela.height || medida.x + medida.width < 0 || medida.x > tela.width;
  if (fora) return null;

  const esquerda = Math.max(0, medida.x - respiro);
  const cima = Math.max(0, topo - respiro);
  const direita = Math.min(tela.width, medida.x + medida.width + respiro);
  const baixo = Math.min(tela.height, topo + medida.height + respiro);
  return { top: cima, left: esquerda, width: direita - esquerda, height: baixo - cima };
}

type Ponto = { x: number; y: number };

/** Onde o balão do celular ficou em relação ao recorte, na vertical. */
export function ladoDoBalao(alvo: Retangulo, balao: { top: number; height: number }): "abaixo" | "acima" | "sobre" {
  if (balao.top >= alvo.top + alvo.height) return "abaixo";
  if (balao.top + balao.height <= alvo.top) return "acima";
  return "sobre";
}

/**
 * A seta do balão até o recorte, no celular. Ela sai da borda do balão que
 * olha para o alvo e termina na borda do alvo que olha para o balão. Com o
 * balão por cima do alvo (alvo alto, como a lista das Configurações), não há
 * seta: qualquer borda que ela tocasse ficaria sobre outro elemento.
 *
 * Antes o sentido saía de "o alvo está na metade de cima da tela", não de
 * onde o balão estava. Com o alvo na metade de baixo e o balão logo abaixo
 * dele, a seta atravessava o balão e o alvo, e a ponta parava na borda de
 * cima do recorte, em cima do elemento vizinho (#33).
 */
export function setaDoBalao(
  alvo: Retangulo,
  balao: { top: number; height: number; left: number; right: number },
  larguraTela: number,
  margem = 22,
): { inicio: Ponto; fim: Ponto } | null {
  const lado = ladoDoBalao(alvo, balao);
  if (lado === "sobre") return null;
  const xBalao = (balao.left + balao.right) / 2;
  const xAlvo = Math.max(margem, Math.min(larguraTela - margem, alvo.left + alvo.width / 2));
  return lado === "abaixo"
    ? { inicio: { x: xBalao, y: balao.top }, fim: { x: xAlvo, y: alvo.top + alvo.height } }
    : { inicio: { x: xBalao, y: balao.top + balao.height }, fim: { x: xAlvo, y: alvo.top } };
}
