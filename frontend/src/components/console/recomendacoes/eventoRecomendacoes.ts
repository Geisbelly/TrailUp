/**
 * Avisa o menu (selo de pendentes) que uma recomendação foi decidida ou pedida, sem esperar o minuto da
 * próxima leitura. É um evento de janela, não estado compartilhado: o selo e a aba não precisam se
 * conhecer.
 */
export const EVENTO_RECOMENDACOES_MUDOU = "trailup:recomendacoes-mudou";

export function avisarQueRecomendacoesMudaram(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(EVENTO_RECOMENDACOES_MUDOU));
}
