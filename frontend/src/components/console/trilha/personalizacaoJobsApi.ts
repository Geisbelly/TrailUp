import { apiRequest } from "@/lib/apiTraiupClient";
import { supabase } from "@/integrations/supabase/client";

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

// class-delta nao tem mais cliente: quem enfileira e' o proprio Postgres,
// pelos triggers `trg_topicos_class_delta_job` / `trg_conteudos_class_delta_job`
// (migration 20260827_03). Salvar topico/conteudo E' o disparo — o console nao
// precisa (nem deve) chamar nada depois do save.

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

const JOB_COLUMNS = [
  "id",
  "kind",
  "status",
  "classe_id",
  "aluno_id",
  "topico_id",
  "conteudo_id",
  "trigger_source",
  "payload",
  "total_targets",
  "processed_targets",
  "error_count",
  "last_error",
  "created_at",
  "updated_at",
  "started_at",
  "finished_at",
].join(", ");

/**
 * Le a fila direto do Postgres, sem passar pela API.
 *
 * Listar job e' encanamento — nao tem modelo de linguagem no meio — e a API
 * hiberna no free tier. Enquanto ela estava fora, esta consulta voltava 502 a
 * cada ciclo do polling e o painel de status do console ficava travado em
 * erro. O banco nao hiberna.
 *
 * A checagem de posse que a rota fazia com `professor_owns_classe` agora e'
 * RLS: `personalizacao_jobs_professor_sel` (migration 20260827_03) so deixa o
 * professor enxergar job das classes dele. Filtrar por `classeId` aqui e'
 * conveniencia de consulta, nao autorizacao.
 *
 * O cast do client: `personalizacao_jobs` nao esta em
 * `src/integrations/supabase/types.ts`, que cobre 25 das 84 tabelas do banco
 * (as views e `cards` tambem faltam, e ja produzem erro de tipo em
 * RanksSection/ClassManagementSection). Regerar aquele arquivo mexeria em
 * todo mundo que hoje se apoia no shape antigo, entao o escape fica preso
 * aqui — a saida volta tipada em `PersonalizacaoJobStatus`.
 */
export async function listPersonalizacaoJobs(
  params: { classeId?: number; alunoId?: string; statuses?: string[]; limit?: number } = {}
): Promise<{ total: number; itens: PersonalizacaoJobStatus[] }> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const client = supabase as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query: any = client
    .from("personalizacao_jobs")
    .select(JOB_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(params.limit ?? 20);

  if (params.classeId != null) query = query.eq("classe_id", params.classeId);
  if (params.alunoId) query = query.eq("aluno_id", params.alunoId);
  if (params.statuses && params.statuses.length > 0) query = query.in("status", params.statuses);

  const { data, error } = await query;
  if (error) throw error;

  // payload e' NOT NULL no banco, mas o tipo do supabase-js admite null e os
  // consumidores (getPersonalizacaoJobContentIds, summarize...) leem campos
  // dele direto — normalizar aqui evita espalhar `?? {}` por eles.
  const itens = ((data ?? []) as unknown as PersonalizacaoJobStatus[]).map((job) => ({
    ...job,
    payload: job.payload ?? {},
  }));

  return { total: itens.length, itens };
}
