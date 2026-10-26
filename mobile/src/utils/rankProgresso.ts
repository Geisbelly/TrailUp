/**
 * Percentual do líder (o "progresso" da linha do rank), com a mesma regra da view
 * `vw_rank_posicoes_por_classe_todas` (#155): sem número onde ele engana.
 */

/** Abaixo disto o rank não mostra percentual. É o padrão de `rank_progresso_min_participantes`. */
export const MIN_PARTICIPANTES_PARA_PROGRESSO = 8;

/** O banco chama a coluna de `percentual_do_lider`; `progresso` fica para linhas já montadas aqui. */
export function progressoDaLinha(row: { progresso?: unknown; percentual_do_lider?: unknown }): number | null {
  const bruto = row.progresso ?? row.percentual_do_lider;
  if (bruto == null) return null;
  const valor = Number(bruto);
  return Number.isFinite(valor) ? valor : null;
}

/**
 * `pontuacao / maior * 100`, limitado a 0..100 e com duas casas. `null` no Elo (rating contra
 * rating não é fração de nada), com menos de `minimo` participantes e quando o líder não tem ponto.
 */
export function progressoDoLider(
  pontuacao: number,
  maior: number,
  participantes: number,
  criterio: string | null | undefined,
  minimo: number = MIN_PARTICIPANTES_PARA_PROGRESSO,
): number | null {
  if (String(criterio ?? "").trim().toLowerCase() === "elo") return null;
  if (participantes < minimo) return null;
  if (!Number.isFinite(maior) || maior <= 0 || !Number.isFinite(pontuacao)) return null;
  const pct = Math.round((pontuacao / maior) * 100 * 100) / 100;
  return Math.min(100, Math.max(0, pct));
}
