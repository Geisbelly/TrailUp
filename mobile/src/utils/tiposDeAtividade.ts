/**
 * Tipos de atividade do lado do aluno, incluindo a missão.
 *
 * Espelha `frontend/src/lib/tiposDeAtividade.ts` e
 * `api/app/services/tipos_de_atividade.py` — três runtimes sem pacote
 * compartilhado, o mesmo arranjo que o repo já usa para a cor-assinatura dos
 * perfis BrainHex. Ao acrescentar um tipo, mexa nos três e no CHECK
 * `atividades_tipo_conhecido` (`20260911_07`).
 *
 * ## Missão é atividade, e é por isso que o app não precisou mudar para exibi-la
 *
 * `ActivityRenderer` resolve o componente por um registro e cai em
 * `QuestionActivity` quando o tipo é desconhecido MAS há questões. Missão com
 * itens já caía certo antes da feature existir. O que esta função acrescenta é
 * tornar essa decisão explícita e testável — e cobrir a missão **sem** itens,
 * que pelo caminho antigo não renderizava nada.
 */

export type TipoDeRenderizacao = "questao" | "video" | "texto" | "nada";

export const TIPO_DE_MISSAO = "missao";

const APELIDOS: Record<string, string> = {
  quiz: "quiz",
  multipla: "quiz",
  multipla_escolha: "quiz",
  questao: "quiz",
  true_false: "true_false",
  truefalse: "true_false",
  verdadeiro_falso: "true_false",
  vf: "true_false",
  fill_blank: "fill_blank",
  lacuna: "fill_blank",
  completar: "fill_blank",
  essay: "essay",
  dissertativa: "essay",
  aberta: "essay",
  ensaio: "essay",
  missao: "missao",
  mission: "missao",
  video: "video",
  texto: "texto",
};

export function normalizarTipoDeAtividade(valor: unknown): string {
  const bruto = String(valor ?? "").trim().toLowerCase();
  if (!bruto) return "quiz";
  return APELIDOS[bruto] ?? bruto;
}

export function ehMissao(valor: unknown): boolean {
  return normalizarTipoDeAtividade(valor) === TIPO_DE_MISSAO;
}

/**
 * Qual família de componente renderiza esta atividade.
 *
 * `"nada"` é resposta legítima: uma atividade de tipo desconhecido e sem
 * questões não tem o que mostrar, e inventar um componente seria pior. A
 * MISSÃO é a exceção — ela renderiza como questão mesmo sem itens, porque o
 * enunciado dela é a tarefa, e uma missão em branco na tela pareceria um
 * defeito do app.
 */
export function resolverTipoDeRenderizacao(
  tipo: unknown,
  temQuestoes: boolean,
): TipoDeRenderizacao {
  const normalizado = normalizarTipoDeAtividade(tipo);

  if (normalizado === "video") return "video";
  if (normalizado === "texto") return "texto";
  if (normalizado === TIPO_DE_MISSAO) return "questao";
  if (["quiz", "true_false", "fill_blank", "essay"].includes(normalizado)) {
    return "questao";
  }

  return temQuestoes ? "questao" : "nada";
}

/** Rótulo curto para a tela do aluno. */
export function rotularTipoDeAtividade(valor: unknown): string {
  const normalizado = normalizarTipoDeAtividade(valor);
  if (normalizado === TIPO_DE_MISSAO) return "Missão";
  if (normalizado === "quiz") return "Quiz";
  if (normalizado === "true_false") return "Verdadeiro ou falso";
  if (normalizado === "fill_blank") return "Completar";
  if (normalizado === "essay") return "Dissertação";
  if (normalizado === "video") return "Vídeo";
  if (normalizado === "texto") return "Leitura";
  return "Atividade";
}
