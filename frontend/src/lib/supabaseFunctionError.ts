type FunctionErrorPayload = {
  error?: unknown;
  message?: unknown;
  code?: unknown;
  details?: unknown;
};

function payloadMessage(payload: FunctionErrorPayload): string {
  const message =
    (typeof payload.message === "string" && payload.message.trim()) ||
    (typeof payload.error === "string" && payload.error.trim()) ||
    "";
  const code = typeof payload.code === "string" ? payload.code.trim() : "";
  return message && code ? `${message} (${code})` : message;
}

export async function formatSupabaseFunctionError(
  error: unknown,
  fallback = "Falha ao executar a funcao de IA.",
): Promise<string> {
  if (!error || typeof error !== "object") {
    return error instanceof Error && error.message ? error.message : fallback;
  }

  const row = error as { message?: unknown; context?: unknown };
  if (row.context instanceof Response) {
    try {
      const raw = await row.context.clone().text();
      if (raw) {
        const parsed = JSON.parse(raw) as FunctionErrorPayload;
        const detail = payloadMessage(parsed);
        if (detail) return detail;
      }
    } catch {
      // O corpo pode estar vazio, consumido ou nao ser JSON. Usa a mensagem do SDK.
    }
  }

  return typeof row.message === "string" && row.message.trim()
    ? row.message.trim()
    : fallback;
}
