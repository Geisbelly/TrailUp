import { getSessionSafe, supabase } from "@/database/supabase";
import {
  isNetworkRequestFailedError,
  resolveApiBaseCandidates,
} from "@/services/apiBaseUrl";
import {
  normalizeNonNegativeNumber,
  normalizePositiveInteger,
} from "@/utils/dataValidation";
import {
  TelemetryBatchPayload,
  TelemetryBatchResponse,
  TelemetryTimeMetricEntry,
} from "@/interfaces/telemetria/TelemetryContracts";

const API_BASE_CANDIDATES = resolveApiBaseCandidates(
  process.env.EXPO_PUBLIC_APITRAIUP_URL
);

function buildUrls(path: string) {
  if (!API_BASE_CANDIDATES.length) return [] as string[];
  return API_BASE_CANDIDATES.map((base) => `${base}${path}`);
}

function buildUuid() {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }

  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const random = Math.floor(Math.random() * 16);
    const value = char === "x" ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

async function getAuthHeaders() {
  const session = await getSessionSafe();
  const token = session?.access_token;
  if (!token) {
    throw new Error("Sem sessao ativa para enviar telemetria.");
  }

  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

function formatApiErrorDetail(detail: unknown) {
  if (Array.isArray(detail)) {
    const messages = detail
      .map((item) => {
        if (!item || typeof item !== "object") {
          return String(item);
        }

        const path = Array.isArray((item as { loc?: unknown[] }).loc)
          ? (item as { loc: unknown[] }).loc.join(".")
          : null;
        const message =
          (item as { msg?: string }).msg ||
          (item as { message?: string }).message ||
          null;

        if (path && message) {
          return `${path}: ${message}`;
        }

        return message || JSON.stringify(item);
      })
      .filter(Boolean);

    if (messages.length > 0) {
      return messages.join(" | ");
    }
  }

  if (detail && typeof detail === "object") {
    return JSON.stringify(detail);
  }

  return detail ? String(detail) : null;
}

async function parseResponse<T>(response: Response): Promise<T> {
  const text = await response.text();
  let payload: any = null;

  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = null;
    }
  }

  if (!response.ok) {
    const detail =
      formatApiErrorDetail(payload?.detail) ||
      formatApiErrorDetail(payload?.message) ||
      payload?.message ||
      text ||
      `Erro ${response.status} ao enviar telemetria.`;
    throw new Error(String(detail));
  }

  if (!payload && text) {
    throw new Error("Resposta invalida da API de telemetria.");
  }

  return payload as T;
}

export function hasTelemetriaApiConfigured() {
  return API_BASE_CANDIDATES.length > 0;
}

function buildFallbackResponse(
  batchId: string,
  payload: TelemetryBatchPayload
): TelemetryBatchResponse {
  const normalizedEvents = Array.from(
    new Set((payload.eventos_app ?? []).map((event) => event.event_name).filter(Boolean))
  );

  return {
    batch_id: batchId,
    sessao_id: payload.sessao_id,
    persisted: true,
    normalized_events: normalizedEvents,
    analysis: {
      ciclo_id: null,
      acoes_aplicadas: [],
      erros: [],
    },
  };
}

function normalizeMetricNumber(value: unknown) {
  return normalizeNonNegativeNumber(value, 0, 6);
}

function normalizeMetricInteger(value: unknown) {
  return Math.max(0, Math.round(normalizeMetricNumber(value)));
}

function sanitizeTimeMetricEntry(entry: TelemetryTimeMetricEntry): TelemetryTimeMetricEntry {
  return {
    ...entry,
    topico_id: normalizePositiveInteger(entry.topico_id) ?? null,
    conteudo_id: normalizePositiveInteger(entry.conteudo_id) ?? null,
    atividade_id: normalizePositiveInteger(entry.atividade_id) ?? null,
    visits: normalizeMetricInteger(entry.visits),
    dwell_sec: normalizeMetricNumber(entry.dwell_sec),
    active_sec: normalizeMetricNumber(entry.active_sec),
    idle_sec: normalizeMetricNumber(entry.idle_sec),
    touch_count: normalizeMetricInteger(entry.touch_count),
    scroll_distance_px: normalizeMetricNumber(entry.scroll_distance_px),
    max_depth_px: normalizeMetricNumber(entry.max_depth_px),
  };
}

