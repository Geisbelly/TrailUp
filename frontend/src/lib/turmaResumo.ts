// Resumo das métricas de turma no escopo selecionado (uma ou várias classes).
//
// - Contagens (alunos inativos, parados, evadidos, sem dado, em risco alto) somam.
// - Médias e taxas ponderam pelo denominador de cada linha: alunos para conclusão, nota, acertos e
//   tempo; semanas elegíveis para o retorno semanal. Uma média simples entre classes distorce quando
//   os tamanhos diferem (uma classe de 50 alunos com 10% e outra de 5 com 90% dariam 50%, quando o
//   valor por aluno é ~17%).
// - Linha sem o dado (null) não entra na média: "sem dado" ≠ 0. Sem nenhuma linha com dado, o
//   resumo daquela métrica é null.

export type TurmaResumoRow = {
  total_alunos: number;
  taxa_risco_abandono_pct: number | null;
  alunos_risco_alto: number;
  alunos_risco_com_dado: number;
  tempo_medio_uso_seg: number | null;
  taxa_media_conclusao_pct: number | null;
  media_nota_turma: number | null;
  taxa_media_acertos_pct: number | null;
  tempo_ativo_medio_seg: number | null;
  uso_chat_apos_erro_pct: number | null;
  retorno_semanal_pct: number | null;
  retorno_semanal_elegiveis: number;
  alunos_inativos: number;
  alunos_estagnados: number;
  alunos_evadidos: number;
  alunos_sem_dado: number;
};

const MEDIAS_POR_ALUNO = [
  "taxa_media_conclusao_pct",
  "media_nota_turma",
  "taxa_media_acertos_pct",
  "tempo_ativo_medio_seg",
  "tempo_medio_uso_seg",
  "uso_chat_apos_erro_pct",
] as const satisfies readonly (keyof TurmaResumoRow)[];

const CONTAGENS = [
  "total_alunos",
  "alunos_inativos",
  "alunos_estagnados",
  "alunos_evadidos",
  "alunos_sem_dado",
  "alunos_risco_alto",
  "alunos_risco_com_dado",
] as const;

export type TurmaResumo = Record<(typeof MEDIAS_POR_ALUNO)[number] | "retorno_semanal_pct" | "taxa_risco_abandono_pct", number | null> &
  Record<(typeof CONTAGENS)[number] | "retorno_semanal_elegiveis", number>;

const numero = (v: unknown): number | null => (v === null || v === undefined || Number.isNaN(Number(v)) ? null : Number(v));

function mediaPonderada(rows: TurmaResumoRow[], valor: (r: TurmaResumoRow) => number | null, peso: (r: TurmaResumoRow) => number) {
  let soma = 0;
  let pesos = 0;
  let somaSimples = 0;
  let n = 0;
  for (const r of rows) {
    const v = valor(r);
    if (v === null) continue;
    soma += v * peso(r);
    pesos += peso(r);
    somaSimples += v;
    n += 1;
  }
  if (n === 0) return null;
  // Sem peso para ponderar (todas as linhas com 0): média simples em vez de dividir por zero.
  return pesos > 0 ? soma / pesos : somaSimples / n;
}

export function computeTurmaResumo(rows: TurmaResumoRow[]): TurmaResumo {
  const resumo = {} as TurmaResumo;
  for (const chave of CONTAGENS) resumo[chave] = rows.reduce((s, r) => s + (numero(r[chave]) ?? 0), 0);
  resumo.retorno_semanal_elegiveis = rows.reduce((s, r) => s + (numero(r.retorno_semanal_elegiveis) ?? 0), 0);
  for (const chave of MEDIAS_POR_ALUNO) {
    resumo[chave] = mediaPonderada(rows, (r) => numero(r[chave]), (r) => numero(r.total_alunos) ?? 0);
  }
  // Taxa de abandono: pondera pelos alunos com dado (o denominador da taxa), não pelo total.
  resumo.taxa_risco_abandono_pct = mediaPonderada(
    rows,
    (r) => numero(r.taxa_risco_abandono_pct),
    (r) => numero(r.alunos_risco_com_dado) ?? 0,
  );
  resumo.retorno_semanal_pct = mediaPonderada(
    rows,
    (r) => numero(r.retorno_semanal_pct),
    (r) => numero(r.retorno_semanal_elegiveis) ?? 0,
  );
  return resumo;
}
