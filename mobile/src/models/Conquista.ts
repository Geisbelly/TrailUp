import { supabase } from "@/database/supabase";
import {
  ConquistaEscopo,
  conquistaVisivelParaPerfis,
  normalizeConquistaEscopo,
} from "@/utils/conquistaAudience";
import {
  calcularProgressoConquista,
  ConquistaProgressMetrics,
} from "@/utils/conquistaProgress";

export type ConquistaBibliotecaStatus = "concluida" | "em_progresso" | "bloqueada";

export type ConquistaBibliotecaItem = {
  conquista: Conquista;
  progressoPercentual: number;
  status: ConquistaBibliotecaStatus;
  criterioResumo: string | null;
};

function clampPercent(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(100, parsed));
}

function isConcluido(row: any) {
  const status = String(row?.status ?? "").toLowerCase();
  return status.includes("concl") || Number(row?.percentual_concluido ?? 0) >= 100;
}

function longestDayStreak(values: unknown[]) {
  const days = Array.from(
    new Set(
      values
        .map((value) => new Date(String(value ?? "")))
        .filter((date) => Number.isFinite(date.getTime()))
        .map((date) => {
          date.setHours(0, 0, 0, 0);
          return date.getTime();
        }),
    ),
  ).sort((a, b) => a - b);

  let longest = 0;
  let current = 0;
  let previous: number | null = null;
  const oneDay = 24 * 60 * 60 * 1000;
  for (const day of days) {
    current = previous != null && day - previous === oneDay ? current + 1 : 1;
    longest = Math.max(longest, current);
    previous = day;
  }
  return longest;
}

async function fetchProgressMetrics(aluno_id: string): Promise<ConquistaProgressMetrics> {
  const [atividadesResult, topicosResult, revisoesResult] = await Promise.all([
    supabase
      .from("atividade_aluno")
      .select("status, percentual_concluido, acertos_percentual, tempo_gasto_min, ultima_visualizacao")
      .eq("aluno_id", aluno_id),
    supabase
      .from("topico_aluno")
      .select("status, percentual_concluido, tempo_gasto_min, ultima_visualizacao")
      .eq("aluno_id", aluno_id),
    supabase
      .from("eventos_aluno")
      .select("id", { count: "exact", head: true })
      .eq("aluno_id", aluno_id)
      .eq("tipo", "atividade_revisada"),
  ]);

  const atividades = atividadesResult.data ?? [];
  const topicos = topicosResult.data ?? [];
  const atividadesConcluidas = atividades.filter(isConcluido);
  const topicosVisitados = topicos.filter((row: any) => {
    const status = String(row?.status ?? "").toLowerCase();
    return (
      Number(row?.percentual_concluido ?? 0) > 0 ||
      (status.length > 0 && !status.includes("não iniciado") && !status.includes("nao iniciado"))
    );
  });
  const minutosTopicos = topicos.reduce(
    (sum: number, row: any) => sum + Math.max(0, Number(row?.tempo_gasto_min ?? 0) || 0),
    0,
  );
  const minutosAtividades = atividades.reduce(
    (sum: number, row: any) => sum + Math.max(0, Number(row?.tempo_gasto_min ?? 0) || 0),
    0,
  );

  return {
    atividadesConcluidas: atividadesConcluidas.length,
    atividadesPerfeitas: atividadesConcluidas.filter(
      (row: any) => Number(row?.acertos_percentual ?? 0) >= 100,
    ).length,
    atividadesAcimaDe90: atividadesConcluidas.filter(
      (row: any) => Number(row?.acertos_percentual ?? 0) >= 90,
    ).length,
    atividadesRapidas2Min: atividadesConcluidas.filter((row: any) => {
      const minutes = Number(row?.tempo_gasto_min ?? 0);
      return minutes > 0 && minutes <= 2;
    }).length,
    atividadesRapidas3Min: atividadesConcluidas.filter((row: any) => {
      const minutes = Number(row?.tempo_gasto_min ?? 0);
      return minutes > 0 && minutes <= 3;
    }).length,
    atividadesRevisadas: revisoesResult.count ?? revisoesResult.data?.length ?? 0,
    topicosVisitados: topicosVisitados.length,
    topicosConcluidos: topicos.filter(isConcluido).length,
    totalTopicos: topicos.length,
    diasSeguidos: longestDayStreak([
      ...atividades.map((row: any) => row?.ultima_visualizacao),
      ...topicos.map((row: any) => row?.ultima_visualizacao),
    ]),
    minutosAtivos: Math.max(minutosTopicos, minutosAtividades),
  };
}

function buildCriterioResumo(criterio: unknown) {
  if (!criterio || typeof criterio !== "object") return null;
  const data = criterio as Record<string, unknown>;

  if (typeof data.resumo === "string" && data.resumo.trim()) {
    return data.resumo.trim();
  }
  if (data.minimo != null) return `Complete ${String(data.minimo)} evento(s).`;
  if (data.max_tempo != null) return `Conclua em ate ${String(data.max_tempo)} minuto(s).`;
  if (data.percentual != null) return `Acerte pelo menos ${String(data.percentual)}%.`;
  if (data.dias_seguidos != null) return `Mantenha ${String(data.dias_seguidos)} dia(s) seguidos.`;
  if (data.minutos != null) return `Acumule ${String(data.minutos)} minuto(s) de estudo ativo.`;
  if (data.visitados != null) return `Visite ${String(data.visitados)} topico(s) da turma.`;

  return null;
}

