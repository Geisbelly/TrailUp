import { supabase } from "@/database/supabase";

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

function buildCriterioResumo(criterio: unknown) {
  if (!criterio || typeof criterio !== "object") return null;
  const data = criterio as Record<string, unknown>;

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
    public concluida?: boolean
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
      row.concluida ?? null
    );
  }

  static async fetchAllForAluno(aluno_id: string): Promise<Conquista[]> {
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
          pontos_recompensa
        )
      `)
      .eq('aluno_id', aluno_id);

    if (error) throw error;

    return (data ?? []).map((row: any) => Conquista.fromJoinedRow(row));
  }

  static async fetchCatalogo(): Promise<Conquista[]> {
    const { data, error } = await supabase
      .from("conquistas")
      .select("id, nome, descricao, icone_url, categoria, tipo, criterio, pontos_recompensa")
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
        false
      )
    );
  }

  static async fetchBibliotecaForAluno(aluno_id: string): Promise<ConquistaBibliotecaItem[]> {
    const [catalogo, progressoAluno] = await Promise.all([
      Conquista.fetchCatalogo(),
      Conquista.fetchAllForAluno(aluno_id),
    ]);

    const progressoById = new Map<number, Conquista>(
      progressoAluno.map((item) => [Number(item.conquista_id), item] as const)
    );

    return catalogo.map((baseConquista) => {
      const progresso = progressoById.get(Number(baseConquista.conquista_id));
      const concluida = Boolean(progresso?.concluida);
      const progressoPercentual = concluida
        ? 100
        : clampPercent(progresso?.progresso ?? 0);
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
        concluida
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
