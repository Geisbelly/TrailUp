import { supabase } from "@/database/supabase";
import { PosicaoDoAluno } from "./RankAlunoPosicao";
import { RankInfo } from "./RankInfo";
import { RankPosicao } from "./RankPosicao";

function normalizeClasseId(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function normalizeReferenciaId(value: unknown): number | null {
  if (value == null) return null;

  const normalized = String(value).trim();
  if (!normalized) return null;

  if (/^\d+$/.test(normalized)) {
    return Number(normalized);
  }

  const suffixMatch = normalized.match(/(\d+)$/);
  if (suffixMatch?.[1]) {
    return Number(suffixMatch[1]);
  }

  return null;
}

function roundProgress(value: number) {
  return Math.round(value * 100) / 100;
}

type FallbackRankRow = {
  rank_id: number;
  classe_id: number;
  posicao: number;
  id_aluno: string;
  nome_aluno: string;
  pontuacao: number;
  progresso: number | null;
  medalha: string | null;
};

type ClasseAlunoMetricRow = {
  aluno_id: string;
  porcentagemConcluida?: number | null;
  tempoGastoMin?: number | null;
};

function isTipoLike(tipo: unknown, prefixo: "topico" | "conteudo" | "atividade") {
  return String(tipo ?? "").trim().toLowerCase().startsWith(prefixo);
}

function buildRankPosicao(row: any) {
  return new RankPosicao(
    Number(row.rank_id),
    Number(row.classe_id),
    row.posicao != null ? Number(row.posicao) : null,
    String(row.id_aluno),
    String(row.nome_aluno ?? "Aluno"),
    row.pontuacao != null ? Number(row.pontuacao) : null,
    row.progresso != null ? Number(row.progresso) : null,
    row.medalha != null ? String(row.medalha) : null
  );
}

function buildPosicaoDoAluno(alunoId: string, row: RankPosicao) {
  return new PosicaoDoAluno(
    row.rank_id,
    row.classe_id,
    alunoId,
    row.posicao ?? null,
    row.pontuacao ?? null,
    row.progresso ?? null,
    row.medalha ?? null
  );
}

function buildRankInfoFromRow(row: {
  rank_id: unknown;
  classe_id: unknown;
  nome_rank: unknown;
  descricao?: unknown;
  criterio?: unknown;
  icone?: unknown;
}) {
  return new RankInfo(
    Number(row.rank_id),
    Number(row.classe_id),
    String(row.nome_rank ?? "Rank"),
    row.descricao != null ? String(row.descricao) : null,
    row.criterio != null ? String(row.criterio) : null,
    row.icone != null ? String(row.icone) : null
  );
}

async function loadFallbackRankInfosByClasse(classeId: number): Promise<RankInfo[]> {
  const { data: rankRows, error: rankError } = await supabase
    .from("ranks")
    .select("id, classe_id, nome, descricao, tipo_id, icone")
    .eq("classe_id", classeId)
    .order("id", { ascending: true });
  if (rankError) throw rankError;

  const rows = (rankRows ?? []) as {
    id: number;
    classe_id: number;
    nome: string | null;
    descricao: string | null;
    tipo_id: number | null;
    icone: string | number | null;
  }[];
  if (!rows.length) return [];

  const tipoIds = [...new Set(rows.map((row) => Number(row.tipo_id ?? 0)).filter((id) => id > 0))];
  const criterioByTipoId = new Map<number, string | null>();

  if (tipoIds.length) {
    const { data: tipoRows, error: tipoError } = await supabase
      .from("rank_tipo")
      .select("id, criterio")
      .in("id", tipoIds);
    if (tipoError) throw tipoError;
    (tipoRows ?? []).forEach((row: any) => {
      criterioByTipoId.set(Number(row.id), row.criterio != null ? String(row.criterio) : null);
    });
  }

  return rows.map(
    (row) =>
      new RankInfo(
        Number(row.id),
        Number(row.classe_id),
        String(row.nome ?? `Rank ${row.id}`),
        row.descricao ?? null,
        row.tipo_id != null ? criterioByTipoId.get(Number(row.tipo_id)) ?? null : null,
        row.icone != null ? String(row.icone) : null
      )
  );
}

function buildFallbackRankRows(
  classeId: number,
  infos: RankInfo[],
  metricsRows: ClasseAlunoMetricRow[],
  studentNames: Map<string, string>,
  scoreByAluno: Map<string, number>
): FallbackRankRow[] {
  const allRows: FallbackRankRow[] = [];

  infos.forEach((info) => {
    const criterio = String(info.criterio ?? "").toLowerCase();
    const baseRows = metricsRows.map((row) => {
      const alunoId = String(row.aluno_id);
      const pontuacao =
        criterio === "percentual"
          ? Number(row.porcentagemConcluida ?? 0)
          : criterio === "pontuacao"
          ? Number(scoreByAluno.get(alunoId) ?? 0)
          : criterio === "tempo"
          ? Number(row.tempoGastoMin ?? 0)
          : 0;

      return {
        rank_id: info.rank_id,
        classe_id: classeId,
        id_aluno: alunoId,
        nome_aluno: studentNames.get(alunoId) ?? "Aluno",
        pontuacao: Number.isFinite(pontuacao) ? pontuacao : 0,
      };
    });

    const sortedRows = [...baseRows].sort((a, b) => {
      if (b.pontuacao !== a.pontuacao) {
        return b.pontuacao - a.pontuacao;
      }
      return a.id_aluno.localeCompare(b.id_aluno);
    });

    const maxPontuacao = sortedRows.length
      ? Math.max(...sortedRows.map((row) => row.pontuacao))
      : 0;

    let lastPontuacao: number | null = null;
    let currentRank = 0;

    sortedRows.forEach((row, index) => {
      if (lastPontuacao == null || row.pontuacao !== lastPontuacao) {
        currentRank = index + 1;
        lastPontuacao = row.pontuacao;
      }

      allRows.push({
        ...row,
        posicao: currentRank,
        progresso: maxPontuacao > 0 ? roundProgress((row.pontuacao / maxPontuacao) * 100) : null,
        medalha:
          currentRank === 1
            ? "ouro"
            : currentRank === 2
            ? "prata"
            : currentRank === 3
            ? "bronze"
            : null,
      });
    });
  });

  return allRows;
}

async function loadFallbackRankRowsByClasse(
  classeId: number,
  infos: RankInfo[]
): Promise<FallbackRankRow[]> {
  if (!infos.length) return [];

  const { data: metricsRows, error: metricsError } = await supabase
    .from("classe_aluno")
    .select("aluno_id, porcentagemConcluida, tempoGastoMin")
    .eq("classe_id", classeId);
  if (metricsError) throw metricsError;

  const metrics = (metricsRows ?? []) as ClasseAlunoMetricRow[];
  const alunoIds = metrics.map((row) => String(row.aluno_id)).filter(Boolean);
  if (!alunoIds.length) return [];

  const { data: alunosRows, error: alunosError } = await supabase
    .from("alunos")
    .select("id, nome")
    .in("id", alunoIds);
  if (alunosError) throw alunosError;

  const studentNames = new Map<string, string>(
    (alunosRows ?? []).map((row: any) => [String(row.id), String(row.nome ?? "Aluno")] as const)
  );

  const { data: eventosRows, error: eventosError } = await supabase
    .from("eventos_aluno")
    .select("aluno_id, tipo, referencia, valor")
    .in("aluno_id", alunoIds);
  if (eventosError) throw eventosError;

  const eventRefs = (eventosRows ?? []).map((row: any) => ({
    aluno_id: String(row.aluno_id),
    tipo: String(row.tipo ?? ""),
    referenciaId: normalizeReferenciaId(row.referencia),
    valor: Number(row.valor ?? 0),
  }));

  const topicIds = [
    ...new Set(
      eventRefs
        .filter((row) => isTipoLike(row.tipo, "topico") && row.referenciaId != null)
        .map((row) => Number(row.referenciaId))
    ),
  ];
  const contentIds = [
    ...new Set(
      eventRefs
        .filter((row) => isTipoLike(row.tipo, "conteudo") && row.referenciaId != null)
        .map((row) => Number(row.referenciaId))
    ),
  ];
  const activityIds = [
    ...new Set(
      eventRefs
        .filter((row) => isTipoLike(row.tipo, "atividade") && row.referenciaId != null)
        .map((row) => Number(row.referenciaId))
    ),
  ];

  const topicClassById = new Map<number, number>();
  if (topicIds.length) {
    const { data, error } = await supabase
      .from("topicos")
      .select("id, classe_id")
      .in("id", topicIds);
    if (error) throw error;
    (data ?? []).forEach((row: any) => {
      topicClassById.set(Number(row.id), Number(row.classe_id));
    });
  }

  const contentClassById = new Map<number, number>();
  if (contentIds.length) {
    const { data, error } = await supabase
      .from("conteudos")
      .select("id, topico_id")
      .in("id", contentIds);
    if (error) throw error;

    const missingTopicIds = [
      ...new Set(
        (data ?? [])
          .map((row: any) => Number(row.topico_id))
          .filter((id) => !topicClassById.has(id))
      ),
    ];

    if (missingTopicIds.length) {
      const { data: extraTopics, error: extraTopicsError } = await supabase
        .from("topicos")
        .select("id, classe_id")
        .in("id", missingTopicIds);
      if (extraTopicsError) throw extraTopicsError;
      (extraTopics ?? []).forEach((row: any) => {
        topicClassById.set(Number(row.id), Number(row.classe_id));
      });
    }

    (data ?? []).forEach((row: any) => {
      const topicoId = Number(row.topico_id);
      const classe = topicClassById.get(topicoId);
      if (classe != null) {
        contentClassById.set(Number(row.id), classe);
      }
    });
  }

  const activityClassById = new Map<number, number>();
  if (activityIds.length) {
    const { data, error } = await supabase
      .from("atividades")
      .select("id, topico_id")
      .in("id", activityIds);
    if (error) throw error;

    const missingTopicIds = [
      ...new Set(
        (data ?? [])
          .map((row: any) => Number(row.topico_id))
          .filter((id) => !topicClassById.has(id))
      ),
    ];

    if (missingTopicIds.length) {
      const { data: extraTopics, error: extraTopicsError } = await supabase
        .from("topicos")
        .select("id, classe_id")
        .in("id", missingTopicIds);
      if (extraTopicsError) throw extraTopicsError;
      (extraTopics ?? []).forEach((row: any) => {
        topicClassById.set(Number(row.id), Number(row.classe_id));
      });
    }

    (data ?? []).forEach((row: any) => {
      const topicoId = Number(row.topico_id);
      const classe = topicClassById.get(topicoId);
      if (classe != null) {
        activityClassById.set(Number(row.id), classe);
      }
    });
  }

  const scoreByAluno = new Map<string, number>();
  eventRefs.forEach((row) => {
    if (row.referenciaId == null) return;

    let eventClasseId: number | null = null;
    if (isTipoLike(row.tipo, "topico")) {
      eventClasseId = topicClassById.get(row.referenciaId) ?? null;
    } else if (isTipoLike(row.tipo, "conteudo")) {
      eventClasseId = contentClassById.get(row.referenciaId) ?? null;
    } else if (isTipoLike(row.tipo, "atividade")) {
      eventClasseId = activityClassById.get(row.referenciaId) ?? null;
    }

    if (eventClasseId !== classeId) return;

    scoreByAluno.set(row.aluno_id, (scoreByAluno.get(row.aluno_id) ?? 0) + row.valor);
  });

  return buildFallbackRankRows(classeId, infos, metrics, studentNames, scoreByAluno);
}

async function loadRankRowsByClasse(classeId: number, infos: RankInfo[]) {
  if (!infos.length) return [] as FallbackRankRow[];

  const { data, error } = await supabase
    .from("vw_rank_posicoes_por_classe")
    .select("*")
    .eq("classe_id", classeId)
    .order("rank_id", { ascending: true })
    .order("posicao", { ascending: true });

  if (error) {
    console.warn("[Rank] Falha ao consultar vw_rank_posicoes_por_classe, usando fallback:", error);
    return loadFallbackRankRowsByClasse(classeId, infos);
  }

  if (!data?.length && infos.length) {
    return loadFallbackRankRowsByClasse(classeId, infos);
  }

  return (data ?? []) as FallbackRankRow[];
}

export class RankDaClasse {
  public readonly info: RankInfo;
  public posicoes: RankPosicao[] = [];

  constructor(info: RankInfo) {
    this.info = info;
  }

  static async loadByRankId(rank_id: number): Promise<RankDaClasse> {
    const { data: infoRow, error: infoError } = await supabase
      .from("vw_ranks_info_por_classe")
      .select("*")
      .eq("rank_id", rank_id)
      .single();

    let info: RankInfo | null = null;
    if (!infoError && infoRow) {
      info = buildRankInfoFromRow(infoRow);
    } else {
      const { data: rankRow, error: rankError } = await supabase
        .from("ranks")
        .select("id, classe_id, nome, descricao, tipo_id, icone")
        .eq("id", rank_id)
        .maybeSingle();
      if (rankError) throw rankError;
      if (!rankRow) throw infoError ?? new Error("Rank não encontrado");

      let criterio: string | null = null;
      if (rankRow.tipo_id != null) {
        const { data: tipoRow } = await supabase
          .from("rank_tipo")
          .select("id, criterio")
          .eq("id", Number(rankRow.tipo_id))
          .maybeSingle();
        criterio = tipoRow?.criterio != null ? String(tipoRow.criterio) : null;
      }

      info = new RankInfo(
        Number(rankRow.id),
        Number(rankRow.classe_id),
        String(rankRow.nome ?? `Rank ${rankRow.id}`),
        rankRow.descricao ?? null,
        criterio,
        rankRow.icone != null ? String(rankRow.icone) : null
      );
    }

    const rows = await loadRankRowsByClasse(info.classe_id, [info]);
    const rank = new RankDaClasse(info);
    rank.posicoes = rows
      .filter((row) => Number(row.rank_id) === Number(rank_id))
      .map(buildRankPosicao);

    return rank;
  }

  async getPosicaoDoAluno(aluno_id: string): Promise<PosicaoDoAluno | null> {
    const existing = this.posicoes.find((row) => row.id_aluno === aluno_id);
    if (existing) {
      return buildPosicaoDoAluno(aluno_id, existing);
    }

    const rows = await loadRankRowsByClasse(this.info.classe_id, [this.info]);
    const fallback = rows.find(
      (row) => Number(row.rank_id) === Number(this.info.rank_id) && row.id_aluno === aluno_id
    );
    if (!fallback) return null;

    return new PosicaoDoAluno(
      fallback.rank_id,
      fallback.classe_id,
      aluno_id,
      fallback.posicao ?? null,
      fallback.pontuacao ?? null,
      fallback.progresso ?? null,
      fallback.medalha ?? null
    );
  }

  toJSON() {
    return {
      info: this.info,
      posicoes: this.posicoes,
    };
  }
}

export class ClasseRanking {
  public readonly classe_id: number;
  public ranks: RankDaClasse[] = [];

  private constructor(classe_id: number) {
    this.classe_id = classe_id;
  }

  static async listRankInfosByClasse(classe_id: number): Promise<RankInfo[]> {
    const normalizedClasseId = normalizeClasseId(classe_id);
    if (!normalizedClasseId) return [];

    const { data, error } = await supabase
      .from("vw_ranks_info_por_classe")
      .select("*")
      .eq("classe_id", normalizedClasseId);
    if (error) {
      console.warn("[Rank] Falha ao consultar vw_ranks_info_por_classe, usando fallback:", error);
      return loadFallbackRankInfosByClasse(normalizedClasseId);
    }

    const fromView = (data ?? []).map((row: any) => buildRankInfoFromRow(row));
    if (fromView.length) return fromView;

    return loadFallbackRankInfosByClasse(normalizedClasseId);
  }

  static async loadAllByClasse(classe_id: number): Promise<ClasseRanking> {
    const normalizedClasseId = normalizeClasseId(classe_id) ?? 0;
    const classe = new ClasseRanking(normalizedClasseId);
    if (!normalizedClasseId) {
      classe.ranks = [];
      return classe;
    }

    const infos = await ClasseRanking.listRankInfosByClasse(normalizedClasseId);
    const allRows = await loadRankRowsByClasse(normalizedClasseId, infos);

    classe.ranks = infos.map((info) => {
      const rank = new RankDaClasse(info);
      rank.posicoes = allRows
        .filter((row) => Number(row.rank_id) === Number(info.rank_id))
        .map(buildRankPosicao);
      return rank;
    });

    return classe;
  }

  async getPosicoesDoAluno(aluno_id: string): Promise<PosicaoDoAluno[]> {
    return this.ranks
      .map((rank) => {
        const row = rank.posicoes.find((item) => item.id_aluno === aluno_id);
        if (!row) return null;
        return buildPosicaoDoAluno(aluno_id, row);
      })
      .filter((row): row is PosicaoDoAluno => row != null);
  }

  toJSON() {
    return {
      classe_id: this.classe_id,
      ranks: this.ranks.map((rank) => rank.toJSON()),
    };
  }
}
