import { supabase } from "@/integrations/supabase/client";

// Cliente HTTP compartilhado para a API de personalizacao (Render). Centraliza a
// resolucao da base URL e o fetch autenticado com retry — antes duplicado (e
// divergente) entre personalizacoesApi.ts, personalizacaoJobsApi.ts e
// DashboardSection.tsx.

export function buildApiBaseUrlCandidates(opts: {
  envBaseUrl: string;
  origin: string;
  hostname: string;
  protocol: string;
}): string[] {
  const envUrl = opts.envBaseUrl.trim().replace(/\/+$/, "");

  // So faz sentido tentar a porta 8000 do proprio hostname em dev local — em producao
  // (dominio real tipo trailup.vercel.app) essa URL nunca responde, so atrasa o erro
  // real da API (Render) em ~20s e polui a mensagem com um endereco sem sentido.
  const isLocalDevHost = /^(localhost|127\.0\.0\.1|(\d{1,3}\.){3}\d{1,3})$/.test(opts.hostname);

  const fallbackLocal = isLocalDevHost ? `${opts.protocol}//${opts.hostname}:8000` : "";

  // Em producao, passa pela propria origem da Vercel. Assim respostas de
  // infraestrutura do Render (cold start, gateway/timeout) nao viram um falso
  // erro de CORS no navegador e o corpo/status real continua observavel.
  const sameOriginProxy = !isLocalDevHost ? `${opts.origin}/trailup-api` : "";

  const candidates = [sameOriginProxy, envUrl, fallbackLocal].filter(Boolean);

  // Uma pagina https nunca deve tentar um candidato http://: o browser bloqueia
  // como Mixed Content antes da resposta chegar, e o erro real (VITE_APITRAIUP_URL
  // mal configurada) fica escondido atras de um "Failed to load resource" mudo.
  const isSecurePage = opts.protocol === "https:";
  const safeCandidates = isSecurePage
    ? candidates.filter((url) => !url.startsWith("http://"))
    : candidates;

  return Array.from(new Set(safeCandidates));
}

const API_BASE_URL_CANDIDATES =
  typeof window !== "undefined"
    ? buildApiBaseUrlCandidates({
        envBaseUrl: String(import.meta.env.VITE_APITRAIUP_URL ?? ""),
        origin: window.location.origin,
        hostname: window.location.hostname,
        protocol: window.location.protocol,
      })
    : [];

const DEFAULT_REQUEST_TIMEOUT_MS = Number(import.meta.env.VITE_APITRAIUP_TIMEOUT_MS ?? 20000);

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

export async function apiRequest<T>(
  path: string,
  accessToken: string,
  init?: RequestInit,
  timeoutMs: number = DEFAULT_REQUEST_TIMEOUT_MS
): Promise<T> {
  if (API_BASE_URL_CANDIDATES.length === 0) {
    throw new Error("Defina VITE_APITRAIUP_URL para consultar a API de personalizacao.");
  }

  let lastNetworkError: unknown = null;
  let resolvedToken = await resolveAccessToken(accessToken, false);

  for (const baseUrl of API_BASE_URL_CANDIDATES) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), timeoutMs);

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
