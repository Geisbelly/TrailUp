import { IATriggerSignalType } from "@/interfaces/personalizacao/IAContracts";

export type TelemetryFlushReason =
  | "interval"
  | "screen_blur"
  | "app_background"
  | "activity_complete"
  | "topic_complete"
  | "session_end";

export type TelemetryTouchTarget = "content" | "activity" | "modal" | "screen";
export type TelemetryStudyState = "active" | "idle";
export type TelemetryAppEventGroup =
  | "session"
  | "navigation"
  | "interaction"
  | "performance"
  | "chat";
export type TelemetryChatRole = "user" | "assistant";
export type TelemetryTriggerContext =
  | "before_error"
  | "after_error"
  | "after_timeout"
  | "after_completion"
  | "on_demand"
  | "unknown";

export type TelemetryTimeMetricEntry = {
  key: string;
  topico_id?: number | null;
  conteudo_id?: number | null;
  atividade_id?: number | null;
  item_key?: string | null;
  material_key?: string | null;
  material_tipo?: string | null;
  visits: number;
  dwell_sec: number;
  active_sec: number;
  idle_sec: number;
  touch_count: number;
  scroll_distance_px: number;
  max_depth_px: number;
};

export type TelemetryTimeMetrics = {
  general: {
    session_elapsed_sec: number;
    batch_dwell_sec: number;
    batch_active_sec: number;
    batch_idle_sec: number;
    touch_count: number;
    scroll_distance_px: number;
    max_depth_px: number;
  };
  topics: TelemetryTimeMetricEntry[];
  contents: TelemetryTimeMetricEntry[];
  activities: TelemetryTimeMetricEntry[];
  materials: TelemetryTimeMetricEntry[];
};

export type TelemetrySignalPayload = {
  type: IATriggerSignalType;
  timestamp: number;
  topico_id?: number | null;
  atividade_id?: number | null;
  conteudo_id?: number | null;
  item_key?: string | null;
  meta?: Record<string, unknown>;
};

export type TelemetryTouchSample = {
  t_offset_ms: number;
  x_pct: number;
  y_pct: number;
  target: TelemetryTouchTarget;
};

export type TelemetryCameraFrame = {
  captured_at: string;
  frame_mime: "image/jpeg";
  frame_b64: string;
};

export type TelemetryCameraPayload = {
  enabled: boolean;
  frame_mime?: "image/jpeg";
  frame_b64?: string;
  frames?: TelemetryCameraFrame[];
};

export type TelemetryAppEventPayload = {
  client_event_id: string;
  topico_id?: number | null;
  conteudo_id?: number | null;
  atividade_id?: number | null;
  questao_id?: number | null;
  item_key?: string | null;
  screen_name?: string | null;
  route_name?: string | null;
  event_group: TelemetryAppEventGroup;
  event_name: string;
  event_source?: string;
  occurred_at: string;
  time_since_prev_sec?: number | null;
  attempt_number?: number | null;
  is_correct?: boolean | null;
  chat_role?: TelemetryChatRole | null;
  trigger_context?: TelemetryTriggerContext | null;
  payload?: Record<string, unknown>;
};

export type TelemetryBatchPayload = {
  sessao_id: string;
  classe_id: number;
  topico_id?: number | null;
  atividade_id?: number | null;
  conteudo_id?: number | null;
  item_key?: string | null;
  screen_name: string;
  route_name: string;
  flush_reason: TelemetryFlushReason;
  captured_at: string;
  session_started_at: string;
  study_elapsed_sec: number;
  screen_dwell_sec: number;
  active_sec: number;
  idle_sec: number;
  touch_count: number;
  scroll_distance_px: number;
  max_depth_px: number;
  time_metrics: TelemetryTimeMetrics;
  signals: TelemetrySignalPayload[];
  eventos_app: TelemetryAppEventPayload[];
  touch_samples: TelemetryTouchSample[];
  camera: TelemetryCameraPayload;
};

export type TelemetryAnalysisResponse = {
  ciclo_id: string | null;
  emocao_atual?: Record<string, unknown> | null;
  ui_config?: Record<string, unknown> | null;
  acoes_aplicadas: string[];
  erros: string[];
};

export type TelemetryBatchResponse = {
  batch_id: string;
  sessao_id: string;
  persisted: boolean;
  normalized_events: string[];
  analysis: TelemetryAnalysisResponse;
};

export type BeginStudySessionParams = {
  classeId: number;
  topicoId: number;
  topicoInicialId?: number | null;
  screenName: string;
  routeName: string;
};

export type UpdateStudyContextParams = {
  topicoId?: number | null;
  atividadeId?: number | null;
  conteudoId?: number | null;
  itemKey?: string | null;
  materialKey?: string | null;
  materialType?: string | null;
  target?: TelemetryTouchTarget;
  studyState?: TelemetryStudyState;
};

export type ScrollTelemetryMetrics = {
  y: number;
};
