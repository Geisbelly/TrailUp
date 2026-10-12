/**
 * Dias seguidos com estudo até hoje, a partir da atividade dos últimos dias
 * (o último elemento é hoje). Hoje ainda sem estudo não quebra a sequência:
 * conta-se a partir de ontem. Usado no Perfil da web em tela larga (#346).
 */
export function sequenciaDeDias(semana: readonly number[]): number {
  let i = semana.length - 1;
  if (i >= 0 && !(semana[i] > 0)) i -= 1;
  let dias = 0;
  for (; i >= 0 && semana[i] > 0; i -= 1) dias += 1;
  return dias;
}
