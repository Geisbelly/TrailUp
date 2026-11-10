/**
 * Questão corrigida no servidor (spec B, `20261110_02`): numérica e expressão pela edge
 * `questao-conferir-resposta` (mathjs, sem IA), código pela `validate-essay-answer-ai`. A RPC
 * `questao_responder` recusa os três tipos, então **não há caminho de reserva**: se a edge falhar, a
 * resposta não foi gravada e o aluno precisa saber disso.
 *
 * Puro: o `invoke` mora em `questaoNoBanco.ts`.
 */

import { mensagemDaRecusa } from "./tentativasAtividade.core";
import { lerRespostaCorrigida, type RespostaCorrigida } from "./questaoNoBanco.core";

export type MotivoDaConferencia = "unidade_incompativel" | "expressao_invalida";

export type Conferida = RespostaCorrigida & { motivo: MotivoDaConferencia | null };

const MOTIVOS: readonly MotivoDaConferencia[] = ["unidade_incompativel", "expressao_invalida"];

/** O corpo de sucesso da edge: o registro do banco e, às vezes, por que a resposta não bateu. */
export function lerConferencia(bruto: unknown): Conferida {
  const motivo = (bruto as { motivo?: unknown } | null)?.motivo;
  return {
    ...lerRespostaCorrigida(bruto),
    motivo: MOTIVOS.includes(motivo as MotivoDaConferencia) ? (motivo as MotivoDaConferencia) : null,
  };
}

/** Por que a resposta não bateu, quando a edge sabe. É dica de forma, não o gabarito. */
export function textoDoMotivo(motivo: MotivoDaConferencia | null): string | null {
  if (motivo === "unidade_incompativel") return "A unidade da sua resposta não é da grandeza que a questão pede.";
  if (motivo === "expressao_invalida")
    return "Não deu para ler a sua expressão. Confira parênteses e chaves, e use os símbolos da barra.";
  return null;
}

/**
 * O código de erro que a edge mandou no corpo (`{ error: "<codigo>" }`). O `supabase-js` entrega o
 * erro HTTP com a `Response` em `context`; erro de rede não tem corpo e dá `null`.
 */
export async function codigoDoErroDaEdge(erro: unknown): Promise<string | null> {
  const contexto = (erro as { context?: unknown } | null)?.context as
    | { clone?: () => { json: () => Promise<unknown> }; json?: () => Promise<unknown> }
    | undefined;
  if (!contexto) return null;
  try {
    const corpo = await (typeof contexto.clone === "function" ? contexto.clone().json() : contexto.json?.());
    const codigo = (corpo as { error?: unknown } | null)?.error;
    return typeof codigo === "string" && codigo ? codigo : null;
  } catch {
    return null;
  }
}

type Mensagem = { titulo: string; descricao: string };

const MENSAGENS: Record<string, Mensagem> = {
  questao_inexistente: {
    titulo: "Questão não encontrada",
    descricao: "Esta questão foi removida ou mudou. Volte à trilha e abra a atividade de novo.",
  },
  questao_nao_conferida_no_servidor: {
    titulo: "A questão mudou",
    descricao: "O professor mudou esta questão. Volte à trilha e abra a atividade de novo.",
  },
  questao_sem_permissao: {
    titulo: "Fora da turma",
    descricao: "Esta questão é de uma turma em que você não está matriculado.",
  },
  gabarito_invalido: {
    titulo: "Questão com problema",
    descricao:
      "O gabarito desta questão está com problema, então ela não pôde ser conferida. Sua tentativa não foi gasta. Avise o professor.",
  },
  ia_indisponivel: {
    titulo: "Correção indisponível",
    descricao:
      "A correção de código usa a IA, que não está disponível para a sua conta. Sua resposta não foi salva. Avise o professor.",
  },
};

/**
 * O texto do modal para uma recusa da edge, ou `null` quando não é recusa (rede, erro inesperado):
 * aí vale `mensagemDaFalhaNoEnvio`. `prazo_expirado` e a sessão já têm texto em
 * `mensagemDaRecusa`, igual ao das outras questões.
 */
export function mensagemDoErroDaEdge(codigo: string | null): Mensagem | null {
  if (!codigo) return null;
  if (MENSAGENS[codigo]) return MENSAGENS[codigo];
  if (codigo === "unauthorized" || codigo === "questao_sem_sessao") return mensagemDaRecusa({ message: "sem_sessao" });
  return mensagemDaRecusa({ message: codigo });
}
