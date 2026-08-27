export type ConquistaProgressMetrics = {
  atividadesConcluidas: number;
  atividadesPerfeitas: number;
  atividadesAcimaDe90: number;
  atividadesRapidas2Min: number;
  atividadesRapidas3Min: number;
  atividadesRevisadas: number;
  topicosVisitados: number;
  topicosConcluidos: number;
  totalTopicos: number;
  diasSeguidos: number;
  minutosAtivos: number;
};

function percent(current: number, target: number) {
  if (!Number.isFinite(current) || !Number.isFinite(target) || target <= 0) return 0;
  return Math.max(0, Math.min(100, (current / target) * 100));
}

export function calcularProgressoConquista(
  tipo: string | null | undefined,
  criterio: object | null | undefined,
  metrics: ConquistaProgressMetrics,
) {
  const key = String(tipo ?? "").trim().toLowerCase();
  const data = (criterio ?? {}) as Record<string, unknown>;
  const minimo = Math.max(1, Number(data.minimo ?? 1) || 1);
  const percentual = Math.max(1, Number(data.percentual ?? 100) || 100);
  const dias = Math.max(1, Number(data.dias_seguidos ?? 1) || 1);
  const minutos = Math.max(1, Number(data.minutos ?? 1) || 1);

  if (key === "simples") return percent(metrics.atividadesConcluidas, minimo);
  if (key === "tempo") return percent(metrics.atividadesRapidas2Min, minimo);
  if (key === "acertos") {
    return percentual >= 100
      ? percent(metrics.atividadesPerfeitas, minimo)
      : percent(metrics.atividadesAcimaDe90, minimo);
  }
  if (key === "dias") return percent(metrics.diasSeguidos, dias);
  if (key === "tempo_total") return percent(metrics.minutosAtivos, minutos);
  if (key === "exploracao") return percent(metrics.topicosVisitados, metrics.totalTopicos);

  if (key.startsWith("brainhex_seeker_")) {
    const alvo = data.visitados === "todos" ? metrics.totalTopicos : Number(data.visitados ?? 1);
    return percent(metrics.topicosVisitados, Math.max(1, alvo || 1));
  }
  if (key === "brainhex_achiever_colecionador") {
    return percent(metrics.atividadesConcluidas, 5);
  }
  if (key === "brainhex_achiever_sequencia") {
    return percent(metrics.atividadesConcluidas, 10);
  }
  if (key === "brainhex_achiever_mestre" || key === "brainhex_mastermind_plano") {
    return percent(metrics.topicosConcluidos, metrics.totalTopicos);
  }
  if (key.startsWith("brainhex_survivor_")) {
    return key.endsWith("_jornada")
      ? percent(metrics.minutosAtivos, minutos)
      : percent(metrics.diasSeguidos, dias);
  }
  if (key.startsWith("brainhex_daredevil_")) {
    const concluidas = key.endsWith("_arrancada")
      ? metrics.atividadesRapidas2Min
      : metrics.atividadesRapidas3Min;
    return percent(concluidas, minimo);
  }
  if (key === "brainhex_mastermind_estrategista") {
    return percent(metrics.atividadesAcimaDe90, minimo);
  }
  if (key === "brainhex_mastermind_analista") {
    return percent(metrics.atividadesRevisadas, minimo);
  }
  if (key.startsWith("brainhex_conqueror_")) {
    if (key.endsWith("_soberania")) {
      return percent(metrics.topicosConcluidos, metrics.totalTopicos);
    }
    return percent(metrics.topicosConcluidos, minimo);
  }
  if (key.startsWith("brainhex_socializer_")) {
    return percent(metrics.diasSeguidos, dias);
  }

  return 0;
}
