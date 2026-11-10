// O que a edge lê do pedido e devolve ao aluno (spec B, PR 2). Puro, para o vitest do frontend.

import type { Conferencia } from "./conferir.ts";

export const LIMITE_DA_RESPOSTA = 500;

/** `questaoId` do corpo: inteiro positivo, ou null. */
export function lerQuestaoId(valor: unknown): number | null {
  const numero = typeof valor === "string" && valor.trim() !== "" ? Number(valor) : valor;
  return typeof numero === "number" && Number.isSafeInteger(numero) && numero > 0 ? numero : null;
}

/** Segundos na questão, como as RPCs aceitam: inteiro de 0 a 3600, ou null. */
export function lerTempo(valor: unknown): number | null {
  const numero = Number(valor);
  if (valor === null || valor === undefined || !Number.isFinite(numero)) return null;
  return Math.min(3600, Math.max(0, Math.round(numero)));
}

/** A resposta do aluno, ou null quando vazia ou longa demais. */
export function lerResposta(valor: unknown): string | null {
  if (typeof valor !== "string") return null;
  const texto = valor.trim();
  return texto && texto.length <= LIMITE_DA_RESPOSTA ? texto : null;
}

// As exceções das RPCs (`RAISE EXCEPTION '<codigo>'`) viram status HTTP, como na edge da
// dissertativa. `prazo_expirado` o app já traduz.
const STATUS_DO_ERRO: Record<string, number> = {
  questao_sem_sessao: 401,
  questao_sem_permissao: 403,
  questao_inexistente: 404,
  questao_nao_conferida_no_servidor: 400,
  prazo_expirado: 409,
};

export function respostaDoErroDaRpc(mensagem: unknown): { status: number; error: string } {
  const texto = typeof mensagem === "string" ? mensagem : "";
  for (const [codigo, status] of Object.entries(STATUS_DO_ERRO)) {
    if (texto.includes(codigo)) return { status, error: codigo };
  }
  return { status: 500, error: "falha_no_banco" };
}

/**
 * O que sai para o aluno: o resultado da conferência e o que `questao_registrar_correcao_servidor`
 * decidiu (pontuação, tentativa). A esperada só vai junto quando o banco a liberou.
 */
export function respostaAoAluno(conferencia: Conferencia, registroBruto: unknown): Record<string, unknown> {
  const registro =
    registroBruto && typeof registroBruto === "object" ? (registroBruto as Record<string, unknown>) : {};
  const liberado = registro.gabarito_liberado === true;
  return {
    correta: registro.correta === true,
    acertos_percentual: typeof registro.acertos_percentual === "number" ? registro.acertos_percentual : 0,
    regra: typeof registro.regra === "string" ? registro.regra : null,
    tentativa: typeof registro.tentativa === "number" ? registro.tentativa : null,
    erros: typeof registro.erros === "number" ? registro.erros : null,
    ...(conferencia.motivo ? { motivo: conferencia.motivo } : {}),
    gabarito_liberado: liberado,
    ...(liberado && typeof registro.resposta_correta === "string"
      ? { resposta_correta: registro.resposta_correta }
      : {}),
  };
}
