// Dificuldade da questão — o vocabulário desta lista espelha o CHECK de
// `questoes_dificuldade_check` (`20261021_10`). Nível fora dele é recusado pelo banco.
//
// O banco usa a dificuldade como PREFERÊNCIA na escolha das questões do desafio difícil,
// nunca como filtro: questão no nível pedido (ou acima) vem primeiro, o resto entra se
// faltar. Então deixar de marcar não quebra nada — só não ajuda.

export type NivelDaQuestao = "facil" | "media" | "dificil";

export const NIVEIS_DA_QUESTAO: { chave: NivelDaQuestao; rotulo: string }[] = [
  { chave: "facil", rotulo: "Fácil" },
  { chave: "media", rotulo: "Média" },
  { chave: "dificil", rotulo: "Difícil" },
];

/** O que o `<select>` usa para "não marcada". Vazio, nunca um nível inventado. */
export const SEM_NIVEL = "";

/**
 * Do formulário para o banco. **`""` tem de virar `null`**, não `""`: a coluna aceita
 * `NULL` ("não marcada") ou um dos três níveis, e `''` viola o CHECK — erro em tempo de
 * execução, na cara do professor, ao salvar.
 *
 * Nível desconhecido também vira `null` em vez de ser enviado: é o mesmo CHECK, e aceitar
 * silenciosamente o que o banco vai recusar só adia o erro.
 */
export function nivelParaOBanco(valor: string | null | undefined): NivelDaQuestao | null {
  const limpo = (valor ?? "").trim().toLowerCase();
  return NIVEIS_DA_QUESTAO.some((n) => n.chave === limpo) ? (limpo as NivelDaQuestao) : null;
}

/** Do banco para o formulário. `null` é "não marcada", e continua vazio no `<select>`. */
export function nivelParaOFormulario(valor: string | null | undefined): string {
  return nivelParaOBanco(valor) ?? SEM_NIVEL;
}

/** Rótulo para listas e resumos. "Não marcada" é informação, não ausência de informação. */
export function rotuloDoNivel(valor: string | null | undefined): string {
  const nivel = nivelParaOBanco(valor);
  return nivel ? NIVEIS_DA_QUESTAO.find((n) => n.chave === nivel)!.rotulo : "Não marcada";
}
