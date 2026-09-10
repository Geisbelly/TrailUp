/**
 * Como o tempo de estudo é escrito na tela.
 *
 * Existia em três versões no app, e a correta não era a usada nos totais:
 * `formatMinutes` arredondava para minuto inteiro, `formatMinutesTimer`
 * mostrava minuto e segundo, e o rank tinha a sua própria. O arredondamento
 * transforma estudo curto em **"0 min"** — que o aluno lê como "você não fez
 * nada".
 *
 * Medido em produção, classe 32: antes de `20260910_03` o tempo da classe era
 * 0,39 min, e a tela dizia "0 min". Depois virou 2,17 min, e a **média por
 * atividade** (2,17 / 12) é 0,18 min — que continuava saindo como "0 min".
 * Consertar a origem do número não bastou; a apresentação ainda engolia.
 *
 * A regra é uma só: **nunca escrever zero para um tempo que não é zero.**
 */

/**
 * Minutos como texto. Abaixo de um minuto muda de unidade em vez de arredondar
 * para zero.
 */
export function formatarMinutos(valor?: number | null): string {
  const minutos = Number(valor ?? 0);
  if (!Number.isFinite(minutos) || minutos <= 0) return "0 min";

  if (minutos < 1) {
    // `Math.max(1, ...)` porque 0,004 min é meio segundo: arredondar daria 0 e
    // voltaríamos a dizer que não houve estudo.
    const segundos = Math.max(1, Math.round(minutos * 60));
    return `${segundos}s`;
  }

  const inteiros = Math.round(minutos);
  if (inteiros < 60) return `${inteiros} min`;

  // 59,7 arredonda para 60: sem este ramo a tela mostraria "60 min".
  const horas = Math.floor(inteiros / 60);
  const resto = inteiros % 60;
  return resto > 0 ? `${horas}h ${resto}min` : `${horas}h`;
}

/**
 * Segundos de uma sessão. Sem medição, diz que não tem — não diz zero.
 *
 * O cartão "Tempo ativo" mostrava `0s` quando não havia lote de telemetria
 * nenhum, com "ritmo alto" no rodapé (que vem de dias ativos, não de tempo).
 * As duas frases eram verdadeiras e juntas mentiam: `0s` parece medição, e era
 * ausência de medição.
 */
export function formatarTempoDaSessao(segundos: number, temMedicao: boolean): string {
  if (!temMedicao) return "—";

  const total = Math.max(0, Math.round(Number(segundos) || 0));
  if (total <= 0) return "0s";
  if (total < 60) return `${total}s`;

  const minutos = Math.floor(total / 60);
  const resto = total % 60;
  return resto > 0 ? `${minutos}min ${resto}s` : `${minutos}min`;
}

/**
 * Minutos em minuto e segundo, para quando a precisão é o ponto (melhor tempo
 * numa atividade, por exemplo).
 */
export function formatarMinutosPreciso(valor?: number | null): string {
  if (valor == null) return "—";
  const totalSeg = Math.max(0, Math.round(Number(valor) * 60));
  const minutos = Math.floor(totalSeg / 60);
  const segundos = totalSeg % 60;
  return `${minutos}min ${segundos}s`;
}
