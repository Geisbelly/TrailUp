import { TelemetryAnalysisResponse, TelemetryTimeMetrics } from "@/interfaces/telemetria/TelemetryContracts";
import { IABattleRuntimeState } from "@/interfaces/personalizacao/IAContracts";
import { Classe } from "@/models/Classe";
import { Conquista } from "@/models/Conquista";
import { EventoAluno } from "@/models/Evento";
import { PerfilDoAluno } from "@/models/PerfilAluno";
import { PosicaoDoAluno } from "@/models/RankAlunoPosicao";
import { buildClasseAcademicMetrics, buildClasseResumoFallback } from "@/utils/classeMetrics";

export type MetricsCameraPermissionState = "unknown" | "granted" | "denied" | "unavailable";

export type ProfileMetricAffinity = {
  id: number | string;
  nome: string;
  afinidade: number;
};

export type ProfileMetricsViewModel = {
  progresso: number;
  acertos: number;
  tempo: number;
  tempoAtivoMin: number;
  tempoMedio: number;
  totalTopicos: number;
  concluidos: number;
  emAndamento: number;
  pendentes: number;
  totalConteudos: number;
  conteudosConcluidos: number;
  totalAtividades: number;
  atividadesConcluidas: number;
  totalConquistas: number;
  diasAtivos: number;
  eventosRecentes: number;
  semanaDiaria: number[];
  ultimoEvento: string | null;
  melhorPosicao: PosicaoDoAluno | null;
  afinidades: ProfileMetricAffinity[];
  materiaNome: string | null;
  emotionLabel: string;
  cameraLabel: string;
  cicloId: string | null;
  actions: string[];
  analysisSummary: string | null;
  analysisInsights: string[];
  analysisWarnings: string[];
  analysisRecommendations: string[];
  analysisSignals: string[];
  topicosDescobertos: number;
  taxaExploracao: number;
  taxaConteudo: number;
  taxaAtividade: number;
  proximoMarco: string;
  missaoResumo: string;
  presencaResumo: string;
  hasAnyData: boolean;
  sessionActiveSec: number;
  sessionIdleSec: number;
  sessionEngajamento: number;
  tempoTopico: number;
  tempoConteudo: number;
  tempoAtividade: number;
  topicosVisitados: number;
  touchTotal: number;
  scrollTotal: number;
  materialFocadoTipo: string | null;
  hasSessionMetrics: boolean;
  danoTotal: number | null;
  melhorTempoMin: number | null;
};

function clampPercent(value?: number | null) {
  const numeric = Number(value ?? 0);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(100, numeric));
}