export class Conquista {
  constructor(
    public conquista_id: number,
    public nome: string,
    public descricao?: string,
    public icone_url?: string,
    public categoria?: string,
    public tipo?: string,
    public criterio?: object,
    public pontos_recompensa?: number,
    public aluno_id?: string,
    public data_conquista?: string,
    public progresso?: number,
    public concluida?: boolean,
    public escopo: ConquistaEscopo = "comum",
    public perfil_alvo?: string | null
  ) {}

  private static fromJoinedRow(row: any): Conquista {
    const base = row?.conquistas ?? row ?? {};
    return new Conquista(
      base.id ?? row.conquista_id,
      base.nome ?? row.nome ?? "Conquista",
      base.descricao ?? row.descricao ?? null,
      base.icone_url ?? row.icone_url ?? null,
      base.categoria ?? row.categoria ?? null,
      base.tipo ?? row.tipo ?? null,
      base.criterio ?? row.criterio ?? null,
      base.pontos_recompensa ?? row.pontos_recompensa ?? null,
      row.aluno_id ?? null,
      row.data_conquista ?? null,
      row.progresso ?? null,
      row.concluida ?? null,
      normalizeConquistaEscopo(base.escopo ?? row.escopo),
      base.perfil_alvo ?? row.perfil_alvo ?? null
    );
  }

  static async fetchAllForAluno(
    aluno_id: string,
    perfis?: readonly string[] | null,
  ): Promise<Conquista[]> {
    const { data, error } = await supabase
      .from('conquistas_aluno')
      .select(`
        conquista_id,
        aluno_id,
        data_conquista,
        progresso,
        concluida,
        conquistas:conquista_id (
          id,
          nome,
          descricao,
          icone_url,
          categoria,
          tipo,
          criterio,
          pontos_recompensa,
          escopo,
          perfil_alvo
        )
      `)
      .eq('aluno_id', aluno_id);

    if (error) throw error;

    return (data ?? [])
      .map((row: any) => Conquista.fromJoinedRow(row))
      .filter((item) => conquistaVisivelParaPerfis(item, perfis));
  }

  static async fetchCatalogo(perfis?: readonly string[] | null): Promise<Conquista[]> {
    const { data, error } = await supabase
      .from("conquistas")
      .select("id, nome, descricao, icone_url, categoria, tipo, criterio, pontos_recompensa, escopo, perfil_alvo")
      .order("id", { ascending: true });

    if (error) throw error;

    return (data ?? []).map((row: any) =>
      new Conquista(
        Number(row.id),
        String(row.nome ?? "Conquista"),
        row.descricao ?? undefined,
        row.icone_url ?? undefined,
        row.categoria ?? undefined,
        row.tipo ?? undefined,
        row.criterio ?? undefined,
        row.pontos_recompensa ?? undefined,
        undefined,
        undefined,
        undefined,
        false,
        normalizeConquistaEscopo(row.escopo),
        row.perfil_alvo ?? null
      )
    ).filter((item) => conquistaVisivelParaPerfis(item, perfis));
  }

  static async fetchBibliotecaForAluno(
    aluno_id: string,
    perfis?: readonly string[] | null,
  ): Promise<ConquistaBibliotecaItem[]> {
    const [catalogo, progressoAluno, metrics] = await Promise.all([
      Conquista.fetchCatalogo(perfis),
      Conquista.fetchAllForAluno(aluno_id, perfis),
      fetchProgressMetrics(aluno_id),
    ]);

    const progressoById = new Map<number, Conquista>(
      progressoAluno.map((item) => [Number(item.conquista_id), item] as const)
    );

    return catalogo.map((baseConquista) => {
      const progresso = progressoById.get(Number(baseConquista.conquista_id));
      const progressoCalculado = calcularProgressoConquista(
        baseConquista.tipo,
        baseConquista.criterio,
        metrics,
      );
      const concluida = Boolean(progresso?.concluida) || progressoCalculado >= 100;
      const progressoPercentual = concluida
        ? 100
        : Math.max(
            clampPercent(progresso?.progresso ?? 0),
            clampPercent(progressoCalculado),
          );
      const status: ConquistaBibliotecaStatus = concluida
        ? "concluida"
        : progressoPercentual > 0
        ? "em_progresso"
        : "bloqueada";

      const conquistaComProgresso = new Conquista(
        baseConquista.conquista_id,
        baseConquista.nome,
        baseConquista.descricao ?? undefined,
        baseConquista.icone_url ?? undefined,
        baseConquista.categoria ?? undefined,
        baseConquista.tipo ?? undefined,
        baseConquista.criterio ?? undefined,
        baseConquista.pontos_recompensa ?? undefined,
        aluno_id,
        progresso?.data_conquista ?? undefined,
        progressoPercentual,
        concluida,
        baseConquista.escopo,
        baseConquista.perfil_alvo
      );

      return {
        conquista: conquistaComProgresso,
        progressoPercentual,
        status,
        criterioResumo: buildCriterioResumo(baseConquista.criterio),
      };
    });
  }
}
