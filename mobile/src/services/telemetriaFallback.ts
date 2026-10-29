import { isNetworkRequestFailedError } from "@/services/apiBaseUrl.core";

/**
 * Por que um lote de telemetria foi gravado pela via direta (cliente ->
 * Supabase) em vez de chegar pela API. Os valores espelham o CHECK de
 * `telemetria_lotes.fallback_motivo` -- mudar um sem o outro faz o banco
 * recusar o lote.
 */
export type FallbackMotivo =
  | "sem_url"
  | "rede"
  | "timeout"
  | "http_4xx"
  | "http_5xx"
  | "sem_sessao"
  | "desconhecido";

/** Resposta HTTP de erro da API de telemetria; guarda o status para classificar. */
export class TelemetriaHttpError extends Error {
  readonly status: number;

  constructor(status: number, message?: string) {
    super(message ?? `Erro ${status} ao enviar telemetria.`);
    this.name = "TelemetriaHttpError";
    this.status = status;
  }
}

// Mensagem fixa de `getAuthHeaders` em telemetriaApi.ts -- unico caso em que
// a classificacao depende de texto, porque ali nao ha classe propria.
const MENSAGEM_SEM_SESSAO = "Sem sessão ativa para enviar telemetria.";

/**
 * Decide o motivo pela classe/campos do erro, nao pela mensagem (a unica
 * excecao e a sessao ausente). Pura: nao toca em rede nem em banco.
 */
export function classificarFallback(erro: unknown): FallbackMotivo {
  if (erro instanceof TelemetriaHttpError) {
    if (erro.status >= 500) return "http_5xx";
    if (erro.status >= 400) return "http_4xx";
    return "desconhecido";
  }

  if (typeof erro === "object" && erro !== null) {
    if ((erro as { name?: unknown }).name === "AbortError") return "timeout";
    if (isNetworkRequestFailedError(erro)) return "rede";
    if ((erro as { message?: unknown }).message === MENSAGEM_SEM_SESSAO) {
      return "sem_sessao";
    }
  }

  return "desconhecido";
}
