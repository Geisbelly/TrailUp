import { supabase } from "@/integrations/supabase/client";

const ENV_API_BASE_URL = String(import.meta.env.VITE_APITRAIUP_URL ?? "")
  .trim()
  .replace(/\/+$/, "");

// So faz sentido tentar a porta 8000 do proprio hostname em dev local — em producao
// (dominio real tipo trailup.vercel.app) essa URL nunca responde, so atrasa o erro
// real da API (Render) em ~20s e polui a mensagem com um endereco sem sentido.
const IS_LOCAL_DEV_HOST =
  typeof window !== "undefined" &&
  /^(localhost|127\.0\.0\.1|(\d{1,3}\.){3}\d{1,3})$/.test(window.location.hostname);

const FALLBACK_LOCAL_API_BASE_URL = IS_LOCAL_DEV_HOST
  ? `${window.location.protocol}//${window.location.hostname}:8000`
  : "";

// Em producao, passa pela propria origem da Vercel. Assim respostas de
// infraestrutura do Render (cold start, gateway/timeout) nao viram um falso
// erro de CORS no navegador e o corpo/status real continua observavel.
const SAME_ORIGIN_API_PROXY = typeof window !== "undefined" && !IS_LOCAL_DEV_HOST
  ? `${window.location.origin}/trailup-api`
  : "";

const API_BASE_URL_CANDIDATES = Array.from(
  new Set([SAME_ORIGIN_API_PROXY, ENV_API_BASE_URL, FALLBACK_LOCAL_API_BASE_URL].filter(Boolean))
);

const REQUEST_TIMEOUT_MS = Number(import.meta.env.VITE_APITRAIUP_TIMEOUT_MS ?? 20000);

export type PersonalizacaoJobPayload = {
  classe_id: number;
  aluno_id?: string;
  topico_ids?: number[];
  conteudo_ids?: number[];
  reason?: string;
  trigger_source?: string;
};

export type PersonalizacaoJobMetadata = {
  conteudo_ids?: unknown;
  topico_ids?: unknown;
  reason?: unknown;
  [key: string]: unknown;
};

export type PersonalizacaoJobStatus = {
  id: string;
  kind: string;
  status: string;
  classe_id: number;
  aluno_id?: string | null;
  topico_id?: number | null;
  conteudo_id?: number | null;
  trigger_source?: string;
  payload: PersonalizacaoJobMetadata;
  total_targets: number;
  processed_targets: number;
  error_count: number;
  created_at: string;
  updated_at: string;
  last_error?: string | null;
  started_at?: string | null;
  finished_at?: string | null;
};

export type PersonalizacaoJobTargetStatus = {
  id: number;
  job_id: string;
  aluno_id: string;
  topico_id: number;
  conteudo_id?: number | null;
  status: string;
  attempts: number;
  last_error?: string | null;
  personalizacao_id?: number | null;
  created_at: string;
  updated_at: string;
};

export type PersonalizacaoJobDetail = PersonalizacaoJobStatus & {
  targets?: PersonalizacaoJobTargetStatus[];
};

const ACTIVE_JOB_STATUSES = new Set(["pending", "processing", "partial"]);

export function isPersonalizacaoJobActive(job: Pick<PersonalizacaoJobStatus, "status">): boolean {
  return ACTIVE_JOB_STATUSES.has(String(job.status).trim().toLowerCase());
}

function parsePositiveInteger(value: unknown): number | null {
  const parsed = typeof value === "number" ? value : Number(String(value ?? "").trim());
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

export function getPersonalizacaoJobContentIds(
  job: Pick<PersonalizacaoJobStatus, "conteudo_id" | "payload">
): number[] {
  const ids = new Set<number>();
  const directId = parsePositiveInteger(job.conteudo_id);
  if (directId != null) ids.add(directId);

  const payloadIds = job.payload?.conteudo_ids;
  if (Array.isArray(payloadIds)) {
    for (const value of payloadIds) {
      const id = parsePositiveInteger(value);
      if (id != null) ids.add(id);
    }
  }

  return [...ids];
}

export function selectFailedJobTopicoIds(
  jobs: PersonalizacaoJobStatus[]
): number[] {
  return [
    ...new Set(
      jobs
        .filter((job) => String(job.status).trim().toLowerCase() === "failed")
        .map((job) => job.topico_id)
        .filter((id): id is number => typeof id === "number" && id > 0)
    ),
  ];
}

export type PersonalizacaoJobsSummary = {
  activeCount: number;
  processedTargets: number;
  totalTargets: number;
  errorCount: number;
  contentIds: number[];
  lastError: string | null;
};

export function summarizePersonalizacaoJobs(
  jobs: PersonalizacaoJobStatus[]
): PersonalizacaoJobsSummary {
  const activeJobs = jobs.filter(isPersonalizacaoJobActive);
  const scopedJobs = activeJobs.length > 0
    ? activeJobs
    : jobs.slice(0, 1);

  return {
    activeCount: activeJobs.length,
    processedTargets: scopedJobs.reduce(
      (total, job) => total + Math.max(0, Number(job.processed_targets) || 0),
      0
    ),
    totalTargets: scopedJobs.reduce(
      (total, job) => total + Math.max(0, Number(job.total_targets) || 0),
      0
    ),
    errorCount: scopedJobs.reduce(
      (total, job) =>
        total +
        Math.max(
          0,
          Number(job.error_count) || 0,
          job.last_error || job.status === "failed" ? 1 : 0
        ),
      0
    ),
    contentIds: [
      ...new Set(scopedJobs.flatMap((job) => getPersonalizacaoJobContentIds(job))),
    ],
    lastError:
      scopedJobs.find((job) => String(job.last_error ?? "").trim())?.last_error?.trim() ?? null,
  };
}

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

export async function enqueueEnrollmentJob(
  accessToken: string,
  payload: PersonalizacaoJobPayload
): Promise<PersonalizacaoJobDetail> {
  return apiRequest<PersonalizacaoJobDetail>("/api/v1/personalizar/jobs/enrollment", accessToken, {
    method: "POST",
    body: JSON.stringify({ trigger_source: "web_console", ...payload }),
  });
}

export async function enqueueCleanupJob(
  accessToken: string,
  payload: PersonalizacaoJobPayload
): Promise<PersonalizacaoJobDetail> {
  return apiRequest<PersonalizacaoJobDetail>("/api/v1/personalizar/jobs/student-cleanup", accessToken, {
    method: "POST",
    body: JSON.stringify({ trigger_source: "web_console", ...payload }),
  });
}

export async function enqueueClassDeltaJob(
  accessToken: string,
  payload: PersonalizacaoJobPayload
): Promise<PersonalizacaoJobDetail> {
  return apiRequest<PersonalizacaoJobDetail>("/api/v1/personalizar/jobs/class-delta", accessToken, {
    method: "POST",
    body: JSON.stringify({ trigger_source: "web_console", ...payload }),
  });
}

export async function enqueueManualRetryJob(
  accessToken: string,
  payload: PersonalizacaoJobPayload
): Promise<PersonalizacaoJobDetail> {
  return apiRequest<PersonalizacaoJobDetail>("/api/v1/personalizar/jobs/manual-retry", accessToken, {
    method: "POST",
    body: JSON.stringify({ trigger_source: "web_console", ...payload }),
  });
}

export async function enqueueFullSyncJob(
  accessToken: string,
  payload: PersonalizacaoJobPayload
): Promise<PersonalizacaoJobDetail> {
  return apiRequest<PersonalizacaoJobDetail>("/api/v1/personalizar/jobs/full-sync", accessToken, {
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
