import type { ConquistaDaTurma } from "./conquistasApi";

/**
 * O gatilho que concede conquistas passou a ler `conquistas.ativa` (migration 20261017_06). Se a migration
 * ainda não foi aplicada no banco, volte para `false`: o texto deixa de prometer o que o banco não faz.
 */
export const GATILHO_RESPEITA_ATIVA = true;

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
