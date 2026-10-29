import { supabase } from "@/database/supabase";
import { loadRankMetadata } from "@/services/rankMetadata";
import { progressoDaLinha } from "@/utils/rankProgresso";
import { PosicaoDoAluno } from "./RankAlunoPosicao";
import { RankInfo } from "./RankInfo";
import { RankPosicao } from "./RankPosicao";

function normalizeClasseId(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

type RankRow = {
  rank_id: number;
  classe_id: number;
  posicao: number;
  id_aluno: string;
  nome_aluno: string;
  pontuacao: number;
  percentual_do_lider: number | null;
  medalha: string | null;
};

function buildRankPosicao(row: any) {
  return new RankPosicao(
    Number(row.rank_id),
    Number(row.classe_id),
    row.posicao != null ? Number(row.posicao) : null,
    String(row.id_aluno),
    String(row.nome_aluno ?? "Aluno"),
    row.pontuacao != null ? Number(row.pontuacao) : null,
    // A view entrega `percentual_do_lider` (#155).
    progressoDaLinha(row),
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
  const rows = await loadRankMetadata(supabase, { classeId });
  return rows.map(buildRankInfoFromRow);
}

async function loadRankRowsByClasse(classeId: number, infos: RankInfo[]) {
  if (!infos.length) return [] as RankRow[];

  const { data, error } = await supabase
    .from("vw_rank_posicoes_por_classe")
    .select("*")
    .eq("classe_id", classeId)
    .order("rank_id", { ascending: true })
    .order("posicao", { ascending: true });

  // Erro propaga: nao ha ranking de reserva. Recalcular aqui lendo `eventos_aluno` dos
  // colegas expunha a turma inteira; view vazia e' ranking vazio, e erro e' erro.
  if (error) throw error;

  return (data ?? []) as RankRow[];
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
      const [rankRow] = await loadRankMetadata(supabase, { rankId: rank_id });
      if (!rankRow) throw infoError ?? new Error("Rank não encontrado");
      info = buildRankInfoFromRow(rankRow);
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
    const daView = rows.find(
      (row) => Number(row.rank_id) === Number(this.info.rank_id) && row.id_aluno === aluno_id
    );
    if (!daView) return null;

    return new PosicaoDoAluno(
      daView.rank_id,
      daView.classe_id,
      aluno_id,
      daView.posicao ?? null,
      daView.pontuacao ?? null,
      progressoDaLinha(daView),
      daView.medalha ?? null
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
