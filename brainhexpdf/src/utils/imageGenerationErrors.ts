// Sinaliza uma falha de geracao de imagem que NAO vai se resolver tentando
// outra chave/modelo dentro da mesma geracao de deck (billing/quota
// estruturalmente esgotados), em oposicao a falhas transitorias (503
// sobrecarga, 429 de rate-limit por minuto) onde vale a pena continuar a
// rotacao de chaves/modelos.
export class ImageGenerationUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ImageGenerationUnavailableError";
  }
}

// "prepayment credits are depleted" e a mensagem exata que a API do Gemini
// devolve quando o billing do projeto esgotou pra geracao de imagem - visto
// em producao (ver docs/superpowers/specs, incidente 2026-08-23). Diferente
// de "Quota exceeded... Please retry in Ns" (transitorio, por chave), esse
// erro nao muda tentando outra chave ou esperando.
const UNAVAILABLE_ERROR_SIGNATURES = ["prepayment credits"];

export function isImageGenerationUnavailableError(err: unknown): boolean {
  const message = String((err as { message?: unknown })?.message ?? "").toLowerCase();
  return UNAVAILABLE_ERROR_SIGNATURES.some((signature) => message.includes(signature));
}
