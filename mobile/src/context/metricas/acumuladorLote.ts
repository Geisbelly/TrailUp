/**
 * Acumulador de um lote de telemetria: tempo, visitas e chaves por escopo.
 *
 * Extraido de `MetricasContext.tsx` para poder ser testado. Aquele arquivo
 * importa `react-native`, que nao carrega em Node — o runner do projeto morre no
 * `import`, e por isso a contagem de tempo e de visita, que e a metrica central
 * do produto, nunca teve teste. Aqui nao entra nada nativo: `TelemetryContracts`
 * e so tipo.
 */

// `import type`: sao apenas tipos, e assim o alias `@/` nao precisa ser
// resolvido em tempo de execucao — o teste roda em Node, fora do bundler.
import type {
  TelemetryAppEventPayload,
  TelemetryCameraFrame,
  TelemetrySignalPayload,
  TelemetryStudyState,
  TelemetryTimeMetricEntry,
  TelemetryTouchSample,
  TelemetryTouchTarget,
} from "@/interfaces/telemetria/TelemetryContracts";

export type TimeMetricEntryAccumulator = {
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

export type TimeMetricsAccumulator = {
  topics: Record<string, TimeMetricEntryAccumulator>;
  contents: Record<string, TimeMetricEntryAccumulator>;
  activities: Record<string, TimeMetricEntryAccumulator>;
  materials: Record<string, TimeMetricEntryAccumulator>;
};

export type BatchAccumulator = {
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

export type CurrentStudyContext = {
  topicoId: number | null;
  atividadeId: number | null;
  conteudoId: number | null;
  itemKey: string | null;
  materialKey: string | null;
  materialType: string | null;
  target: TelemetryTouchTarget;
  studyState: TelemetryStudyState;
};

export const EMPTY_STUDY_CONTEXT: CurrentStudyContext = {
  topicoId: null,
  atividadeId: null,
  conteudoId: null,
  itemKey: null,
  materialKey: null,
  materialType: null,
  target: "screen",
  studyState: "idle",
};

export function buildEmptyBatch(nowMs: number): BatchAccumulator {
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

type SeedEntrada = {
  key: string;
  topicoId?: number | null;
  conteudoId?: number | null;
  atividadeId?: number | null;
  itemKey?: string | null;
  materialKey?: string | null;
  materialType?: string | null;
};

export function buildTimeMetricEntry(seed: SeedEntrada): TimeMetricEntryAccumulator {
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

export function getOrCreateTimeMetricEntry(
  collection: Record<string, TimeMetricEntryAccumulator>,
  seed: SeedEntrada
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

export function accumulateEntryTime(
  entry: TimeMetricEntryAccumulator,
  activeMs: number,
  idleMs: number
) {
  const dwellMs = Math.max(0, activeMs + idleMs);
  entry.dwellMs += dwellMs;
  entry.activeMs += Math.max(0, activeMs);
  entry.idleMs += Math.max(0, idleMs);
}

/**
 * TEMPO. Só corre com o aluno de fato num item — no menu da trilha ele nao
 * esta consumindo nada, e contar ali inflaria o tempo de estudo.
 */
export function accumulateContextTime(
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

/**
 * VISITA. Diferente de tempo, e por isso NAO exige `studyState === "active"`:
 * abrir um topico e uma visita, mesmo que o aluno ainda nao tenha escolhido o
 * material.
 *
 * O guard estava aqui e zerava a visita ao topico. `useFocusEffect` na tela da
 * trilha abre a sessao e chama `updateStudyContext` com `studyState: "idle"` —
 * o unico instante em que a mudanca de topico e observada. A visita caia no
 * `return`, e quando algo marcava `active` depois, `next.topicoId ===
 * previous.topicoId` e a comparacao ja nao disparava: a visita se perdia de vez.
 *
 * Media no banco: `topic` com 3 linhas e soma de `visits` = 0, contra
 * `content`, `activity` e `material` com uma visita por linha.
 */
export function markContextVisit(
  batch: BatchAccumulator,
  previous: CurrentStudyContext,
  next: CurrentStudyContext
) {
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

export function roundSeconds(ms: number) {
  return Math.max(0, Math.round(ms / 1000));
}

export function serializeTimeMetricEntries(
  collection: Record<string, TimeMetricEntryAccumulator>
): TelemetryTimeMetricEntry[] {
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
