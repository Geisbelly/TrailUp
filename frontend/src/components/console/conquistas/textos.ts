import type { ConquistaDaTurma } from "./conquistasApi";
import type { FormularioDeConquista } from "./formulario";

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

type CriterioDoFormulario = Pick<FormularioDeConquista, "metrica" | "limiar">;

const normalizarLimiar = (texto: string) => texto.trim().toLowerCase().replace(",", ".");

/** Métrica ou limiar diferente do que veio do banco. Ícone, cor, nome e pontos não são critério. */
export function criterioMudou(inicial: CriterioDoFormulario, atual: CriterioDoFormulario): boolean {
  return inicial.metrica !== atual.metrica || normalizarLimiar(inicial.limiar) !== normalizarLimiar(atual.limiar);
}

/** Confirmação antes de salvar um critério novo numa conquista que já existe (#158). */
export function textoDeMudancaDeCriterio(nome: string, concedidas: number): TextoDoDialogo {
  const guarda =
    concedidas > 0
      ? `Quem já ganhou (${concedidas}) continua com ela: a concessão nunca é revogada. O critério novo vale só para quem ainda não ganhou.`
      : "Ninguém ganhou esta conquista ainda. O critério novo passa a valer na próxima avaliação.";
  return {
    titulo: "Alterar o critério",
    pergunta: `Salvar o critério novo de “${nome.trim()}”?`,
    corpo: `${guarda} A troca fica registrada no histórico da conquista, com a data e quem alterou.`,
    confirmar: "Salvar critério novo",
  };
}