function humanizeAction(action: string) {
  return action
    .replace(/^analise_/, "")
    .replace(/^decisao_/, "")
    .replace(/[:_]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function normalizeSentence(value: unknown) {
  const text = String(value ?? "").replace(/\s+/g, " ").trim();
  return text || null;
}

function collectStringValues(value: unknown) {
  if (Array.isArray(value)) {
    return value
      .map((entry) => normalizeSentence(entry))
      .filter((entry): entry is string => Boolean(entry));
  }

  const text = normalizeSentence(value);
  return text ? [text] : [];
}

function humanizeConfigValue(value: unknown) {
  const text = normalizeSentence(value);
  if (!text) return null;
  return text
    .replace(/[_-]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function uniqueCompact(items: (string | null | undefined)[], limit = 6) {
  const output: string[] = [];
  const seen = new Set<string>();

  items.forEach((item) => {
    const normalized = normalizeSentence(item);
    if (!normalized || seen.has(normalized) || output.length >= limit) return;
    seen.add(normalized);
    output.push(normalized);
  });

  return output;
}

function getEmotionLabel(raw: unknown) {
  const value = String(raw ?? "").trim().toLowerCase();
  if (!value) return "Sem leitura recente";

  const labels: Record<string, string> = {
    neutro: "Neutro",
    frustrado: "Frustrado",
    ansioso: "Ansioso",
    focado: "Focado",
    cansado: "Cansado",
  };

  return labels[value] ?? value.replace(/\b\w/g, (char) => char.toUpperCase());
}

function buildPresenceSummary(diasAtivos: number, eventosRecentes: number) {
  if (diasAtivos >= 6) return "ritmo alto";
  if (diasAtivos >= 3 || eventosRecentes >= 5) return "ritmo consistente";
  if (diasAtivos >= 1 || eventosRecentes >= 1) return "ritmo em retomada";
  return "sem movimentação recente";
}

function buildMissionSummary(progresso: number, acertos: number) {
  if (progresso >= 85 && acertos >= 75) return "fase de domínio";
  if (progresso >= 50) return "avanço sólido";
  if (progresso > 0) return "em aquecimento";
  return "pronto para começar";
}

function buildNextMilestone(
  concluidos: number,
  totalTopicos: number,
  atividadesConcluidas: number,
  totalAtividades: number
) {
  if (totalTopicos === 0) return "Entre em uma classe para liberar a trilha.";
  if (concluidos < totalTopicos) return `Feche ${concluidos + 1} de ${totalTopicos} tópicos da campanha.`;
  if (atividadesConcluidas < totalAtividades) return "Finalize as últimas atividades para consolidar a trilha.";
  return "Trilha concluída. Hora de manter o ritmo.";
}

function buildAnalysisView(lastAnalysis: TelemetryAnalysisResponse | null, emotionLabel: string) {
  const emotionRecord =
    lastAnalysis?.emocao_atual &&
    typeof lastAnalysis.emocao_atual === "object" &&
    !Array.isArray(lastAnalysis.emocao_atual)
      ? lastAnalysis.emocao_atual
      : null;

  const uiConfig =
    lastAnalysis?.ui_config &&
    typeof lastAnalysis.ui_config === "object" &&
    !Array.isArray(lastAnalysis.ui_config)
      ? lastAnalysis.ui_config
      : null;

  const emotionKey = String(emotionRecord?.["emocao_primaria"] ?? "").trim().toLowerCase();
  const primaryAction = lastAnalysis?.acoes_aplicadas?.[0]
    ? humanizeAction(lastAnalysis.acoes_aplicadas[0])
    : null;

  const summary = lastAnalysis?.ciclo_id
    ? primaryAction
      ? `A IA percebeu ${emotionLabel.toLowerCase()} e respondeu com ${primaryAction.toLowerCase()}.`
      : `A IA percebeu ${emotionLabel.toLowerCase()} e ajustou a experiência desta sessão.`
    : null;

  const signals = uniqueCompact(
    [
      uiConfig?.["ritmo_conteudo"]
        ? `Ritmo: ${humanizeConfigValue(uiConfig["ritmo_conteudo"])}`
        : null,
      uiConfig?.["complexidade_visual"]
        ? `Visual: ${humanizeConfigValue(uiConfig["complexidade_visual"])}`
        : null,
      uiConfig?.["tom_feedbacks"]
        ? `Feedback: ${humanizeConfigValue(uiConfig["tom_feedbacks"])}`
        : null,
      uiConfig?.["tipo_modal"]
        ? `Ajuda: ${humanizeConfigValue(uiConfig["tipo_modal"])}`
        : null,
    ],
    4
  );

  const insights = uniqueCompact([
    emotionRecord?.["resumo"],
    emotionRecord?.["motivo"],
    emotionRecord?.["contexto"],
    ...collectStringValues(emotionRecord?.["evidencias"]),
  ]);

  const warnings = uniqueCompact([
    ["frustrado", "ansioso", "cansado", "tired", "overwhelmed"].includes(emotionKey)
      ? "A sessão mostrou sinais de desgaste. Vale reduzir a pressão e trabalhar em blocos curtos."
      : null,
    ...collectStringValues(lastAnalysis?.erros).map((item) => `Falha registrada: ${item}`),
  ]);

  const recommendations = uniqueCompact([
    ...signals,
    ...((lastAnalysis?.acoes_aplicadas ?? [])
      .slice(0, 3)
      .map((action) => `Ação aplicada: ${humanizeAction(action)}`)),
  ]);

  return {
    summary,
    insights,
    warnings,
    recommendations,
    signals,
  };
}

type BuildMetricsViewModelParams = {
  classeAtual: Classe | null;
  conquistas: Conquista[];
  eventos: EventoAluno[];
  posicoesDoAluno: PosicaoDoAluno[];
  perfis: PerfilDoAluno[];
  lastAnalysis: TelemetryAnalysisResponse | null;
  lastBatchTimeMetrics?: TelemetryTimeMetrics | null;
  cameraOptIn: boolean;
  cameraPermission: MetricsCameraPermissionState;
  battleState?: IABattleRuntimeState | null;
};

export function buildProfileMetricsViewModel({
  classeAtual,
  conquistas,
  eventos,
  posicoesDoAluno,
  perfis,
  lastAnalysis,
  lastBatchTimeMetrics,
  cameraOptIn,
  cameraPermission,
  battleState,
}: BuildMetricsViewModelParams): ProfileMetricsViewModel {
  const resumoConfiavel = buildClasseResumoFallback(classeAtual, classeAtual?.resumo ?? null);
  const academicMetrics = buildClasseAcademicMetrics(classeAtual);
  const totalTopicos = academicMetrics.totalTopicos;
  const concluidos = academicMetrics.topicosConcluidos;
  const emAndamento = academicMetrics.topicosEmAndamento;
  const totalConteudos = academicMetrics.totalConteudos;
  const conteudosConcluidos = academicMetrics.conteudosConcluidos;
  const totalAtividades = academicMetrics.totalAtividades;
  const atividadesConcluidas = academicMetrics.atividadesConcluidas;
  const hasEstruturaDaClasse = totalTopicos > 0 || totalConteudos > 0 || totalAtividades > 0;
  const hasAtividades = totalAtividades > 0;
  const progresso = hasEstruturaDaClasse
    ? academicMetrics.progressPct
    : resumoConfiavel?.porcentagemConcluida ?? classeAtual?.getProgressoGeral() ?? 0;
  const acertos = hasAtividades
    ? academicMetrics.acertosPercentual
    : resumoConfiavel?.acertosPercentual ?? 0;
  const tempoPersistido = hasEstruturaDaClasse
    ? academicMetrics.tempoTotalMin
    : resumoConfiavel?.tempoGastoMin ?? 0;
  const tempoMedio = hasAtividades
    ? academicMetrics.tempoMedioPorAtividade
    : resumoConfiavel?.tempoMedioPorAtividade ?? 0;
  const seteDias = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const eventosRecentes = eventos.filter((evento) => {
    const time = evento.criado_em ? new Date(evento.criado_em).getTime() : NaN;
    return Number.isFinite(time) && time >= seteDias;
  });

  const diasAtivos = new Set(
    eventos
      .map((evento) => {
        const time = evento.criado_em ? new Date(evento.criado_em).getTime() : NaN;
        return Number.isFinite(time) ? new Date(time).toISOString().slice(0, 10) : null;
      })
      .filter(Boolean)
  ).size;

  const todayMidnight = new Date();
  todayMidnight.setHours(0, 0, 0, 0);
  const semanaDiaria = Array.from({ length: 7 }, (_, i) => {
    const dayStart = new Date(todayMidnight);
    dayStart.setDate(todayMidnight.getDate() - (6 - i));
    const dayEnd = new Date(dayStart);
    dayEnd.setDate(dayStart.getDate() + 1);
    return eventos.filter((e) => {
      const t = e.criado_em ? new Date(e.criado_em).getTime() : NaN;
      return Number.isFinite(t) && t >= dayStart.getTime() && t < dayEnd.getTime();
    }).length;
  });

  const melhorPosicao =
    [...posicoesDoAluno].sort(
      (a, b) => (a.posicao ?? Number.MAX_SAFE_INTEGER) - (b.posicao ?? Number.MAX_SAFE_INTEGER)
    )[0] ?? null;

  const emotionLabel = getEmotionLabel(
    lastAnalysis?.emocao_atual &&
      typeof lastAnalysis.emocao_atual === "object" &&
      !Array.isArray(lastAnalysis.emocao_atual)
      ? lastAnalysis.emocao_atual["emocao_primaria"]
      : null
  );

  const cameraLabel =
    cameraPermission === "unavailable"
      ? "Câmera indisponível"
      : cameraOptIn && cameraPermission === "granted"
      ? "Coleta visual ativa"
      : cameraPermission === "denied"
      ? "Permissão negada"
      : "Coleta visual desligada";

  const afinidades = [...perfis]
    .sort((a, b) => (b.afinidade ?? 0) - (a.afinidade ?? 0))
    .map((item) => ({
      id: item.id ?? item.nome ?? Math.random(),
      nome: item.nome ?? "Perfil",
      afinidade: clampPercent(item.afinidade ?? 0),
    }));

  const topicosDescobertos = Math.min(totalTopicos, concluidos + emAndamento);
  const taxaExploracao = totalTopicos > 0 ? clampPercent((topicosDescobertos / totalTopicos) * 100) : 0;
  const taxaConteudo = totalConteudos > 0 ? clampPercent((conteudosConcluidos / totalConteudos) * 100) : 0;
  const taxaAtividade = totalAtividades > 0 ? clampPercent((atividadesConcluidas / totalAtividades) * 100) : 0;

  const tm = lastBatchTimeMetrics ?? null;
  const sessionActiveSec = tm?.general.batch_active_sec ?? 0;
  const sessionIdleSec = tm?.general.batch_idle_sec ?? 0;
  const sessionElapsedSec = tm?.general.session_elapsed_sec ?? 0;
  const tempoAtivoMin = Math.max(0, Math.round(sessionActiveSec / 60));
  const sessionEngajamento =
    sessionActiveSec + sessionIdleSec > 0
      ? clampPercent((sessionActiveSec / (sessionActiveSec + sessionIdleSec)) * 100)
      : 0;
  const tempo = Math.max(0, Number(tempoPersistido) + sessionElapsedSec / 60);
  const topicsArr = tm?.topics ?? [];
  const contentsArr = tm?.contents ?? [];
  const activitiesArr = tm?.activities ?? [];
  const materialsArr = tm?.materials ?? [];
  const avgActiveSec = (arr: { active_sec: number }[]) =>
    arr.length ? Math.round(arr.reduce((s, e) => s + e.active_sec, 0) / arr.length) : 0;
  const topicosVisitados = topicsArr.filter((e) => e.visits > 0).length;
  const bestMaterial = [...materialsArr].sort((a, b) => b.active_sec - a.active_sec)[0] ?? null;
  const analysisView = buildAnalysisView(lastAnalysis, emotionLabel);

  const danoTotal =
    battleState?.totalDamage != null && Number.isFinite(battleState.totalDamage)
      ? Math.round(battleState.totalDamage)
      : null;

  const temposAtividades = (classeAtual?.topicos ?? [])
    .flatMap((t) => t.atividades ?? [])
    .filter((a) => {
      const concluida =
        String(a.status ?? "").toLowerCase().includes("concl") ||
        Number(a.percentual_concluido ?? 0) >= 100;
      return concluida && Number(a.tempo_gasto_min ?? 0) > 0;
    })
    .map((a) => Number(a.tempo_gasto_min));

  const melhorTempoMin = temposAtividades.length > 0 ? Math.min(...temposAtividades) : null;

  return {
    progresso: clampPercent(progresso),
    acertos: clampPercent(acertos),
    tempo,
    tempoAtivoMin,
    tempoMedio: Math.max(0, Number(tempoMedio)),
    totalTopicos,
    concluidos,
    emAndamento,
    pendentes: Math.max(0, totalTopicos - concluidos - emAndamento),
    totalConteudos,
    conteudosConcluidos,
    totalAtividades,
    atividadesConcluidas,
    totalConquistas: conquistas.length,
    diasAtivos,
    eventosRecentes: eventosRecentes.length,
    semanaDiaria,
    ultimoEvento: eventos[0]?.criado_em ?? null,
    melhorPosicao,
    afinidades,
    materiaNome: resumoConfiavel?.materia_nome ?? null,
    emotionLabel,
    cameraLabel,
    cicloId: lastAnalysis?.ciclo_id ?? null,
    actions: lastAnalysis?.acoes_aplicadas?.slice(0, 5).map(humanizeAction) ?? [],
    analysisSummary: analysisView.summary,
    analysisInsights: analysisView.insights,
    analysisWarnings: analysisView.warnings,
    analysisRecommendations: analysisView.recommendations,
    analysisSignals: analysisView.signals,
    topicosDescobertos,
    taxaExploracao,
    taxaConteudo,
    taxaAtividade,
    proximoMarco: buildNextMilestone(concluidos, totalTopicos, atividadesConcluidas, totalAtividades),
    missaoResumo: buildMissionSummary(clampPercent(progresso), clampPercent(acertos)),
    presencaResumo: buildPresenceSummary(diasAtivos, eventosRecentes.length),
    hasAnyData: totalTopicos > 0 || eventos.length > 0 || conquistas.length > 0 || Boolean(lastAnalysis?.ciclo_id),
    sessionActiveSec,
    sessionIdleSec,
    sessionEngajamento,
    tempoTopico: avgActiveSec(topicsArr),
    tempoConteudo: avgActiveSec(contentsArr),
    tempoAtividade: avgActiveSec(activitiesArr),
    topicosVisitados,
    touchTotal: tm?.general.touch_count ?? 0,
    scrollTotal: tm?.general.scroll_distance_px ?? 0,
    materialFocadoTipo: bestMaterial?.material_tipo ?? null,
    hasSessionMetrics: tm !== null,
    danoTotal,
    melhorTempoMin,
  };
}
