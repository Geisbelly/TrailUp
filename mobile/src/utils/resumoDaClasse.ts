import type { ClasseResumo } from "@/models/ClasseResumo";

/**
 * Lê uma linha de `vw_aluno_classe_resumo`.
 *
 * Existe por um defeito de uma letra. `mapResumoRow` lia **tudo em minúsculo**
 * (`row.porcentagemconcluida`), e a view expõe **camelCase**
 * (`porcentagemConcluida`) — porque ela seleciona as colunas de `classe_aluno`
 * sem apelidar, e lá elas são citadas. O PostgREST devolve a chave como ela é.
 *
 * Resultado: **11 das 18 colunas nunca chegavam ao app.** `porcentagemConcluida`
 * era sempre `null`, e a trilha e as métricas caíam cada uma na sua fórmula
 * local — que são diferentes. Era essa a divergência entre as duas telas, e ela
 * sobreviveu à correção que fez "o banco ganhar" no cálculo: o valor do banco
 * nunca chegava para ganhar.
 *
 * Medido em produção, classe 32: a view diz `porcentagemConcluida = 75.00` e
 * `tempoGastoMin = 2.17`; o app lia `undefined` nos dois.
 *
 * Aceita as duas grafias de propósito. O `CLAUDE.md` registra que
 * `classe_aluno` existe em dois dialetos neste projeto (camelCase e minúsculo),
 * e `trailup_recalcular_classe_aluno` descobre qual está presente antes de
 * gravar. Ler só um dos dois seria trocar um ambiente quebrado pelo outro.
 */

/** Nomes possíveis de cada campo, na ordem de preferência. */
const GRAFIAS = {
  notaMedia: ["notaMedia", "notamedia"],
  tempoMedioPorAtividade: ["tempoMedioPorAtividade", "tempomedioporatividade"],
  acertosPercentual: ["acertosPercentual", "acertospercentual"],
  porcentagemConcluida: ["porcentagemConcluida", "porcentagemconcluida"],
  ultimaAtividade: ["ultimaAtividade", "ultimaatividade"],
  tempoGastoMin: ["tempoGastoMin", "tempogastomin"],
  isComplete: ["isComplete", "iscomplete"],
  atividadesConcluidas: ["atividadesConcluidas", "atividadesconcluidas"],
  recomendacaoTrilha: ["recomendacaoTrilha", "recomendacaotrilha"],
  modoOperacao: ["modoOperacao", "modooperacao"],
  perfisDetectados: ["perfisDetectados", "perfisdetectados"],
} as const;

type CampoComGrafias = keyof typeof GRAFIAS;

/**
 * O primeiro valor presente entre as grafias do campo.
 *
 * Distingue ausente de nulo: `notaMedia` vem `null` de verdade no banco, e
 * tratar isso como "tenta a outra grafia" esconderia o dado ausente atrás de
 * uma busca que nunca acha nada.
 */
export function lerCampo(row: Record<string, unknown> | null, campo: CampoComGrafias): unknown {
  if (!row) return undefined;
  for (const grafia of GRAFIAS[campo]) {
    if (grafia in row) return row[grafia];
  }
  return undefined;
}

function numero(valor: unknown): number | null {
  if (valor == null) return null;
  const n = Number(valor);
  return Number.isFinite(n) ? n : null;
}

function texto(valor: unknown): string | null {
  if (valor == null) return null;
  return String(valor);
}

export function mapearResumoDaClasse(row: Record<string, unknown> | null): ClasseResumo | null {
  if (!row) return null;

  return {
    aluno_id: String(row.aluno_id ?? ""),
    classe_id: Number(row.classe_id),
    materia_nome: texto(row.materia_nome),
    materia_descricao: texto(row.materia_descricao),
    professor_nome: texto(row.professor_nome),
    professor_descricao: texto(row.professor_descricao),
    // `numeric` do Postgres chega como STRING no PostgREST: `"75.00"`. Sem a
    // conversão, `porcentagemConcluida` seria `"75.00"` e qualquer comparação
    // numérica (`>= 100`, `Math.min`) daria resultado silenciosamente errado.
    notaMedia: numero(lerCampo(row, "notaMedia")),
    tempoMedioPorAtividade: numero(lerCampo(row, "tempoMedioPorAtividade")),
    acertosPercentual: numero(lerCampo(row, "acertosPercentual")),
    porcentagemConcluida: numero(lerCampo(row, "porcentagemConcluida")),
    ultimaAtividade: numero(lerCampo(row, "ultimaAtividade")),
    tempoGastoMin: numero(lerCampo(row, "tempoGastoMin")),
    isComplete: (lerCampo(row, "isComplete") ?? null) as boolean | null,
    atividadesConcluidas: lerCampo(row, "atividadesConcluidas") ?? null,
    recomendacaoTrilha: texto(lerCampo(row, "recomendacaoTrilha")),
    modoOperacao: texto(lerCampo(row, "modoOperacao")),
    insights: row.insights ?? null,
    perfisDetectados: lerCampo(row, "perfisDetectados") ?? null,
  };
}
