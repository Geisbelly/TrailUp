import type { ClasseResumo } from "@/models/ClasseResumo";

function pick(row: Record<string, any>, lowerName: string, camelName: string) {
  return row[lowerName] ?? row[camelName] ?? null;
}

/** Normaliza tanto views antigas (nomes minúsculos) quanto aliases camelCase do Postgres. */
export function mapClasseResumoRow(row: Record<string, any>): ClasseResumo {
  return {
    aluno_id: row.aluno_id,
    classe_id: row.classe_id,
    materia_nome: row.materia_nome ?? null,
    materia_descricao: row.materia_descricao ?? null,
    professor_nome: row.professor_nome ?? null,
    professor_descricao: row.professor_descricao ?? null,
    notaMedia: pick(row, "notamedia", "notaMedia"),
    tempoMedioPorAtividade: pick(row, "tempomedioporatividade", "tempoMedioPorAtividade"),
    acertosPercentual: pick(row, "acertospercentual", "acertosPercentual"),
    porcentagemConcluida: pick(row, "porcentagemconcluida", "porcentagemConcluida"),
    ultimaAtividade: pick(row, "ultimaatividade", "ultimaAtividade"),
    tempoGastoMin: pick(row, "tempogastomin", "tempoGastoMin"),
    isComplete: pick(row, "iscomplete", "isComplete"),
    atividadesConcluidas: pick(row, "atividadesconcluidas", "atividadesConcluidas"),
    recomendacaoTrilha: pick(row, "recomendacaotrilha", "recomendacaoTrilha"),
    modoOperacao: pick(row, "modooperacao", "modoOperacao"),
    insights: row.insights ?? null,
    perfisDetectados: pick(row, "perfisdetectados", "perfisDetectados"),
  };
}
