// Resumo agregado das métricas de turma no escopo selecionado (uma ou várias
// classes). Pondera cada métrica por `total_alunos` da linha — uma média
// simples entre classes distorce fortemente quando os tamanhos das turmas
// são muito diferentes (ex.: uma classe de 50 alunos com 10% de abandono e
// outra de 5 alunos com 90% dariam 50% de média simples, quando o valor
// real ponderado por aluno é ~17%).

export type TurmaResumoRow = {
  total_alunos: number;
  taxa_media_abandono_pct: number;
  taxa_media_conclusao_pct: number;
  media_nota_turma: number;
  taxa_media_acertos_pct: number;
  tempo_medio_uso_seg: number;
  uso_chat_apos_erro_pct: number;
};

const METRIC_KEYS = [
  "taxa_media_abandono_pct",
  "taxa_media_conclusao_pct",
  "media_nota_turma",
  "taxa_media_acertos_pct",
  "tempo_medio_uso_seg",
  "uso_chat_apos_erro_pct",
] as const satisfies readonly (keyof TurmaResumoRow)[];

export type TurmaResumo = Pick<TurmaResumoRow, (typeof METRIC_KEYS)[number]>;

const EMPTY_RESUMO: TurmaResumo = {
  taxa_media_abandono_pct: 0,
  taxa_media_conclusao_pct: 0,
  media_nota_turma: 0,
  taxa_media_acertos_pct: 0,
  tempo_medio_uso_seg: 0,
  uso_chat_apos_erro_pct: 0,
};

export function computeTurmaResumo(rows: TurmaResumoRow[]): TurmaResumo {
  if (!rows.length) return { ...EMPTY_RESUMO };

  const totalAlunos = rows.reduce((sum, row) => sum + Number(row.total_alunos ?? 0), 0);
  // Sem alunos para ponderar (ex.: todas as classes do escopo com 0 alunos):
  // cai para média simples em vez de dividir por zero.
  const weight = (row: TurmaResumoRow) =>
    totalAlunos > 0 ? Number(row.total_alunos ?? 0) : 1;
  const totalWeight = totalAlunos > 0 ? totalAlunos : rows.length;

  const resumo = { ...EMPTY_RESUMO };
  for (const key of METRIC_KEYS) {
    const weightedSum = rows.reduce(
      (sum, row) => sum + Number(row[key] ?? 0) * weight(row),
      0
    );
    resumo[key] = weightedSum / totalWeight;
  }
  return resumo;
}
