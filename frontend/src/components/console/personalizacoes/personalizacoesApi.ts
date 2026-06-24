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

const AUTH_ERROR_PATTERN =
  /token invalido|token inv[aá]lido|token expirado|audience do token|assinatura do token|formato de token|authorization bearer token obrigatorio|token ausente/i;

// ── Tipos compartilhados ──────────────────────────────────────────────────────
export type DesignTokensCores = {
  background: string;
  surface: string;
  surface_elevated: string;
  primary: string;
  primary_glow: string;
  border: string;
  text_primary: string;
  text_muted: string;
  success: string;
  locked: string;
};

export type DesignTokens = {
  cores: DesignTokensCores;
  tipografia?: Record<string, unknown>;
  border_radius?: number;
  sombra?: string;
  sombra_primary?: string;
};

export type PlanoPersonalizacao = {
  formato_prioritario?: string;
  formatos?: string[];
  nivel?: string;
  tom?: string;
  estilo?: string;
  justificativa?: string;
  [key: string]: unknown;
};

export type PersonalizacaoResponse = {
  id: number;
  aluno_id: string;
  classe_id?: number | null;
  conteudo_id?: number | null;
  topico_id?: number | null;
  ciclo_id: string;
  status: string;
  media_status?: "ready" | "pending" | "partial" | "failed";
  formato_prioritario?: string;
  formatos_gerados?: string[];
  plano?: PlanoPersonalizacao | null;
  materiais?: Record<string, unknown> | null;
  design_tokens: DesignTokens;
  steps?: Array<Record<string, unknown>>;
  gerado_em?: string | null;
  updated_at?: string | null;
};

export type PersonalizacaoPerfilItem = {
  perfil: string;
  perfil_label: string;
  cor: string;
  design_tokens: DesignTokens;
  tem_personalizacao: boolean;
  personalizacao?: PersonalizacaoResponse | null;
  plano?: PlanoPersonalizacao | null;
  formato_prioritario?: string | null;
  formatos_gerados?: string[];
  materiais?: Record<string, unknown> | null;
  total_alunos: number;
  gerado_em?: string | null;
};

export type PersonalizacaoPorPerfilResponse = {
  classe_id: number;
  topico_id: number;
  total_perfis_com_material: number;
  perfis: PersonalizacaoPerfilItem[];
};

export type PersonalizacaoContextoDocenteResponse = {
  aluno_id: string;
  classe_id: number;
  topico_id?: number | null;
  contexto_aluno?: Record<string, unknown> | null;
  personalizacoes?: PersonalizacaoResponse[];
  progresso_itens?: Array<{
    id: number;
    item_key: string;
    item_kind: string;
    item_title: string;
    status: string;
    percentual_concluido: number;
    tempo_gasto_min: number;
    pontuacao_obtida?: number | null;
    pontuacao_maxima?: number | null;
    updated_at?: string | null;
  }>;
};

// ── Fetch helpers (mesmo padrao de personalizacaoJobsApi.ts) ───────────────────
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
      Authorization: `Bearer ${accessToken}`,
      ...(init.headers ?? {}),
    },
  });

  const rawText = await response.text();
  return { response, payload: parseJsonSafe(rawText), rawText };
}

async function apiRequest<T>(path: string, accessToken: string, init?: RequestInit): Promise<T> {
  if (API_BASE_URL_CANDIDATES.length === 0) {
    throw new Error("Defina VITE_APITRAIUP_URL para consultar as personalizacoes.");
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

/** Visoes 1 e 2: personalizacao de um (classe x topico) agrupada pelos 7 perfis BrainHex. */
export async function fetchPersonalizacaoPorPerfil(
  accessToken: string,
  params: { classeId: number; topicoId: number }
): Promise<PersonalizacaoPorPerfilResponse> {
  return apiRequest<PersonalizacaoPorPerfilResponse>(
    `/api/v1/personalizar/perfis/${params.classeId}/${params.topicoId}`,
    accessToken
  );
}

/** Visao 3: preview por aluno, reutilizando o contexto docente existente. */
export async function fetchContextoDocente(
  accessToken: string,
  params: { alunoId: string; classeId: number; topicoId?: number }
): Promise<PersonalizacaoContextoDocenteResponse> {
  const search = new URLSearchParams();
  search.set("classe_id", String(params.classeId));
  if (params.topicoId != null) search.set("topico_id", String(params.topicoId));
  return apiRequest<PersonalizacaoContextoDocenteResponse>(
    `/api/v1/personalizar/contexto/${params.alunoId}?${search.toString()}`,
    accessToken
  );
}
