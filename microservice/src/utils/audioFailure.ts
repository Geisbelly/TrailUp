// Por que o audio de um material nao saiu.
//
// Antes, falha de sintese (Gemini TTS) ou de upload so ia pro log do servidor:
// o material era gravado com status "failed" e NENHUMA razao junto, entao a API
// caia no texto generico ("Formato obrigatorio nao foi persistido") e o
// professor via "Falhou" sem a menor pista do motivo - cota estourada, modelo
// indisponivel e bug no codigo ficavam todos com a mesma cara.
//
// A API ja sabe ler metadata.failure_reason do material (_material_error, em
// api/app/api/v1/personalizacao.py) e mostrar no card do formato. Aqui so
// montamos esse texto.

export interface AudioPartFailure {
  /** Numero da parte (1-based), como aparece pro professor. */
  ordem: number;
  motivo: string;
}

const MAX_REASON_LENGTH = 400;

/** Extrai uma mensagem legivel de qualquer coisa que tenha sido lancada. */
export function describeError(error: unknown): string {
  // Error vem antes do ramo generico de objeto: um Error com mensagem vazia
  // serializado com JSON.stringify vira "{}", que nao ajuda ninguem.
  if (error instanceof Error) {
    return error.message.trim() || "erro desconhecido";
  }
  if (typeof error === "string" && error.trim()) return error.trim();
  if (error && typeof error === "object") {
    const mensagem = (error as { message?: unknown }).message;
    if (typeof mensagem === "string" && mensagem.trim()) return mensagem.trim();
    try {
      return JSON.stringify(error).slice(0, MAX_REASON_LENGTH);
    } catch {
      return "erro desconhecido";
    }
  }
  return "erro desconhecido";
}

/**
 * Resume as falhas num texto curto pro card do formato. Sem falha registrada
 * (ex.: sintese devolveu vazio sem lancar), ainda devolve algo util em vez de
 * deixar o professor no escuro.
 */
export function summarizeAudioFailures(
  failures: AudioPartFailure[],
  totalPartes: number,
): string {
  if (failures.length === 0) {
    return totalPartes > 1
      ? "O áudio não foi gerado para todas as partes do material."
      : "O áudio não foi gerado.";
  }

  const porOrdem = [...failures].sort((a, b) => a.ordem - b.ordem);
  const detalhe =
    totalPartes > 1
      ? porOrdem.map((f) => `parte ${f.ordem}: ${f.motivo}`).join(" | ")
      : porOrdem[0].motivo;

  const prefixo =
    porOrdem.length === totalPartes ? "Áudio falhou" : `Áudio falhou em ${porOrdem.length}/${totalPartes}`;

  return `${prefixo} — ${detalhe}`.slice(0, MAX_REASON_LENGTH);
}