function sanitizeTelemetryPayload(payload: TelemetryBatchPayload): TelemetryBatchPayload {
  const classeId = normalizePositiveInteger(payload.classe_id);
  if (!classeId) {
    throw new Error("Payload de telemetria invalido: classe_id ausente ou invalido.");
  }

  const timeMetrics = payload.time_metrics;
  return {
    ...payload,
    classe_id: classeId,
    topico_id: normalizePositiveInteger(payload.topico_id) ?? null,
    conteudo_id: normalizePositiveInteger(payload.conteudo_id) ?? null,
    atividade_id: normalizePositiveInteger(payload.atividade_id) ?? null,
    study_elapsed_sec: normalizeMetricInteger(payload.study_elapsed_sec),
    screen_dwell_sec: normalizeMetricInteger(payload.screen_dwell_sec),
    active_sec: normalizeMetricInteger(payload.active_sec),
    idle_sec: normalizeMetricInteger(payload.idle_sec),
    touch_count: normalizeMetricInteger(payload.touch_count),
    scroll_distance_px: normalizeMetricNumber(payload.scroll_distance_px),
    max_depth_px: normalizeMetricNumber(payload.max_depth_px),
    time_metrics: {
      ...timeMetrics,
      general: {
        ...timeMetrics.general,
        session_elapsed_sec: normalizeMetricInteger(timeMetrics.general.session_elapsed_sec),
        batch_dwell_sec: normalizeMetricInteger(timeMetrics.general.batch_dwell_sec),
        batch_active_sec: normalizeMetricInteger(timeMetrics.general.batch_active_sec),
        batch_idle_sec: normalizeMetricInteger(timeMetrics.general.batch_idle_sec),
        touch_count: normalizeMetricInteger(timeMetrics.general.touch_count),
        scroll_distance_px: normalizeMetricNumber(timeMetrics.general.scroll_distance_px),
        max_depth_px: normalizeMetricNumber(timeMetrics.general.max_depth_px),
      },
      topics: (timeMetrics.topics ?? []).map(sanitizeTimeMetricEntry),
      contents: (timeMetrics.contents ?? []).map(sanitizeTimeMetricEntry),
      activities: (timeMetrics.activities ?? []).map(sanitizeTimeMetricEntry),
      materials: (timeMetrics.materials ?? []).map(sanitizeTimeMetricEntry),
    },
  };
}

function buildMetricRowsForScope(params: {
  scope: "topic" | "content" | "activity" | "material";
  entries: TelemetryTimeMetricEntry[] | null | undefined;
  batchId: string;
  payload: TelemetryBatchPayload;
  alunoId: string;
}) {
  const {
    scope,
    entries,
    batchId,
    payload,
    alunoId,
  } = params;

  if (!Array.isArray(entries) || entries.length === 0) return [];

  return entries.map((entry) => ({
    lote_id: batchId,
    sessao_id: payload.sessao_id,
    aluno_id: alunoId,
    classe_id: payload.classe_id,
    topico_id: entry.topico_id ?? null,
    conteudo_id: entry.conteudo_id ?? null,
    atividade_id: entry.atividade_id ?? null,
    item_key: entry.item_key ?? null,
    material_key: entry.material_key ?? null,
    material_tipo: entry.material_tipo ?? null,
    scope,
    visits: Math.max(0, Math.round(normalizeMetricNumber(entry.visits))),
    dwell_sec: normalizeMetricNumber(entry.dwell_sec),
    active_sec: normalizeMetricNumber(entry.active_sec),
    idle_sec: normalizeMetricNumber(entry.idle_sec),
    touch_count: Math.max(0, Math.round(normalizeMetricNumber(entry.touch_count))),
    scroll_distance_px: normalizeMetricNumber(entry.scroll_distance_px),
    max_depth_px: normalizeMetricNumber(entry.max_depth_px),
    captured_at: payload.captured_at,
    created_at: new Date().toISOString(),
  }));
}

function buildAllMetricRows(
  batchId: string,
  payload: TelemetryBatchPayload,
  alunoId: string
) {
  return [
    ...buildMetricRowsForScope({
      scope: "topic",
      entries: payload.time_metrics?.topics,
      batchId,
      payload,
      alunoId,
    }),
    ...buildMetricRowsForScope({
      scope: "content",
      entries: payload.time_metrics?.contents,
      batchId,
      payload,
      alunoId,
    }),
    ...buildMetricRowsForScope({
      scope: "activity",
      entries: payload.time_metrics?.activities,
      batchId,
      payload,
      alunoId,
    }),
    ...buildMetricRowsForScope({
      scope: "material",
      entries: payload.time_metrics?.materials,
      batchId,
      payload,
      alunoId,
    }),
  ];
}

