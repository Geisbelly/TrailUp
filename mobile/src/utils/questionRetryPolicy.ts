/**
 * Regra de nova tentativa por alternativa restante.
 *
 * No modo pensante o aluno pode refazer a questão valendo metade dos pontos.
 * Isso pressupõe que ainda haja uma escolha a fazer -- e em Verdadeiro/Falso,
 * que tem duas alternativas, não há: errada a primeira, a que sobra é
 * necessariamente a correta. A "segunda tentativa" é eliminação, não
 * conhecimento, e ainda assim pontuava metade.
 *
 * Só vale de duas alternativas para cima: dissertativa e lacuna não têm
 * alternativas (lista vazia) e nunca caem nesta regra.
 */
export function restaApenasUmaAlternativa(
  totalAlternativas: number,
  opcoesTentadas: readonly number[],
  tentativasRegistradas = 0
): boolean {
  if (!Number.isFinite(totalAlternativas) || totalAlternativas < 2) return false;
  const distintas = new Set(
    opcoesTentadas.filter((indice) => Number.isInteger(indice) && indice >= 0 && indice < totalAlternativas)
  );
  // `opcoesTentadas` vive no estado da tela e se perde ao sair e voltar;
  // `tentativasRegistradas` (ultima_tentativa) acompanha a questao. Sem o
  // segundo sinal, reabrir a atividade devolvia a tentativa por eliminacao.
  // Ele conta tentativas, nao opcoes distintas, entao repetir a mesma
  // alternativa consome uma chance -- erra para o lado conservador, que e o
  // desejado aqui.
  const consumidas = Math.max(
    distintas.size,
    Number.isFinite(tentativasRegistradas) ? Math.max(0, Math.trunc(tentativasRegistradas)) : 0
  );
  return consumidas >= totalAlternativas - 1;
}
