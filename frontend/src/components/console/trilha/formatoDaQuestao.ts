// Formato em que o editor mostra a QUESTÃO de uma atividade. O banco guarda o
// mesmo formato em vocabulários diferentes (`atividades.tipo`: quiz/true_false…,
// `questoes.tipo`: multipla/verdadeiro_falso…, e apelidos antigos); aqui tudo
// converge para o vocabulário de `atividades.tipo`. Era uma função solta dentro
// do TopicEditDrawer; extraída sem mudar o comportamento, para ser testável.

export type FormatoDaQuestao = "quiz" | "true_false" | "fill_blank" | "essay";

export function formatoDaQuestao(tipo: string | null | undefined): FormatoDaQuestao {
  const raw = (tipo || "").trim().toLowerCase();
  if (raw === "quiz" || raw === "multipla" || raw === "multipla_escolha") return "quiz";
  if (raw === "true_false" || raw === "verdadeiro_falso" || raw === "vf") return "true_false";
  if (raw === "fill_blank" || raw === "lacuna" || raw === "completar") return "fill_blank";
  // dissertativa/questao/texto e qualquer tipo desconhecido (inclui 'missao', que não é um formato de questão)
  return "essay";
}

/** Vocabulário de `questoes.tipo` para o mesmo formato. As duas colunas guardam o
 *  formato em palavras diferentes, então quem grava as duas precisa converter — não
 *  repetir o literal de `atividades.tipo` em `questoes.tipo`. */
export type TipoDaQuestao = "multipla" | "verdadeiro_falso" | "fill_blank" | "dissertativa";

export function tipoDaQuestaoDoFormato(formato: FormatoDaQuestao): TipoDaQuestao {
  if (formato === "quiz") return "multipla";
  if (formato === "true_false") return "verdadeiro_falso";
  if (formato === "fill_blank") return "fill_blank";
  return "dissertativa";
}
