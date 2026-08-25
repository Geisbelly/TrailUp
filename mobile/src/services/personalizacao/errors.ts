export class PersonalizacaoAuthError extends Error {
  readonly code: "no_session" | "token_invalid" | "cooldown";

  constructor(
    message: string,
    code: "no_session" | "token_invalid" | "cooldown"
  ) {
    super(message);
    this.name = "PersonalizacaoAuthError";
    this.code = code;
  }
}

export class PersonalizacaoNetworkError extends Error {
  readonly code: "no_api_config" | "network_cooldown" | "network_unreachable";

  constructor(
    message: string,
    code: "no_api_config" | "network_cooldown" | "network_unreachable"
  ) {
    super(message);
    this.name = "PersonalizacaoNetworkError";
    this.code = code;
  }
}

export class PersonalizacaoRlsError extends Error {
  readonly code: "rls_forbidden";

  constructor(message: string) {
    super(message);
    this.name = "PersonalizacaoRlsError";
    this.code = "rls_forbidden";
  }
}

export function isPersonalizacaoAuthError(error: unknown) {
  return error instanceof PersonalizacaoAuthError;
}
