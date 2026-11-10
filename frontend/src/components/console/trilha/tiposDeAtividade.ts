// Lista ÚNICA dos tipos de atividade do console (issue #150).
//
// `atividades.tipo` é `text` livre no banco — sem CHECK, sem enum — então nada
// impede um typo de entrar. Esta lista é a que o console aceita; comparar tipo
// com string solta espalhada pelo código é o que a issue pede para acabar.

export const TIPOS_DE_ATIVIDADE = [
  "quiz",
  "true_false",
  "fill_blank",
  "essay",
  // Spec B (`20261110_02`): corrigidos no servidor, com o gabarito só em `questao_gabarito`.
  "code",
  "numeric",
  "expression",
  "missao",
] as const;

export type TipoDeAtividade = (typeof TIPOS_DE_ATIVIDADE)[number];

export const ROTULO_DO_TIPO: Record<TipoDeAtividade, string> = {
  quiz: "Múltipla escolha",
  true_false: "Verdadeiro/Falso",
  fill_blank: "Completar",
  essay: "Dissertação",
  code: "Código",
  numeric: "Numérica",
  expression: "Expressão",
  missao: "Missão",
};

/** Os formatos que o editor oferece para uma questão: todos menos missão. */
export const TIPOS_DE_QUESTAO = TIPOS_DE_ATIVIDADE.filter(
  (t): t is Exclude<TipoDeAtividade, "missao"> => t !== "missao",
);

export function ehTipoDeAtividade(valor: unknown): valor is TipoDeAtividade {
  return typeof valor === "string" && (TIPOS_DE_ATIVIDADE as readonly string[]).includes(valor);
}

/** Missão é uma atividade com `tipo = 'missao'` — nenhuma tabela própria (decisão da #150). */
export function ehMissao(tipo: string | null | undefined): boolean {
  return tipo === "missao";
}
