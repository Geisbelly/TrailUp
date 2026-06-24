import { supabase } from "@/integrations/supabase/client";

const ENV_API_BASE_URL = String(import.meta.env.VITE_APITRAIUP_URL ?? "")
  .trim()
  .replace(/\/+$/, "");

const FALLBACK_LOCAL_API_BASE_URL =
  typeof window !== "undefined"
    ? `${window.location.protocol}//${window.location.hostname}:8000`
    : "";

const API_BASE_URL_CANDIDATES = Array.from(
  new Set([ENV_API_BASE_URL, FALLBACK_LOCAL_API_BASE_URL].filter(Boolean))
);

const REQUEST_TIMEOUT_MS = Number(import.meta.env.VITE_APITRAIUP_TIMEOUT_MS ?? 20000);

type JobPayload = {
  classe_id: number;
  aluno_id?: string;
  topico_ids?: number[];
  conteudo_ids?: number[];
  reason?: string;
  trigger_source?: string;
};

export type PersonalizacaoJobStatus = {
  id: string;
  kind: string;
  status: string;
  classe_id: number;
  aluno_id?: string | null;
  total_targets: number;
  processed_targets: number;
  error_count: number;
  created_at: string;
  updated_at: string;
  last_error?: string | null;
};

const AUTH_ERROR_PATTERN =
  /token invalido|token inv[aá]lido|token expirado|audience do token|assinatura do token|formato de token|authorization bearer token obrigatorio|token ausente/i;

function parseJsonSafe(raw: string): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function extractErrorDetail(response: Response, payload: unknown, rawText: string): string {
  if (payload && typeof payload === "object") {
    const obj = payload as Record<string, unknown>;
    if (typeof obj.detail === "string" && obj.detail.trim()) return obj.detail.trim();
    if (typeof obj.error === "string" && obj.error.trim()) return obj.error.trim();
    if (typeof obj.message === "string" && obj.message.trim()) return obj.message.trim();
  }
  if (rawText.trim()) return rawText.trim();
  return `Falha ao chamar API de personalizacao (${response.status}).`;
}

function isAuthFailure(response: Response, detail: string): boolean {
  return response.status === 401 || AUTH_ERROR_PATTERN.test(detail);
}

async function resolveAccessToken(seedToken: string, forceRefresh: boolean): Promise<string> {
  const normalizedSeed = String(seedToken || "").trim();
  if (normalizedSeed && !forceRefresh) return normalizedSeed;

  const sessionResult = forceRefresh
    ? await supabase.auth.refreshSession()
    : await supabase.auth.getSession();

  if (sessionResult.error) {
    throw new Error(`Falha ao obter sessao do Supabase: ${sessionResult.error.message}`);
  }

  const token = String(sessionResult.data.session?.access_token ?? "").trim();
  if (token) return token;

  if (!forceRefresh) {
    return resolveAccessToken("", true);
  }

  throw new Error("Sessao expirada no console. Faca login novamente.");
}

async function executeApiFetch(
  url: string,
  accessToken: string,
  init: RequestInit,
  controller: AbortController
): Promise<{ response: Response; payload: unknown; rawText: string }> {
  const response = await fetch(url, {
    ...init,
    signal: controller.signal,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      ...(init.headers ?? {}),
    },
  });

  const rawText = await response.text();
  return { response, payload: parseJsonSafe(rawText), rawText };
}

async function apiRequest<T>(path: string, accessToken: string, init?: RequestInit): Promise<T> {
  if (API_BASE_URL_CANDIDATES.length === 0) {
    throw new Error("Defina VITE_APITRAIUP_URL para usar os jobs de personalizacao.");
  }

  let lastNetworkError: unknown = null;
  let resolvedToken = await resolveAccessToken(accessToken, false);

  for (const baseUrl of API_BASE_URL_CANDIDATES) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      const url = `${baseUrl}${path}`;
      let result = await executeApiFetch(url, resolvedToken, init ?? {}, controller);

      if (!result.response.ok) {
        const detail = extractErrorDetail(result.response, result.payload, result.rawText);
        if (isAuthFailure(result.response, detail)) {
          resolvedToken = await resolveAccessToken("", true);
          result = await executeApiFetch(url, resolvedToken, init ?? {}, controller);
        }
      }

      if (!result.response.ok) {
        throw new Error(extractErrorDetail(result.response, result.payload, result.rawText));
      }

      return (result.payload ?? null) as T;
    } catch (error) {
      const isNetworkError =
        error instanceof DOMException ||
        (error instanceof TypeError && /fetch|network|connection/i.test(String(error.message)));

      if (!isNetworkError) throw error;
      lastNetworkError = error;
    } finally {
      window.clearTimeout(timeout);
    }
  }

  throw new Error(
    `Nao foi possivel conectar na API de personalizacao (${API_BASE_URL_CANDIDATES.join(
      " ou "
    )}). Verifique VITE_APITRAIUP_URL e se a API esta ativa. Detalhe: ${String(lastNetworkError)}`
  );
}

export async function enqueueEnrollmentJob(accessToken: string, payload: JobPayload) {
  return apiRequest("/api/v1/personalizar/jobs/enrollment", accessToken, {
    method: "POST",
    body: JSON.stringify({ trigger_source: "web_console", ...payload }),
  });
}

export async function enqueueCleanupJob(accessToken: string, payload: JobPayload) {
  return apiRequest("/api/v1/personalizar/jobs/student-cleanup", accessToken, {
    method: "POST",
    body: JSON.stringify({ trigger_source: "web_console", ...payload }),
  });
}

export async function enqueueClassDeltaJob(accessToken: string, payload: JobPayload) {
  return apiRequest("/api/v1/personalizar/jobs/class-delta", accessToken, {
    method: "POST",
    body: JSON.stringify({ trigger_source: "web_console", ...payload }),
  });
}

export async function enqueueFullSyncJob(accessToken: string, payload: JobPayload) {
  return apiRequest("/api/v1/personalizar/jobs/full-sync", accessToken, {
    method: "POST",
    body: JSON.stringify({ trigger_source: "web_console", ...payload }),
  });
}

export async function listPersonalizacaoJobs(
  accessToken: string,
  params: { classeId?: number; alunoId?: string; statuses?: string[]; limit?: number } = {}
) {
  const search = new URLSearchParams();
  if (params.classeId != null) search.set("classe_id", String(params.classeId));
  if (params.alunoId) search.set("aluno_id", params.alunoId);
  for (const status of params.statuses ?? []) {
    search.append("status_filter", status);
  }
  search.set("limit", String(params.limit ?? 20));
  return apiRequest<{ total: number; itens: PersonalizacaoJobStatus[] }>(
    `/api/v1/personalizar/jobs?${search.toString()}`,
    accessToken
  );
}
