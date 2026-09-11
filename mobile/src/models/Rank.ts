import { supabase } from "@/database/supabase";
import { PosicaoDoAluno } from "./RankAlunoPosicao";
import { RankInfo } from "./RankInfo";
import { RankPosicao } from "./RankPosicao";

function normalizeClasseId(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

type LinhaDoRank = {
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
    row.percentual_do_lider != null ? Number(row.percentual_do_lider) : null,
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
    row.percentualDoLider ?? null,
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

/**
 * A view é a ÚNICA autoridade sobre posição, pontuação e medalha.
 *
 * Havia um segundo cálculo aqui: se a consulta falhasse -- ou se voltasse
 * VAZIA --, o app remontava o ranking inteiro em TypeScript, lendo
 * `classe_aluno`, `alunos` e `eventos_aluno` crus. Ele não produzia os mesmos
 * números, e por três motivos independentes:
 *
 * 1. **Ignorava o corte.** `vw_rank_posicoes_por_classe` mostra até
 *    `app_rank_limite_visivel()`, mais a própria linha do aluno. O cálculo
 *    local devolvia a turma inteira, sempre.
 * 2. **Deduzia a classe do evento por `referencia`.** É exatamente o que a
 *    `20260910_06` tirou do banco: conteúdo regerado apaga a atividade
 *    referenciada e a pontuação some retroativamente -- 66 ids órfãos e 160
 *    pontos medidos em produção. A coluna `eventos_aluno.classe_id` existe e
 *    congela justamente para isso, e o cálculo local não a lia.
 * 3. **`percentual_do_lider` era outra conta**, sobre o máximo das linhas que
 *    o cliente tivesse em mãos.
 *
 * E o gatilho mais comum não era nem a falha: `!data?.length` também
 * disparava. Resultado vazio é uma resposta LEGÍTIMA da view -- é o que ela
 * devolve para quem não está na classe --, então o caminho normal do rank
 * passava pelo recálculo.
 *
 * Sem alternativa: se a view falha, a lista vem vazia e a tela diz que não
 * conseguiu carregar. Um ranking inventado é pior do que um ranking ausente,
 * porque o aluno não tem como saber que está olhando outro número.
 */
async function loadRankRowsByClasse(classeId: number, infos: RankInfo[]) {
  if (!infos.length) return [] as LinhaDoRank[];

  const { data, error } = await supabase
    .from("vw_rank_posicoes_por_classe")
    .select("*")
    .eq("classe_id", classeId)
    .order("rank_id", { ascending: true })
    .order("posicao", { ascending: true });

  if (error) {
    console.warn("[Rank] Falha ao consultar vw_rank_posicoes_por_classe:", error);
    return [] as LinhaDoRank[];
  }

  return (data ?? []) as LinhaDoRank[];
}

export class RankDaClasse {
  public readonly info: RankInfo;
  public posicoes: RankPosicao[] = [];

  constructor(info: RankInfo) {
    this.info = info;
  }

  /**
   * O nome, a descrição e o ícone do rank vêm de `rank_tipo`, e a view é quem
   * faz essa junção.
   *
   * Havia um caminho alternativo aqui que lia `ranks` direto pedindo
   * `nome, descricao, icone` -- colunas que essa tabela NÃO tem (ela é
   * `id, tipo_id, classe_id, periodo, created_at`). Ou seja: sempre que ele
   * era acionado, estourava com 42703 em vez de salvar a leitura. E ele ainda
   * daria rótulos diferentes dos da view se as colunas existissem, porque a
   * view lê os de `rank_tipo`.
   */
  static async loadByRankId(rank_id: number): Promise<RankDaClasse> {
    const { data: infoRow, error: infoError } = await supabase
      .from("vw_ranks_info_por_classe")
      .select("*")
      .eq("rank_id", rank_id)
      .single();

    if (infoError) throw infoError;
    if (!infoRow) throw new Error("Rank não encontrado");

    const info = buildRankInfoFromRow(infoRow);

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
    const linha = rows.find(
      (row) => Number(row.rank_id) === Number(this.info.rank_id) && row.id_aluno === aluno_id
    );
    if (!linha) return null;

    return new PosicaoDoAluno(
      linha.rank_id,
      linha.classe_id,
      aluno_id,
      linha.posicao ?? null,
      linha.pontuacao ?? null,
      linha.percentual_do_lider ?? null,
      linha.medalha ?? null
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
      console.warn("[Rank] Falha ao consultar vw_ranks_info_por_classe:", error);
      return [];
    }

    // Lista vazia é uma resposta legítima: a classe pode não ter rank
    // configurado. Antes isso caía num segundo caminho que lia `ranks` pedindo
    // colunas inexistentes e estourava -- ou seja, o caso normal virava erro.
    return (data ?? []).map((row: any) => buildRankInfoFromRow(row));
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
