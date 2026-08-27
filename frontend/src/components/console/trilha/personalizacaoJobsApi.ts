import { apiRequest } from "@/lib/apiTraiupClient";

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

export type PersonalizacaoJobEnqueueResult =
  | PersonalizacaoJobDetail
  | { skipped: true; reason?: string };

export async function enqueueClassDeltaJob(
  accessToken: string,
  payload: PersonalizacaoJobPayload
): Promise<PersonalizacaoJobEnqueueResult> {
  return apiRequest<PersonalizacaoJobEnqueueResult>("/api/v1/personalizar/jobs/class-delta", accessToken, {
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