async function persistTelemetryBatchDirect(payload: TelemetryBatchPayload) {
  const safePayload = sanitizeTelemetryPayload(payload);
  const session = await getSessionSafe();
  const alunoId = session?.user?.id ?? null;
  if (!alunoId) {
    throw new Error("Sem sessao ativa para persistir telemetria.");
  }

  const nowIso = new Date().toISOString();
  const shouldCloseSession =
    safePayload.flush_reason === "session_end" || safePayload.flush_reason === "app_background";
  const endedAt = shouldCloseSession ? safePayload.captured_at : null;

  const { error: sessionError } = await supabase.from("telemetria_sessoes").upsert(
    {
      id: safePayload.sessao_id,
      aluno_id: alunoId,
      classe_id: safePayload.classe_id,
      topico_inicial_id: safePayload.topico_id ?? null,
      camera_opt_in: safePayload.camera.enabled === true,
      started_at: safePayload.session_started_at,
      ended_at: endedAt,
      updated_at: nowIso,
    },
    { onConflict: "id" }
  );
  if (sessionError) throw sessionError;

  const batchId = buildUuid();
  const frameSent =
    safePayload.camera.enabled === true &&
    Array.isArray(safePayload.camera.frames) &&
    safePayload.camera.frames.length > 0;

  const { error: batchError } = await supabase.from("telemetria_lotes").insert({
    id: batchId,
    sessao_id: safePayload.sessao_id,
    aluno_id: alunoId,
    classe_id: safePayload.classe_id,
    topico_id: safePayload.topico_id ?? null,
    atividade_id: safePayload.atividade_id ?? null,
    conteudo_id: safePayload.conteudo_id ?? null,
    screen_name: safePayload.screen_name,
    route_name: safePayload.route_name,
    flush_reason: safePayload.flush_reason,
    captured_at: safePayload.captured_at,
    study_elapsed_sec: safePayload.study_elapsed_sec,
    screen_dwell_sec: safePayload.screen_dwell_sec,
    active_sec: safePayload.active_sec,
    idle_sec: safePayload.idle_sec,
    touch_count: safePayload.touch_count,
    scroll_distance_px: safePayload.scroll_distance_px,
    max_depth_px: safePayload.max_depth_px,
    frame_sent: frameSent,
    analysis_ciclo_id: null,
    payload: safePayload,
    created_at: nowIso,
  });
  if (batchError) throw batchError;

  const events = Array.isArray(safePayload.eventos_app) ? safePayload.eventos_app : [];
  if (events.length > 0) {
    const rows = events.map((event) => ({
      client_event_id: event.client_event_id,
      sessao_id: safePayload.sessao_id,
      aluno_id: alunoId,
      classe_id: safePayload.classe_id,
      topico_id: normalizePositiveInteger(event.topico_id) ?? safePayload.topico_id ?? null,
      conteudo_id: normalizePositiveInteger(event.conteudo_id) ?? safePayload.conteudo_id ?? null,
      atividade_id: normalizePositiveInteger(event.atividade_id) ?? safePayload.atividade_id ?? null,
      questao_id: normalizePositiveInteger(event.questao_id) ?? null,
      item_key: event.item_key ?? safePayload.item_key ?? null,
      screen_name: event.screen_name ?? safePayload.screen_name,
      route_name: event.route_name ?? safePayload.route_name,
      event_group: event.event_group,
      event_name: event.event_name,
      event_source: event.event_source ?? "mobile_app",
      occurred_at: event.occurred_at,
      time_since_prev_sec:
        event.time_since_prev_sec == null
          ? null
          : normalizeNonNegativeNumber(event.time_since_prev_sec),
      attempt_number: normalizePositiveInteger(event.attempt_number) ?? null,
      is_correct: event.is_correct ?? null,
      chat_role: event.chat_role ?? null,
      trigger_context: event.trigger_context ?? null,
      payload: event.payload ?? {},
      created_at: nowIso,
    }));

    const { error: eventsError } = await supabase
      .from("telemetria_eventos_app")
      .upsert(rows, { onConflict: "sessao_id,client_event_id" });
    if (eventsError) throw eventsError;
  }

  const metricRows = buildAllMetricRows(batchId, safePayload, alunoId);
  if (metricRows.length > 0) {
    const { error: metricsError } = await supabase
      .from("telemetria_time_metric_entries")
      .insert(metricRows);

    if (metricsError) {
      const rawMessage = String((metricsError as any)?.message ?? "").toLowerCase();
      const missingTable =
        String((metricsError as any)?.code ?? "") === "42P01" ||
        rawMessage.includes("telemetria_time_metric_entries");

      if (!missingTable) {
        console.warn(
          "[telemetriaApi] Falha ao persistir metricas granulares:",
          metricsError
        );
      }
    }
  }

  return buildFallbackResponse(batchId, safePayload);
}

export async function enviarLoteTelemetria(payload: TelemetryBatchPayload) {
  const safePayload = sanitizeTelemetryPayload(payload);
  const urls = buildUrls("/api/v1/telemetria/lotes");
  if (!urls.length) {
    return persistTelemetryBatchDirect(safePayload);
  }

  let lastNetworkError: unknown = null;

  for (const url of urls) {
    try {
      const headers = await getAuthHeaders();
      const response = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(safePayload),
      });

      return await parseResponse<TelemetryBatchResponse>(response);
    } catch (error) {
      if (isNetworkRequestFailedError(error)) {
        lastNetworkError = error;
        continue;
      }

      try {
        return persistTelemetryBatchDirect(safePayload);
      } catch {
        throw error;
      }
    }
  }

  try {
    return persistTelemetryBatchDirect(safePayload);
  } catch (persistError) {
    if (!lastNetworkError) {
      throw persistError;
    }

    if (persistError instanceof Error) {
      throw persistError;
    }

    throw new Error(String(lastNetworkError));
  }
}
