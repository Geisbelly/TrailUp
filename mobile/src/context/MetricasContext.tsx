import { useIA } from "@/context/IAContext";
import { IATriggerSignal } from "@/interfaces/personalizacao/IAContracts";
import {
  BeginStudySessionParams,
  TelemetryAppEventGroup,
  TelemetryAppEventPayload,
  TelemetryBatchPayload,
  ScrollTelemetryMetrics,
  TelemetryBatchResponse,
  TelemetryCameraFrame,
  TelemetryChatRole,
  TelemetryFlushReason,
  TelemetrySignalPayload,
  TelemetryStudyState,
  TelemetryTimeMetrics,
  TelemetryTriggerContext,
  TelemetryTouchSample,
  TelemetryTouchTarget,
  UpdateStudyContextParams,
} from "@/interfaces/telemetria/TelemetryContracts";
import {
  enviarLoteTelemetria,
} from "@/services/telemetriaApi";
import {
  DEFAULT_TELEMETRY_PREFERENCES,
  getTelemetryConsentRecord,
  subscribeTelemetryConsentChanges,
  setTelemetryConsentAccepted,
  setTelemetryConsentPreferences,
  type TelemetryConsentRecord,
  type TelemetryConsentPreferences,
  type TelemetryConsentStatus,
} from "@/utils/telemetryConsent";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AppState, Platform, StyleSheet, View } from "react-native";

type CameraPermissionState = "unknown" | "granted" | "denied" | "unavailable";

type SessionDescriptor = BeginStudySessionParams & {
  sessionId: string;
  sessionStartedAt: string;
};

type TimeMetricEntryAccumulator = {
  key: string;
  topicoId: number | null;
  conteudoId: number | null;
  atividadeId: number | null;
  itemKey: string | null;
  materialKey: string | null;
  materialType: string | null;
  visits: number;
  dwellMs: number;
  activeMs: number;
  idleMs: number;
  touchCount: number;
  scrollDistancePx: number;
  maxDepthPx: number;
};

type TimeMetricsAccumulator = {
  topics: Record<string, TimeMetricEntryAccumulator>;
  contents: Record<string, TimeMetricEntryAccumulator>;
  activities: Record<string, TimeMetricEntryAccumulator>;
  materials: Record<string, TimeMetricEntryAccumulator>;
};

type BatchAccumulator = {
  batchStartedAtMs: number;
  lastAccruedAtMs: number;
  lastInteractionAtMs: number;
  generalActiveMs: number;
  generalIdleMs: number;
  touchCount: number;
  touchSamples: TelemetryTouchSample[];
  signals: TelemetrySignalPayload[];
  appEvents: TelemetryAppEventPayload[];
  scrollDistancePx: number;
  maxDepthPx: number;
  lastScrollY: number | null;
  cameraFrames: TelemetryCameraFrame[];
  timeMetrics: TimeMetricsAccumulator;
};

type CurrentStudyContext = {
  topicoId: number | null;
  atividadeId: number | null;
  conteudoId: number | null;
  itemKey: string | null;
  materialKey: string | null;
  materialType: string | null;
  target: TelemetryTouchTarget;
  studyState: TelemetryStudyState;
};

type MetricasContextValue = {
  beginStudySession: (params: BeginStudySessionParams) => Promise<void>;
  updateStudyContext: (params: UpdateStudyContextParams) => void;
  endStudySession: (reason: TelemetryFlushReason) => Promise<void>;
  flushStudyBatch: (reason: TelemetryFlushReason) => Promise<TelemetryBatchResponse | null>;
  recordTouchSample: (sample: {
    x_pct: number;
    y_pct: number;
    target?: TelemetryTouchTarget;
  }) => void;
  recordScroll: (metrics: ScrollTelemetryMetrics) => void;
  recordAppEvent: (event: {
    eventGroup: TelemetryAppEventGroup;
    eventName: string;
    topicoId?: number | null;
    conteudoId?: number | null;
    atividadeId?: number | null;
    questaoId?: number | null;
    itemKey?: string | null;
    chatRole?: TelemetryChatRole | null;
    triggerContext?: TelemetryTriggerContext | null;
    attemptNumber?: number | null;
    isCorrect?: boolean | null;
    occurredAt?: number | string | Date | null;
    payload?: Record<string, unknown>;
  }) => void;
  setCameraOptIn: (enabled: boolean) => Promise<boolean>;
  telemetryPreferences: TelemetryConsentPreferences;
  setTelemetryPreference: (
    key: keyof TelemetryConsentPreferences,
    enabled: boolean
  ) => Promise<void>;
  lastAnalysis: TelemetryBatchResponse["analysis"] | null;
  cameraOptIn: boolean;
  cameraPermission: CameraPermissionState;
};

type MetricasBatchContextValue = {
  lastBatchTimeMetrics: TelemetryTimeMetrics | null;
};

const IDLE_THRESHOLD_MS = 15_000;
const MAX_TOUCH_SAMPLES = 25;
const TOUCH_SAMPLE_THROTTLE_MS = 750;
// Flush periodico da telemetria. Reduzido de 180s -> 60s para capturar
// sessoes curtas (a maioria nao chega a 3 min numa tela), garantindo analise
// com mais regularidade. Flushes por evento (screen_blur, activity_complete)
// continuam complementando.
const BATCH_INTERVAL_MS = 60_000;
const FRAME_CAPTURE_INTERVAL_MS = 6_000;
const MAX_CAMERA_FRAMES_PER_BATCH = 30;

const EMPTY_STUDY_CONTEXT: CurrentStudyContext = {
  topicoId: null,
  atividadeId: null,
  conteudoId: null,
  itemKey: null,
  materialKey: null,
  materialType: null,
  target: "screen",
  studyState: "idle",
};

const cameraModule =
  Platform.OS !== "web"
    ? (() => {
        try {
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          return require("expo-camera");
        } catch {
          return null;
        }
      })()
    : null;

const CameraView = cameraModule?.CameraView ?? cameraModule?.Camera ?? null;
const requestCameraPermissionsAsync =
  cameraModule?.requestCameraPermissionsAsync ??
  cameraModule?.Camera?.requestCameraPermissionsAsync ??
  null;
const getCameraPermissionsAsync =
  cameraModule?.getCameraPermissionsAsync ??
  cameraModule?.Camera?.getCameraPermissionsAsync ??
  null;

const MetricasContext = createContext<MetricasContextValue | null>(null);
const MetricasBatchContext = createContext<MetricasBatchContextValue | null>(null);

export function useMetricasBatch(): MetricasBatchContextValue {
  const ctx = useContext(MetricasBatchContext);
  if (!ctx) throw new Error("useMetricasBatch deve ser usado dentro de MetricasProvider");
  return ctx;
}

