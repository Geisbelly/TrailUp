import type { ConquistaDaTurma } from "./conquistasApi";

/**
 * Enquanto o gatilho que concede conquistas não ler `conquistas.ativa` (migration 20261016_01,
 * "aviso importante"), desativar só tira a conquista da lista da turma. Quando o gatilho for
 * ajustado e conferido ao vivo, vira `true` e o texto passa a prometer o que o protótipo promete.
 */
export const GATILHO_RESPEITA_ATIVA = false;

export function rotuloDoTeto(total: number, teto: number): string {
  return `${total} de ${teto} conquistas desta turma`;
}

export function noTeto(total: number, teto: number): boolean {
  return total >= teto;
}

export type TextoDoDialogo = { titulo: string; pergunta: string; corpo: string; confirmar: string };

export function textoDeAlternar(c: Pick<ConquistaDaTurma, "nome" | "ativa" | "concedidas">, gatilhoRespeitaAtiva = GATILHO_RESPEITA_ATIVA): TextoDoDialogo {
  if (!c.ativa) {
    return {
      titulo: "Reativar conquista",
      pergunta: `Reativar “${c.nome}”?`,
      corpo: "Ela volta para a lista ativa da turma.",
      confirmar: "Reativar",
    };
  }
  const guarda =
    c.concedidas > 0
      ? `Quem já ganhou (${c.concedidas}) continua com ela na biblioteca.`
      : "Ninguém ganhou esta conquista ainda.";
  const efeito = gatilhoRespeitaAtiva
    ? "Ela deixa de ser avaliada para quem ainda não ganhou."
    : "Ela sai da lista ativa da turma. A avaliação automática ainda não respeita este estado: quem cumprir o critério ainda pode ganhá-la.";
  return {
    titulo: "Desativar conquista",
    pergunta: `Desativar “${c.nome}”?`,
    corpo: `${guarda} ${efeito} Não dá para excluir uma conquista: a posse dos alunos é preservada.`,
    confirmar: "Desativar",
  };
}
