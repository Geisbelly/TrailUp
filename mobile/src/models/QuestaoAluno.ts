import { supabase } from "@/database/supabase";

type RegistrarParams = {
  alunoId: string;
  atividadeId: number;
  questaoId: number;
  resposta: string;
  correta: boolean | null;
  acertos_percentual?: number;
  tempo_gasto_seg?: number;
};

export type QuestaoAlunoRow = {
  id?: number;
  aluno_id: string;
  questao_id: number;
  atividade_id: number;
  tentativa: number;
  resposta: string;
  correta: boolean | null;
  acertos_percentual: number | null;
  tempo_gasto_seg: number | null;
  criado_em?: string | null;
};

export class QuestaoAluno {
  /**
   * Registra a resposta do aluno na tabela questao_aluno, incrementando tentativa.
   * Retorna a linha persistida.
   */
  static async registrarResposta({
    alunoId,
    atividadeId,
    questaoId,
    resposta,
    correta,
    acertos_percentual = 0,
    tempo_gasto_seg,
  }: RegistrarParams): Promise<QuestaoAlunoRow> {
    // descobre a proxima tentativa
    const { data: tentativaRows, error: tentativaErr } = await supabase
      .from("questao_aluno")
      .select("tentativa")
      .eq("aluno_id", alunoId)
      .eq("questao_id", questaoId)
      .order("tentativa", { ascending: false })
      .limit(1);

    if (tentativaErr) throw tentativaErr;

    const nextTentativa =
      (tentativaRows?.[0]?.tentativa ? Number(tentativaRows[0].tentativa) : 0) + 1;

    const { data: insertedRow, error: upsertErr } = await supabase
      .from("questao_aluno")
      .upsert(
        {
          aluno_id: alunoId,
          questao_id: questaoId,
          atividade_id: atividadeId,
          tentativa: nextTentativa,
          resposta,
          correta,
          acertos_percentual,
          tempo_gasto_seg: tempo_gasto_seg ?? null,
        },
        { onConflict: "aluno_id,questao_id,tentativa" }
      )
      .select(
        "id, aluno_id, questao_id, atividade_id, tentativa, resposta, correta, acertos_percentual, tempo_gasto_seg, criado_em"
      )
      .single();

    if (upsertErr) throw upsertErr;
    return insertedRow as QuestaoAlunoRow;
  }

  /**
   * Busca a última tentativa por questão para um aluno.
   * Retorna um mapa questao_id -> registro mais recente.
   */
  static async buscarUltimasPorQuestoes(
    alunoId: string,
    questaoIds: number[]
  ): Promise<Record<number, QuestaoAlunoRow>> {
    if (!questaoIds.length) return {};

    const { data, error } = await supabase
      .from("questao_aluno")
      .select(
        "id, aluno_id, questao_id, atividade_id, tentativa, resposta, correta, acertos_percentual, tempo_gasto_seg, criado_em"
      )
      .eq("aluno_id", alunoId)
      .in("questao_id", questaoIds)
      .order("tentativa", { ascending: false });

    if (error) throw error;

    const latest: Record<number, QuestaoAlunoRow> = {};
    for (const row of data ?? []) {
      const qid = Number((row as any).questao_id);
      const tentativa = Number((row as any).tentativa ?? 1);
      if (!latest[qid] || tentativa > (latest[qid]?.tentativa ?? 0)) {
        latest[qid] = {
          id: (row as any).id,
          aluno_id: (row as any).aluno_id,
          questao_id: qid,
          atividade_id: Number((row as any).atividade_id),
          tentativa,
          resposta: (row as any).resposta,
          correta: (row as any).correta ?? null,
          acertos_percentual: (row as any).acertos_percentual ?? null,
          tempo_gasto_seg: (row as any).tempo_gasto_seg ?? null,
          criado_em: (row as any).criado_em ?? null,
        };
      }
    }

    return latest;
  }
}