function isEventGroupAllowed(
  eventGroup: TelemetryAppEventGroup,
  preferences: TelemetryConsentPreferences
) {
  if (eventGroup === "session" || eventGroup === "navigation" || eventGroup === "interaction") {
    return preferences.usageEnabled;
  }
  if (eventGroup === "performance") {
    return preferences.performanceEnabled;
  }
  if (eventGroup === "chat") {
    return preferences.chatEnabled;
  }
  return false;
}

function sameTelemetryPreferences(
  left: TelemetryConsentPreferences,
  right: TelemetryConsentPreferences
) {
  return (
    left.cameraEnabled === right.cameraEnabled &&
    left.usageEnabled === right.usageEnabled &&
    left.performanceEnabled === right.performanceEnabled &&
    left.chatEnabled === right.chatEnabled
  );
}

function inferChatTriggerContextFromBatch(batch: BatchAccumulator): TelemetryTriggerContext {
  for (let i = batch.appEvents.length - 1; i >= 0; i -= 1) {
    const event = batch.appEvents[i];
    if (event.event_group !== "performance") continue;
    if (event.event_name === "question_wrong") return "after_error";

    if (
      event.event_name === "question_attempt" &&
      event.payload &&
      typeof event.payload === "object" &&
      (event.payload as Record<string, unknown>).timed_out === true
    ) {
      return "after_timeout";
    }

    if (
      (event.event_name === "question_correct" || event.event_name === "question_attempt") &&
      event.payload &&
      typeof event.payload === "object" &&
      (event.payload as Record<string, unknown>).completed === true
    ) {
      return "after_completion";
    }
  }

  return "on_demand";
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

function buildEmptyBatch(nowMs: number): BatchAccumulator {
  return {
    batchStartedAtMs: nowMs,
    lastAccruedAtMs: nowMs,
    lastInteractionAtMs: nowMs,
    generalActiveMs: 0,
    generalIdleMs: 0,
    touchCount: 0,
    touchSamples: [],
    signals: [],
    appEvents: [],
    scrollDistancePx: 0,
    maxDepthPx: 0,
    lastScrollY: null,
    cameraFrames: [],
    timeMetrics: {
      topics: {},
      contents: {},
      activities: {},
      materials: {},
    },
  };
}

function clamp01(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function resolveEventTimestampMs(value?: number | string | Date | null) {
  if (value == null) return Date.now();
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return Number.isFinite(value) ? value : Date.now();
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : Date.now();
}

function buildTimeMetricEntry(seed: {
  key: string;
  topicoId?: number | null;
  conteudoId?: number | null;
  atividadeId?: number | null;
  itemKey?: string | null;
  materialKey?: string | null;
  materialType?: string | null;
}): TimeMetricEntryAccumulator {
  return {
    key: seed.key,
    topicoId: seed.topicoId ?? null,
    conteudoId: seed.conteudoId ?? null,
    atividadeId: seed.atividadeId ?? null,
    itemKey: seed.itemKey ?? null,
    materialKey: seed.materialKey ?? null,
    materialType: seed.materialType ?? null,
    visits: 0,
    dwellMs: 0,
    activeMs: 0,
    idleMs: 0,
    touchCount: 0,
    scrollDistancePx: 0,
    maxDepthPx: 0,
  };
}

function getOrCreateTimeMetricEntry(
  collection: Record<string, TimeMetricEntryAccumulator>,
  seed: {
    key: string;
    topicoId?: number | null;
    conteudoId?: number | null;
    atividadeId?: number | null;
    itemKey?: string | null;
    materialKey?: string | null;
    materialType?: string | null;
  }
) {
  const existing = collection[seed.key];
  if (existing) {
    if (seed.itemKey != null) existing.itemKey = seed.itemKey;
    if (seed.materialKey != null) existing.materialKey = seed.materialKey;
    if (seed.materialType != null) existing.materialType = seed.materialType;
    if (seed.topicoId != null) existing.topicoId = seed.topicoId;
    if (seed.conteudoId != null) existing.conteudoId = seed.conteudoId;
    if (seed.atividadeId != null) existing.atividadeId = seed.atividadeId;
    return existing;
  }

  const created = buildTimeMetricEntry(seed);
  collection[seed.key] = created;
  return created;
}

function accumulateEntryTime(entry: TimeMetricEntryAccumulator, activeMs: number, idleMs: number) {
  const dwellMs = Math.max(0, activeMs + idleMs);
  entry.dwellMs += dwellMs;
  entry.activeMs += Math.max(0, activeMs);
  entry.idleMs += Math.max(0, idleMs);
}

function accumulateContextTime(
  batch: BatchAccumulator,
  context: CurrentStudyContext,
  activeMs: number,
  idleMs: number
) {
  if (context.studyState !== "active") {
    return;
  }

  if (context.topicoId != null) {
    accumulateEntryTime(
      getOrCreateTimeMetricEntry(batch.timeMetrics.topics, {
        key: `topic:${context.topicoId}`,
        topicoId: context.topicoId,
      }),
      activeMs,
      idleMs
    );
  }

  if (context.conteudoId != null) {
    accumulateEntryTime(
      getOrCreateTimeMetricEntry(batch.timeMetrics.contents, {
        key: `content:${context.conteudoId}`,
        topicoId: context.topicoId,
        conteudoId: context.conteudoId,
        itemKey: context.itemKey,
      }),
      activeMs,
      idleMs
    );
  }

  if (context.atividadeId != null) {
    accumulateEntryTime(
      getOrCreateTimeMetricEntry(batch.timeMetrics.activities, {
        key: `activity:${context.atividadeId}`,
        topicoId: context.topicoId,
        conteudoId: context.conteudoId,
        atividadeId: context.atividadeId,
        itemKey: context.itemKey,
      }),
      activeMs,
      idleMs
    );
  }

  if (context.materialKey) {
    accumulateEntryTime(
      getOrCreateTimeMetricEntry(batch.timeMetrics.materials, {
        key: context.materialKey,
        topicoId: context.topicoId,
        conteudoId: context.conteudoId,
        atividadeId: context.atividadeId,
        itemKey: context.itemKey,
        materialKey: context.materialKey,
        materialType: context.materialType,
      }),
      activeMs,
      idleMs
    );
  }
}

function markContextVisit(
  batch: BatchAccumulator,
  previous: CurrentStudyContext,
  next: CurrentStudyContext
) {
  if (next.studyState !== "active") {
    return;
  }

  if (next.topicoId != null && next.topicoId !== previous.topicoId) {
    getOrCreateTimeMetricEntry(batch.timeMetrics.topics, {
      key: `topic:${next.topicoId}`,
      topicoId: next.topicoId,
    }).visits += 1;
  }

  if (next.conteudoId != null && next.conteudoId !== previous.conteudoId) {
    getOrCreateTimeMetricEntry(batch.timeMetrics.contents, {
      key: `content:${next.conteudoId}`,
      topicoId: next.topicoId,
      conteudoId: next.conteudoId,
      itemKey: next.itemKey,
    }).visits += 1;
  }

  if (next.atividadeId != null && next.atividadeId !== previous.atividadeId) {
    getOrCreateTimeMetricEntry(batch.timeMetrics.activities, {
      key: `activity:${next.atividadeId}`,
      topicoId: next.topicoId,
      conteudoId: next.conteudoId,
      atividadeId: next.atividadeId,
      itemKey: next.itemKey,
    }).visits += 1;
  }

  if (next.materialKey && next.materialKey !== previous.materialKey) {
    getOrCreateTimeMetricEntry(batch.timeMetrics.materials, {
      key: next.materialKey,
      topicoId: next.topicoId,
      conteudoId: next.conteudoId,
      atividadeId: next.atividadeId,
      itemKey: next.itemKey,
      materialKey: next.materialKey,
      materialType: next.materialType,
    }).visits += 1;
  }
}

function registerContextTouch(batch: BatchAccumulator, context: CurrentStudyContext) {
  if (context.studyState !== "active") {
    return;
  }

  if (context.topicoId != null) {
    getOrCreateTimeMetricEntry(batch.timeMetrics.topics, {
      key: `topic:${context.topicoId}`,
      topicoId: context.topicoId,
    }).touchCount += 1;
  }

  if (context.conteudoId != null) {
    getOrCreateTimeMetricEntry(batch.timeMetrics.contents, {
      key: `content:${context.conteudoId}`,
      topicoId: context.topicoId,
      conteudoId: context.conteudoId,
      itemKey: context.itemKey,
    }).touchCount += 1;
  }

  if (context.atividadeId != null) {
    getOrCreateTimeMetricEntry(batch.timeMetrics.activities, {
      key: `activity:${context.atividadeId}`,
      topicoId: context.topicoId,
      conteudoId: context.conteudoId,
      atividadeId: context.atividadeId,
      itemKey: context.itemKey,
    }).touchCount += 1;
  }

  if (context.materialKey) {
    getOrCreateTimeMetricEntry(batch.timeMetrics.materials, {
      key: context.materialKey,
      topicoId: context.topicoId,
      conteudoId: context.conteudoId,
      atividadeId: context.atividadeId,
      itemKey: context.itemKey,
      materialKey: context.materialKey,
      materialType: context.materialType,
    }).touchCount += 1;
  }
}

function registerContextScroll(
  batch: BatchAccumulator,
  context: CurrentStudyContext,
  deltaY: number,
  depthY: number
) {
  if (context.studyState !== "active") {
    return;
  }

  if (context.topicoId != null) {
    const entry = getOrCreateTimeMetricEntry(batch.timeMetrics.topics, {
      key: `topic:${context.topicoId}`,
      topicoId: context.topicoId,
    });
    entry.scrollDistancePx += deltaY;
    entry.maxDepthPx = Math.max(entry.maxDepthPx, depthY);
  }

  if (context.conteudoId != null) {
    const entry = getOrCreateTimeMetricEntry(batch.timeMetrics.contents, {
      key: `content:${context.conteudoId}`,
      topicoId: context.topicoId,
      conteudoId: context.conteudoId,
      itemKey: context.itemKey,
    });
    entry.scrollDistancePx += deltaY;
    entry.maxDepthPx = Math.max(entry.maxDepthPx, depthY);
  }

  if (context.atividadeId != null) {
    const entry = getOrCreateTimeMetricEntry(batch.timeMetrics.activities, {
      key: `activity:${context.atividadeId}`,
      topicoId: context.topicoId,
      conteudoId: context.conteudoId,
      atividadeId: context.atividadeId,
      itemKey: context.itemKey,
    });
    entry.scrollDistancePx += deltaY;
    entry.maxDepthPx = Math.max(entry.maxDepthPx, depthY);
  }

  if (context.materialKey) {
    const entry = getOrCreateTimeMetricEntry(batch.timeMetrics.materials, {
      key: context.materialKey,
      topicoId: context.topicoId,
      conteudoId: context.conteudoId,
      atividadeId: context.atividadeId,
      itemKey: context.itemKey,
      materialKey: context.materialKey,
      materialType: context.materialType,
    });
    entry.scrollDistancePx += deltaY;
    entry.maxDepthPx = Math.max(entry.maxDepthPx, depthY);
  }
}

function roundSeconds(ms: number) {
  return Math.max(0, Math.round(ms / 1000));
}

function serializeTimeMetricEntries(collection: Record<string, TimeMetricEntryAccumulator>) {
  return Object.values(collection)
    .map((entry) => ({
      key: entry.key,
      topico_id: entry.topicoId,
      conteudo_id: entry.conteudoId,
      atividade_id: entry.atividadeId,
      item_key: entry.itemKey,
      material_key: entry.materialKey,
      material_tipo: entry.materialType,
      visits: entry.visits,
      dwell_sec: roundSeconds(entry.dwellMs),
      active_sec: roundSeconds(entry.activeMs),
      idle_sec: roundSeconds(entry.idleMs),
      touch_count: entry.touchCount,
      scroll_distance_px: Math.round(entry.scrollDistancePx),
      max_depth_px: Math.round(entry.maxDepthPx),
    }))
    .sort((left, right) => {
      if (right.active_sec !== left.active_sec) {
        return right.active_sec - left.active_sec;
      }
      return left.key.localeCompare(right.key);
    });
}

function buildTimeMetricsSnapshot(
  session: SessionDescriptor,
  batch: BatchAccumulator,
  nowMs: number
): TelemetryTimeMetrics {
  const screenDwellSec = Math.max(
    0,
    Math.round((nowMs - batch.batchStartedAtMs) / 1000)
  );
  const idleSec = Math.min(screenDwellSec, roundSeconds(batch.generalIdleMs));
  const activeSec = Math.min(
    screenDwellSec,
    Math.max(0, roundSeconds(batch.generalActiveMs))
  );
  const studyElapsedSec = Math.max(
    0,
    Math.round((nowMs - new Date(session.sessionStartedAt).getTime()) / 1000)
  );

  return {
    general: {
      session_elapsed_sec: studyElapsedSec,
      batch_dwell_sec: screenDwellSec,
      batch_active_sec: activeSec,
      batch_idle_sec: idleSec,
      touch_count: batch.touchCount,
      scroll_distance_px: Math.round(batch.scrollDistancePx),
      max_depth_px: Math.round(batch.maxDepthPx),
    },
    topics: serializeTimeMetricEntries(batch.timeMetrics.topics),
    contents: serializeTimeMetricEntries(batch.timeMetrics.contents),
    activities: serializeTimeMetricEntries(batch.timeMetrics.activities),
    materials: serializeTimeMetricEntries(batch.timeMetrics.materials),
  };
}

function buildDisabledUsageTimeMetrics(): TelemetryTimeMetrics {
  return {
    general: {
      session_elapsed_sec: 0,
      batch_dwell_sec: 0,
      batch_active_sec: 0,
      batch_idle_sec: 0,
      touch_count: 0,
      scroll_distance_px: 0,
      max_depth_px: 0,
    },
    topics: [],
    contents: [],
    activities: [],
    materials: [],
  };
}

function mapSignal(signal: IATriggerSignal): TelemetrySignalPayload {
  const meta =
    signal.meta && typeof signal.meta === "object"
      ? (signal.meta as Record<string, unknown>)
      : {};

  return {
    type: signal.type,
    timestamp: signal.timestamp ?? Date.now(),
    topico_id: signal.topicoId ?? null,
    atividade_id: signal.activityId ?? null,
    conteudo_id: signal.contentId ?? null,
    item_key: signal.itemKey ?? null,
    meta,
  };
}

export function MetricasProvider({ children }: { children: React.ReactNode }) {
  const { subscribeToSignals } = useIA();
  const [lastAnalysis, setLastAnalysis] = useState<TelemetryBatchResponse["analysis"] | null>(null);
  const [lastBatchTimeMetrics, setLastBatchTimeMetrics] = useState<TelemetryTimeMetrics | null>(null);
  const [cameraOptIn, setCameraOptInState] = useState(false);
  const [cameraPermission, setCameraPermission] = useState<CameraPermissionState>(
    Platform.OS === "web" || !CameraView ? "unavailable" : "unknown"
  );
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [telemetryConsentStatus, setTelemetryConsentStatus] = useState<TelemetryConsentStatus | null>(null);
  const [telemetryPreferences, setTelemetryPreferencesState] = useState<TelemetryConsentPreferences>(
    DEFAULT_TELEMETRY_PREFERENCES
  );

  const sessionRef = useRef<SessionDescriptor | null>(null);
  const batchRef = useRef<BatchAccumulator | null>(null);
  const currentContextRef = useRef<CurrentStudyContext>({ ...EMPTY_STUDY_CONTEXT });
  const wrongStreaksRef = useRef<Record<string, number>>({});
  const lastTouchSampleAtRef = useRef(0);
  const lastAppEventAtRef = useRef<number | null>(null);
  const seenTopicIdsRef = useRef<Set<number>>(new Set());
  const seenContentIdsRef = useRef<Set<number>>(new Set());
  const flushTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const flushStudyBatchRef = useRef<
    ((reason: TelemetryFlushReason) => Promise<TelemetryBatchResponse | null>) | null
  >(null);
  const lastFlushErrorAtRef = useRef(0);
  const appStateRef = useRef(AppState.currentState);
  const resumeDescriptorRef = useRef<BeginStudySessionParams | null>(null);
  const captureRef = useRef<any>(null);
  const frameCaptureTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isCapturingFrameRef = useRef(false);

  const applyConsentRecord = useCallback((record: TelemetryConsentRecord | null) => {
    const status = record?.status ?? null;
    const preferences = record?.preferences ?? DEFAULT_TELEMETRY_PREFERENCES;
    const granted = record?.cameraPermissionGranted === true;
    const nextCameraOptIn = status === "accepted" && granted && preferences.cameraEnabled;

    setTelemetryConsentStatus((prev) => (prev === status ? prev : status));
    setTelemetryPreferencesState((prev) =>
      sameTelemetryPreferences(prev, preferences) ? prev : preferences
    );
    setCameraOptInState((prev) => (prev === nextCameraOptIn ? prev : nextCameraOptIn));

    return {
      status,
      cameraPermissionGranted: status === "accepted" ? granted : false,
      preferences,
      record,
    };
  }, []);

  const loadConsentState = useCallback(async () => {
    const record = await getTelemetryConsentRecord();
    return applyConsentRecord(record);
  }, [applyConsentRecord]);

  const syncBatchTimeline = useCallback((atMs: number) => {
    const batch = batchRef.current;
    if (!batch) return;

    const startMs = batch.lastAccruedAtMs;
    const endMs = Math.max(atMs, startMs);
    const deltaMs = endMs - startMs;
    if (deltaMs <= 0) {
      batch.lastAccruedAtMs = endMs;
      return;
    }

    const idleStartsAt = batch.lastInteractionAtMs + IDLE_THRESHOLD_MS;
    const activeUntil = Math.min(endMs, idleStartsAt);
    const activeMs = Math.max(0, activeUntil - startMs);
    const idleMs = Math.max(0, endMs - Math.max(startMs, idleStartsAt));
    const currentContext = currentContextRef.current;

    batch.generalActiveMs += activeMs;
    batch.generalIdleMs += idleMs;

    if (currentContext.studyState === "active") {
      accumulateContextTime(batch, currentContext, activeMs, idleMs);
    }
    batch.lastAccruedAtMs = endMs;
  }, []);

  const trackInteraction = useCallback((atMs: number) => {
    syncBatchTimeline(atMs);
    const batch = batchRef.current;
    if (!batch) return;
    batch.lastInteractionAtMs = atMs;
  }, [syncBatchTimeline]);

  const resetFlushTimer = useCallback(() => {
    if (flushTimerRef.current) {
      clearInterval(flushTimerRef.current);
      flushTimerRef.current = null;
    }

    if (!sessionRef.current) return;

    flushTimerRef.current = setInterval(() => {
      void flushStudyBatchRef.current?.("interval");
    }, BATCH_INTERVAL_MS);
  }, []);

  const stopFrameCaptureTimer = useCallback(() => {
    if (frameCaptureTimerRef.current) {
      clearInterval(frameCaptureTimerRef.current);
      frameCaptureTimerRef.current = null;
    }
  }, []);

  const captureFrameSample = useCallback(async () => {
    if (
      Platform.OS === "web" ||
      telemetryConsentStatus !== "accepted" ||
      !telemetryPreferences.cameraEnabled ||
      !cameraOptIn ||
      cameraPermission !== "granted" ||
      !captureRef.current?.takePictureAsync ||
      isCapturingFrameRef.current
    ) {
      return null;
    }

    const batch = batchRef.current;
    if (!batch || batch.cameraFrames.length >= MAX_CAMERA_FRAMES_PER_BATCH) {
      return null;
    }

    try {
      isCapturingFrameRef.current = true;
      const picture = await captureRef.current.takePictureAsync({
        base64: true,
        quality: 0.35,
        skipProcessing: true,
        shutterSound: false,
      });

      if (!picture?.base64) {
        return null;
      }

      const frame: TelemetryCameraFrame = {
        captured_at: new Date().toISOString(),
        frame_mime: "image/jpeg" as const,
        frame_b64: picture.base64,
      };
      batch.cameraFrames.push(frame);
      return frame;
    } catch {
      return null;
    } finally {
      isCapturingFrameRef.current = false;
    }
  }, [cameraOptIn, cameraPermission, telemetryConsentStatus, telemetryPreferences.cameraEnabled]);

  const resetFrameCaptureTimer = useCallback(() => {
    stopFrameCaptureTimer();

    if (
      !sessionRef.current ||
      telemetryConsentStatus !== "accepted" ||
      Platform.OS === "web" ||
      !telemetryPreferences.cameraEnabled ||
      !cameraOptIn ||
      cameraPermission !== "granted"
    ) {
      return;
    }

    frameCaptureTimerRef.current = setInterval(() => {
      void captureFrameSample();
    }, FRAME_CAPTURE_INTERVAL_MS);

    void captureFrameSample();
  }, [
    cameraOptIn,
    cameraPermission,
    captureFrameSample,
    stopFrameCaptureTimer,
    telemetryConsentStatus,
    telemetryPreferences.cameraEnabled,
  ]);

  const recordAppEvent = useCallback(
    (event: {
      eventGroup: TelemetryAppEventGroup;
      eventName: string;
      topicoId?: number | null;
      conteudoId?: number | null;
      atividadeId?: number | null;
      questaoId?: number | null;
      itemKey?: string | null;
      chatRole?: TelemetryChatRole | null;
      triggerContext?: TelemetryTriggerContext | null;
      attemptNumber?: number | null;
      isCorrect?: boolean | null;
      occurredAt?: number | string | Date | null;
      payload?: Record<string, unknown>;
    }) => {
      const session = sessionRef.current;
      const batch = batchRef.current;
      if (!session || !batch) return;
      if (!isEventGroupAllowed(event.eventGroup, telemetryPreferences)) return;

      const occurredAtMs = resolveEventTimestampMs(event.occurredAt);
      if (telemetryPreferences.usageEnabled) {
        syncBatchTimeline(occurredAtMs);
      }

      const previousEventAt = lastAppEventAtRef.current;
      const context = currentContextRef.current;
      const resolvedTriggerContext =
        event.eventGroup === "chat"
          ? event.triggerContext ?? inferChatTriggerContextFromBatch(batch)
          : event.triggerContext ?? null;

      batch.appEvents.push({
        client_event_id: buildUuid(),
        topico_id: event.topicoId ?? context.topicoId ?? session.topicoId ?? null,
        conteudo_id: event.conteudoId ?? context.conteudoId ?? null,
        atividade_id: event.atividadeId ?? context.atividadeId ?? null,
        questao_id: event.questaoId ?? null,
        item_key: event.itemKey ?? context.itemKey ?? null,
        screen_name: session.screenName,
        route_name: session.routeName,
        event_group: event.eventGroup,
        event_name: event.eventName,
        event_source: "mobile_app",
        occurred_at: new Date(occurredAtMs).toISOString(),
        time_since_prev_sec:
          previousEventAt == null ? null : Math.max(0, (occurredAtMs - previousEventAt) / 1000),
        attempt_number: event.attemptNumber ?? null,
        is_correct: event.isCorrect ?? null,
        chat_role: event.chatRole ?? null,
        trigger_context: resolvedTriggerContext,
        payload: event.payload ?? {},
      });

      lastAppEventAtRef.current = occurredAtMs;
    },
    [syncBatchTimeline, telemetryPreferences]
  );

  const updateStudyContext = useCallback((params: UpdateStudyContextParams) => {
    const previousContext = currentContextRef.current;
    if (telemetryPreferences.usageEnabled) {
      syncBatchTimeline(Date.now());
    }

    const nextContext: CurrentStudyContext = {
      topicoId: params.topicoId ?? previousContext.topicoId ?? null,
      atividadeId:
        params.studyState === "idle"
          ? null
          : params.atividadeId !== undefined
          ? params.atividadeId
          : previousContext.atividadeId ?? null,
      conteudoId:
        params.studyState === "idle"
          ? null
          : params.conteudoId !== undefined
          ? params.conteudoId
          : previousContext.conteudoId ?? null,
      itemKey:
        params.studyState === "idle"
          ? null
          : params.itemKey !== undefined
          ? params.itemKey
          : previousContext.itemKey ?? null,
      materialKey:
        params.studyState === "idle"
          ? null
          : params.materialKey !== undefined
          ? params.materialKey
          : previousContext.materialKey ?? null,
      materialType:
        params.studyState === "idle"
          ? null
          : params.materialType !== undefined
          ? params.materialType
          : previousContext.materialType ?? null,
      target: params.target ?? previousContext.target ?? "screen",
      studyState:
        params.studyState ??
        (params.atividadeId != null || params.conteudoId != null || params.itemKey != null
          ? "active"
          : previousContext.studyState ?? "idle"),
    };

    currentContextRef.current = nextContext;

    const batch = batchRef.current;
    if (batch && telemetryPreferences.usageEnabled) {
      markContextVisit(batch, previousContext, nextContext);
    }

    if (
      nextContext.topicoId != null &&
      nextContext.topicoId !== previousContext.topicoId
    ) {
      recordAppEvent({
        eventGroup: "navigation",
        eventName: "topic_open",
        topicoId: nextContext.topicoId,
        payload: {
          revisit: seenTopicIdsRef.current.has(Number(nextContext.topicoId)),
        },
      });
      seenTopicIdsRef.current.add(Number(nextContext.topicoId));
    }

    if (
      nextContext.conteudoId != null &&
      nextContext.conteudoId !== previousContext.conteudoId
    ) {
      const alreadySeen = seenContentIdsRef.current.has(Number(nextContext.conteudoId));
      recordAppEvent({
        eventGroup: "navigation",
        eventName: alreadySeen ? "content_revisit" : "content_open",
        topicoId: nextContext.topicoId,
        conteudoId: nextContext.conteudoId,
        itemKey: nextContext.itemKey,
        payload: {
          material_key: nextContext.materialKey,
          material_tipo: nextContext.materialType,
        },
      });
      seenContentIdsRef.current.add(Number(nextContext.conteudoId));
    }

    if (
      nextContext.atividadeId != null &&
      nextContext.atividadeId !== previousContext.atividadeId
    ) {
      recordAppEvent({
        eventGroup: "navigation",
        eventName: "activity_start",
        topicoId: nextContext.topicoId,
        conteudoId: nextContext.conteudoId,
        atividadeId: nextContext.atividadeId,
        itemKey: nextContext.itemKey,
      });
    }
  }, [recordAppEvent, syncBatchTimeline, telemetryPreferences.usageEnabled]);

  const flushStudyBatch = useCallback(
    async (reason: TelemetryFlushReason) => {
      const session = sessionRef.current;
      const batch = batchRef.current;
      if (!session || !batch) return null;
      stopFrameCaptureTimer();

      const nowMs = Date.now();
      if (telemetryPreferences.usageEnabled) {
        syncBatchTimeline(nowMs);
      }
      const timeMetrics = telemetryPreferences.usageEnabled
        ? buildTimeMetricsSnapshot(session, batch, nowMs)
        : buildDisabledUsageTimeMetrics();
      const screenDwellSec = timeMetrics.general.batch_dwell_sec;
      const idleSec = timeMetrics.general.batch_idle_sec;
      const activeSec = timeMetrics.general.batch_active_sec;
      const currentContext = currentContextRef.current;
      const canSendFrames =
        telemetryConsentStatus === "accepted" &&
        telemetryPreferences.cameraEnabled &&
        cameraOptIn &&
        cameraPermission === "granted" &&
        batch.cameraFrames.length > 0;
      const studyElapsedSec = timeMetrics.general.session_elapsed_sec;

      const payload: TelemetryBatchPayload = {
        sessao_id: session.sessionId,
        classe_id: session.classeId,
        topico_id: currentContext.topicoId ?? session.topicoId,
        atividade_id: currentContext.atividadeId,
        conteudo_id: currentContext.conteudoId,
        item_key: currentContext.itemKey,
        screen_name: session.screenName,
        route_name: session.routeName,
        flush_reason: reason,
        captured_at: new Date(nowMs).toISOString(),
        session_started_at: session.sessionStartedAt,
        study_elapsed_sec: studyElapsedSec,
        screen_dwell_sec: screenDwellSec,
        active_sec: activeSec,
        idle_sec: idleSec,
        touch_count: telemetryPreferences.usageEnabled ? batch.touchCount : 0,
        scroll_distance_px: telemetryPreferences.usageEnabled
          ? Math.round(batch.scrollDistancePx)
          : 0,
        max_depth_px: telemetryPreferences.usageEnabled
          ? Math.round(batch.maxDepthPx)
          : 0,
        time_metrics: timeMetrics,
        signals: [...batch.signals],
        eventos_app: [...batch.appEvents],
        touch_samples: telemetryPreferences.usageEnabled ? [...batch.touchSamples] : [],
        camera: canSendFrames
          ? {
              enabled: true,
              frame_mime: "image/jpeg",
              frames: [...batch.cameraFrames],
            }
          : {
              enabled: false,
          },
      };

      setLastBatchTimeMetrics(timeMetrics);

      let response: TelemetryBatchResponse | null = null;
      let persisted = false;

      try {
        response = await enviarLoteTelemetria(payload);
        persisted = response?.persisted === true;
        if (response?.analysis) {
          setLastAnalysis(response.analysis);
        }
      } catch (error) {
        const nowMs = Date.now();
        if (nowMs - lastFlushErrorAtRef.current > 15_000) {
          console.warn("[MetricasContext] Falha ao enviar lote de telemetria:", error);
          lastFlushErrorAtRef.current = nowMs;
        }
      } finally {
        if (persisted) {
          batchRef.current = buildEmptyBatch(nowMs);
          markContextVisit(batchRef.current, { ...EMPTY_STUDY_CONTEXT }, currentContext);
          lastTouchSampleAtRef.current = 0;
        }
        resetFrameCaptureTimer();
      }

      return response;
    },
    [
      cameraOptIn,
      cameraPermission,
      resetFrameCaptureTimer,
      stopFrameCaptureTimer,
      syncBatchTimeline,
      telemetryConsentStatus,
      telemetryPreferences,
    ]
  );

  const endStudySession = useCallback(
    async (reason: TelemetryFlushReason) => {
      if (!sessionRef.current) return;

      recordAppEvent({
        eventGroup: "session",
        eventName: reason === "session_end" ? "session_end" : "session_interrupt",
        topicoId: currentContextRef.current.topicoId,
        conteudoId: currentContextRef.current.conteudoId,
        atividadeId: currentContextRef.current.atividadeId,
        itemKey: currentContextRef.current.itemKey,
        payload: { reason },
      });

      await flushStudyBatch(reason);
      stopFrameCaptureTimer();

      if (flushTimerRef.current) {
        clearInterval(flushTimerRef.current);
        flushTimerRef.current = null;
      }

      const shouldPreserveResume = reason === "app_background";
      if (!shouldPreserveResume) {
        resumeDescriptorRef.current = null;
      }

      sessionRef.current = null;
      batchRef.current = null;
      wrongStreaksRef.current = {};
      currentContextRef.current = { ...EMPTY_STUDY_CONTEXT };
      lastAppEventAtRef.current = null;
      seenTopicIdsRef.current = new Set();
      seenContentIdsRef.current = new Set();
      setIsSessionActive(false);
    },
    [flushStudyBatch, recordAppEvent, stopFrameCaptureTimer]
  );

  useEffect(() => {
    flushStudyBatchRef.current = flushStudyBatch;
  }, [flushStudyBatch]);

  const beginStudySession = useCallback(
    async (params: BeginStudySessionParams) => {
      const consent =
        telemetryConsentStatus === null
          ? await loadConsentState()
          : {
              status: telemetryConsentStatus,
              cameraPermissionGranted: cameraOptIn,
              preferences: telemetryPreferences,
              record: null,
            };

      if (consent.status !== "accepted") {
        resumeDescriptorRef.current = params;
        setIsSessionActive(false);
        return;
      }
      const hasAnyEnabledGroup =
        consent.preferences.usageEnabled ||
        consent.preferences.performanceEnabled ||
        consent.preferences.chatEnabled;
      if (!hasAnyEnabledGroup) {
        resumeDescriptorRef.current = params;
        setIsSessionActive(false);
        return;
      }

      const active = sessionRef.current;
      if (
        active &&
        active.classeId === params.classeId &&
        active.topicoId === params.topicoId &&
        active.routeName === params.routeName &&
        active.screenName === params.screenName
      ) {
        resumeDescriptorRef.current = params;
        return;
      }

      if (active) {
        await endStudySession("session_end");
      }

      const now = new Date();
      sessionRef.current = {
        ...params,
        sessionId: buildUuid(),
        sessionStartedAt: now.toISOString(),
      };
      batchRef.current = buildEmptyBatch(now.getTime());
      currentContextRef.current = {
        topicoId: params.topicoId,
        atividadeId: null,
        conteudoId: null,
        itemKey: null,
        materialKey: null,
        materialType: null,
        target: "screen",
        studyState: "idle",
      };
      if (batchRef.current) {
        markContextVisit(batchRef.current, { ...EMPTY_STUDY_CONTEXT }, currentContextRef.current);
      }
      wrongStreaksRef.current = {};
      lastTouchSampleAtRef.current = 0;
      lastAppEventAtRef.current = null;
      seenTopicIdsRef.current = new Set(
        params.topicoId != null ? [Number(params.topicoId)] : []
      );
      seenContentIdsRef.current = new Set();
      resumeDescriptorRef.current = params;
      setCameraOptInState(consent.cameraPermissionGranted && consent.preferences.cameraEnabled);
      setIsSessionActive(true);
      recordAppEvent({
        eventGroup: "session",
        eventName: "session_start",
        topicoId: params.topicoId,
        payload: {
          screen_name: params.screenName,
          route_name: params.routeName,
        },
      });
      recordAppEvent({
        eventGroup: "navigation",
        eventName: "topic_open",
        topicoId: params.topicoId,
      });
      resetFlushTimer();
      resetFrameCaptureTimer();
    },
    [
      cameraOptIn,
      endStudySession,
      loadConsentState,
      recordAppEvent,
      resetFlushTimer,
      resetFrameCaptureTimer,
      telemetryConsentStatus,
      telemetryPreferences,
    ]
  );

  const recordTouchSample = useCallback(
    (sample: { x_pct: number; y_pct: number; target?: TelemetryTouchTarget }) => {
      if (!telemetryPreferences.usageEnabled) return;
      const batch = batchRef.current;
      if (!batch) return;

      const nowMs = Date.now();
      trackInteraction(nowMs);
      batch.touchCount += 1;
      registerContextTouch(batch, currentContextRef.current);
      recordAppEvent({
        eventGroup: "interaction",
        eventName: "tap",
        payload: {
          x_pct: clamp01(sample.x_pct),
          y_pct: clamp01(sample.y_pct),
          target: sample.target ?? currentContextRef.current.target ?? "screen",
        },
      });

      if (
        batch.touchSamples.length >= MAX_TOUCH_SAMPLES ||
        nowMs - lastTouchSampleAtRef.current < TOUCH_SAMPLE_THROTTLE_MS
      ) {
        return;
      }

      lastTouchSampleAtRef.current = nowMs;
      batch.touchSamples.push({
        t_offset_ms: Math.max(0, nowMs - batch.batchStartedAtMs),
        x_pct: clamp01(sample.x_pct),
        y_pct: clamp01(sample.y_pct),
        target: sample.target ?? currentContextRef.current.target ?? "screen",
      });
    },
    [recordAppEvent, telemetryPreferences.usageEnabled, trackInteraction]
  );

  const recordScroll = useCallback(
    (metrics: ScrollTelemetryMetrics) => {
      if (!telemetryPreferences.usageEnabled) return;
      const batch = batchRef.current;
      if (!batch) return;

      trackInteraction(Date.now());
      const y = Math.max(0, Number(metrics.y) || 0);
      const previous = batch.lastScrollY;
      const delta = previous != null ? Math.abs(y - previous) : 0;
      if (previous != null) {
        batch.scrollDistancePx += delta;
      }
      batch.lastScrollY = y;
      batch.maxDepthPx = Math.max(batch.maxDepthPx, y);
      registerContextScroll(batch, currentContextRef.current, delta, y);
      if (delta > 0) {
        recordAppEvent({
          eventGroup: "interaction",
          eventName: "scroll",
          payload: {
            y,
            delta_px: delta,
          },
        });
      }
    },
    [recordAppEvent, telemetryPreferences.usageEnabled, trackInteraction]
  );

  const setCameraOptIn = useCallback(async (enabled: boolean) => {
    if (!enabled) {
      setCameraOptInState(false);
      setTelemetryPreferencesState((prev) => ({ ...prev, cameraEnabled: false }));
      await setTelemetryConsentPreferences({
        cameraEnabled: false,
      });
      stopFrameCaptureTimer();
      return false;
    }

    if (telemetryConsentStatus !== "accepted") {
      setCameraOptInState(false);
      return false;
    }

    if (Platform.OS === "web" || !CameraView || !requestCameraPermissionsAsync) {
      setCameraPermission("unavailable");
      setCameraOptInState(false);
      return false;
    }

    try {
      const response = await requestCameraPermissionsAsync();
      const granted =
        response?.granted === true ||
        response?.status === "granted";

      setCameraPermission(granted ? "granted" : "denied");
      setCameraOptInState(granted);
      setTelemetryPreferencesState((prev) => ({ ...prev, cameraEnabled: granted }));
      await setTelemetryConsentAccepted({
        cameraPermissionRequested: true,
        cameraPermissionGranted: granted,
        preferences: {
          ...telemetryPreferences,
          cameraEnabled: granted,
        },
      });
      if (!granted) {
        stopFrameCaptureTimer();
      }
      return granted;
    } catch {
      setCameraPermission("denied");
      setCameraOptInState(false);
      setTelemetryPreferencesState((prev) => ({ ...prev, cameraEnabled: false }));
      await setTelemetryConsentAccepted({
        cameraPermissionRequested: true,
        cameraPermissionGranted: false,
        preferences: {
          ...telemetryPreferences,
          cameraEnabled: false,
        },
      });
      stopFrameCaptureTimer();
      return false;
    }
  }, [stopFrameCaptureTimer, telemetryConsentStatus, telemetryPreferences]);

  const setTelemetryPreference = useCallback(
    async (key: keyof TelemetryConsentPreferences, enabled: boolean) => {
      if (key === "cameraEnabled") {
        await setCameraOptIn(enabled);
        return;
      }

      const nextPrefs = {
        ...telemetryPreferences,
        [key]: enabled,
      };
      setTelemetryPreferencesState(nextPrefs);

      await setTelemetryConsentPreferences({
        usageEnabled: nextPrefs.usageEnabled,
        performanceEnabled: nextPrefs.performanceEnabled,
        chatEnabled: nextPrefs.chatEnabled,
        cameraEnabled: nextPrefs.cameraEnabled,
      });
    },
    [setCameraOptIn, telemetryPreferences]
  );

  useEffect(() => {
    void loadConsentState();
  }, [loadConsentState]);

  useEffect(() => {
    return subscribeTelemetryConsentChanges((record) => {
      const applied = applyConsentRecord(record);
      const hasAnyEnabledGroup =
        applied.preferences.usageEnabled ||
        applied.preferences.performanceEnabled ||
        applied.preferences.chatEnabled;

      if (
        applied.status === "accepted" &&
        hasAnyEnabledGroup &&
        resumeDescriptorRef.current &&
        !sessionRef.current
      ) {
        void beginStudySession(resumeDescriptorRef.current);
      }

      if (applied.status !== "accepted" && sessionRef.current) {
        void endStudySession("session_end");
      }
    });
  }, [applyConsentRecord, beginStudySession, endStudySession]);

  useEffect(() => {
    if (!getCameraPermissionsAsync || Platform.OS === "web" || !CameraView) {
      return;
    }

    let active = true;

    getCameraPermissionsAsync()
      .then((permission: { granted?: boolean; status?: string } | null) => {
        if (!active) return;
        const granted =
          permission?.granted === true ||
          permission?.status === "granted";
        setCameraPermission(granted ? "granted" : "unknown");
      })
      .catch(() => {
        if (!active) return;
        setCameraPermission("unknown");
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!sessionRef.current) return;
    resetFrameCaptureTimer();
  }, [cameraOptIn, cameraPermission, resetFrameCaptureTimer, telemetryConsentStatus]);

  useEffect(() => {
    if (!isSessionActive) return;

    const publishSnapshot = () => {
      const session = sessionRef.current;
      const batch = batchRef.current;
      if (!session || !batch) return;

      const nowMs = Date.now();
      if (telemetryPreferences.usageEnabled) {
        syncBatchTimeline(nowMs);
        setLastBatchTimeMetrics(buildTimeMetricsSnapshot(session, batch, nowMs));
      } else {
        setLastBatchTimeMetrics(buildDisabledUsageTimeMetrics());
      }
    };

    publishSnapshot();
    const interval = setInterval(publishSnapshot, 1000);
    return () => clearInterval(interval);
  }, [isSessionActive, syncBatchTimeline, telemetryPreferences.usageEnabled]);

  useEffect(() => {
    return subscribeToSignals((signal) => {
      const batch = batchRef.current;
      if (!batch) return;

      const mapped = mapSignal(signal);
      const isPerformanceSignal =
        mapped.type === "activity_wrong" ||
        mapped.type === "activity_correct" ||
        mapped.type === "activity_complete" ||
        mapped.type === "wrong_streak";
      if (isPerformanceSignal && !telemetryPreferences.performanceEnabled) {
        return;
      }
      if (!isPerformanceSignal && !telemetryPreferences.usageEnabled) {
        return;
      }

      const nowMs = mapped.timestamp ?? Date.now();
      if (telemetryPreferences.usageEnabled) {
        trackInteraction(nowMs);
      }
      batch.signals.push(mapped);

      const itemKey =
        mapped.item_key ??
        (mapped.atividade_id != null ? `activity:${mapped.atividade_id}` : null);
      if (itemKey) {
        if (mapped.type === "activity_wrong") {
          const streak = (wrongStreaksRef.current[itemKey] ?? 0) + 1;
          wrongStreaksRef.current[itemKey] = streak;

          if (streak >= 2) {
            batch.signals.push({
              type: "wrong_streak",
              timestamp: nowMs,
              topico_id: mapped.topico_id ?? null,
              atividade_id: mapped.atividade_id ?? null,
              conteudo_id: mapped.conteudo_id ?? null,
              item_key: itemKey,
              meta: {
                streak,
              },
            });
          }
        } else if (
          mapped.type === "activity_correct" ||
          mapped.type === "activity_complete" ||
          mapped.type === "content_complete"
        ) {
          wrongStreaksRef.current[itemKey] = 0;
        }
      }

      if (telemetryPreferences.usageEnabled) {
        updateStudyContext({
          topicoId: mapped.topico_id ?? undefined,
          atividadeId: mapped.atividade_id ?? undefined,
          conteudoId: mapped.conteudo_id ?? undefined,
          itemKey: mapped.item_key ?? undefined,
          materialKey: mapped.atividade_id != null ? null : undefined,
          materialType: mapped.atividade_id != null ? null : undefined,
          target:
            mapped.atividade_id != null
              ? "activity"
              : mapped.conteudo_id != null
              ? "content"
              : "screen",
        });
      }
    });
  }, [subscribeToSignals, telemetryPreferences.performanceEnabled, telemetryPreferences.usageEnabled, trackInteraction, updateStudyContext]);

  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      const previousState = appStateRef.current;
      appStateRef.current = nextState;

      if (
        previousState === "active" &&
        (nextState === "background" || nextState === "inactive")
      ) {
        void endStudySession("app_background");
        return;
      }

      if (
        previousState !== "active" &&
        nextState === "active" &&
        !sessionRef.current &&
        resumeDescriptorRef.current
      ) {
        void beginStudySession(resumeDescriptorRef.current);
      }
    });

    return () => subscription.remove();
  }, [beginStudySession, endStudySession]);

  useEffect(() => {
    return () => {
      if (flushTimerRef.current) {
        clearInterval(flushTimerRef.current);
        flushTimerRef.current = null;
      }
      stopFrameCaptureTimer();
    };
  }, [stopFrameCaptureTimer]);

  const value = useMemo<MetricasContextValue>(
    () => ({
      beginStudySession,
      updateStudyContext,
      endStudySession,
      flushStudyBatch,
      recordTouchSample,
      recordScroll,
      recordAppEvent,
      setCameraOptIn,
      telemetryPreferences,
      setTelemetryPreference,
      lastAnalysis,
      cameraOptIn,
      cameraPermission,
    }),
    [
      beginStudySession,
      updateStudyContext,
      endStudySession,
      flushStudyBatch,
      recordTouchSample,
      recordScroll,
      recordAppEvent,
      setCameraOptIn,
      telemetryPreferences,
      setTelemetryPreference,
      lastAnalysis,
      cameraOptIn,
      cameraPermission,
    ]
  );

  return (
    <MetricasBatchContext.Provider value={{ lastBatchTimeMetrics }}>
    <MetricasContext.Provider value={value}>
      {children}
      {Platform.OS !== "web" &&
      CameraView &&
      telemetryPreferences.cameraEnabled &&
      cameraOptIn &&
      cameraPermission === "granted" ? (
        <View pointerEvents="none" style={styles.hiddenCameraWrap}>
          <CameraView
            ref={captureRef}
            style={styles.hiddenCamera}
            facing="front"
            animateShutter={false}
          />
        </View>
      ) : null}
    </MetricasContext.Provider>
    </MetricasBatchContext.Provider>
  );
}

const styles = StyleSheet.create({
  hiddenCameraWrap: {
    position: "absolute",
    width: 1,
    height: 1,
    opacity: 0,
    overflow: "hidden",
  },
  hiddenCamera: {
    width: 1,
    height: 1,
  },
});

export function useMetricas() {
  const context = useContext(MetricasContext);
  if (!context) {
    throw new Error("useMetricas deve ser usado dentro de um MetricasProvider");
  }
  return context;
}
