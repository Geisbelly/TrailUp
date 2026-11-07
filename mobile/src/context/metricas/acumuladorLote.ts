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
  TelemetryTimeMetrics,
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

/** Seal the old batch before network I/O, without manufacturing an interaction. */
export function nextStudyBatch(previous: BatchAccumulator, nowMs: number): BatchAccumulator {
  const next = buildEmptyBatch(nowMs);
  next.lastInteractionAtMs = previous.lastInteractionAtMs;
  next.lastScrollY = previous.lastScrollY;
  return next;
}

/** Put an unacknowledged batch back only if neither DB nor durable queue accepted it. */
export function restoreUnsentBatch(old: BatchAccumulator, current: BatchAccumulator): BatchAccumulator {
  const merged: BatchAccumulator = {
    ...current,
    batchStartedAtMs: old.batchStartedAtMs,
    generalActiveMs: old.generalActiveMs + current.generalActiveMs,
    generalIdleMs: old.generalIdleMs + current.generalIdleMs,
    touchCount: old.touchCount + current.touchCount,
    scrollDistancePx: old.scrollDistancePx + current.scrollDistancePx,
    maxDepthPx: Math.max(old.maxDepthPx, current.maxDepthPx),
    touchSamples: [...old.touchSamples, ...current.touchSamples],
    signals: [...old.signals, ...current.signals],
    appEvents: [...old.appEvents, ...current.appEvents],
    cameraFrames: [...old.cameraFrames, ...current.cameraFrames],
    timeMetrics: { topics: {}, contents: {}, activities: {}, materials: {} },
  };
  for (const scope of ['topics', 'contents', 'activities', 'materials'] as const) {
    for (const source of [old.timeMetrics[scope], current.timeMetrics[scope]]) {
      for (const [key, value] of Object.entries(source)) {
        const previous = merged.timeMetrics[scope][key];
        merged.timeMetrics[scope][key] = previous ? {
          ...value, visits: previous.visits + value.visits,
          dwellMs: previous.dwellMs + value.dwellMs, activeMs: previous.activeMs + value.activeMs,
          idleMs: previous.idleMs + value.idleMs, touchCount: previous.touchCount + value.touchCount,
          scrollDistancePx: previous.scrollDistancePx + value.scrollDistancePx,
          maxDepthPx: Math.max(previous.maxDepthPx, value.maxDepthPx),
        } : { ...value };
      }
    }
  }
  return merged;
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
 * Acima disto, o intervalo entre duas marcações não é tempo vivido: é o JS que
 * ficou parado. Com a sessão aberta a linha do tempo é marcada a cada 1 s
 * (`publishSnapshot`), então um salto assim só acontece com o aparelho dormindo
 * (tela desligada) antes de o evento do `AppState` chegar. O limite é folgado
 * para uma tela pesada travar o JS por uns segundos sem perder tempo de verdade.
 */
export const SALTO_MAXIMO_DA_LINHA_DO_TEMPO_MS = 10_000;

export function intervaloCreditavelMs(deltaMs: number): number {
  return deltaMs > 0 && deltaMs <= SALTO_MAXIMO_DA_LINHA_DO_TEMPO_MS ? deltaMs : 0;
}

/** Sem toque por este tempo, o que corre é ocioso. */
export const IDLE_THRESHOLD_MS = 15_000;

/**
 * Credita no lote o trecho desde a última marcação. Fora do app nada entra, e o
 * salto de quem dormiu é descartado. Áudio ou vídeo tocando conta como interação:
 * quem só escuta não toca na tela, e sem isto 10 min de áudio virariam 15 s.
 */
export function marcarLinhaDoTempo(
  batch: BatchAccumulator,
  context: CurrentStudyContext,
  atMs: number,
  situacao: { appAtivo: boolean; reproduzindo: boolean }
) {
  if (!situacao.appAtivo) {
    batch.lastAccruedAtMs = atMs;
    return;
  }

  const startMs = batch.lastAccruedAtMs;
  const endMs = Math.max(atMs, startMs);
  if (intervaloCreditavelMs(endMs - startMs) <= 0) {
    batch.lastAccruedAtMs = endMs;
    return;
  }

  if (situacao.reproduzindo) {
    batch.lastInteractionAtMs = Math.max(batch.lastInteractionAtMs, endMs);
  }

  const idleStartsAt = batch.lastInteractionAtMs + IDLE_THRESHOLD_MS;
  const activeUntil = Math.min(endMs, idleStartsAt);
  const activeMs = Math.max(0, activeUntil - startMs);
  const idleMs = Math.max(0, endMs - Math.max(startMs, idleStartsAt));

  batch.generalActiveMs += activeMs;
  batch.generalIdleMs += idleMs;

  accumulateContextTime(batch, context, activeMs, idleMs);
  batch.lastAccruedAtMs = endMs;
}

/**
 * Atividade vinculada a um conteúdo carrega `conteudoId` só como referência (é
 * a mesma regra de `planSessionRegistrations`). Creditar os dois contava o mesmo
 * intervalo duas vezes, e conteúdo + atividade passava do total do tópico.
 *
 * A exceção é a atividade personalizada: o id dela é negativo e local
 * (`buildStableNegativeId`), não existe `atividade_aluno` para receber o tempo, e
 * sem cair no conteúdo ele sumiria dos dois.
 */
export function registraNoConteudo(context: CurrentStudyContext): boolean {
  if (context.conteudoId == null) return false;
  return context.atividadeId == null || context.atividadeId <= 0;
}

/**
 * TEMPO. O total do TÓPICO é o tempo do aluno dentro dele, inclusive fora de um
 * item (resumo, troca de bloco): por isso não exige `studyState === "active"` e
 * cobre a soma dos outros dois, a menos do arredondamento de cada entrada do
 * lote. Conteúdo, atividade e material só correm com o item aberto.
 */
export function accumulateContextTime(
  batch: BatchAccumulator,
  context: CurrentStudyContext,
  activeMs: number,
  idleMs: number
) {
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

  if (context.studyState !== "active") {
    return;
  }

  if (registraNoConteudo(context)) {
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

  // A personalizada já caiu no conteúdo: creditar aqui também repetiria o intervalo.
  if (context.atividadeId != null && context.atividadeId > 0) {
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

function somarEntradas(
  acumuladas: TelemetryTimeMetricEntry[],
  novas: TelemetryTimeMetricEntry[],
  sinal: 1 | -1
): TelemetryTimeMetricEntry[] {
  const soma = (a: number, b: number) => Math.max(0, a + sinal * b);
  const porChave = new Map(acumuladas.map((entrada) => [entrada.key, { ...entrada }]));
  for (const nova of novas) {
    const atual = porChave.get(nova.key);
    porChave.set(
      nova.key,
      atual
        ? {
            ...nova,
            visits: soma(atual.visits, nova.visits),
            dwell_sec: soma(atual.dwell_sec, nova.dwell_sec),
            active_sec: soma(atual.active_sec, nova.active_sec),
            idle_sec: soma(atual.idle_sec, nova.idle_sec),
            touch_count: soma(atual.touch_count, nova.touch_count),
            scroll_distance_px: soma(atual.scroll_distance_px, nova.scroll_distance_px),
            max_depth_px: Math.max(atual.max_depth_px, nova.max_depth_px),
          }
        : { ...nova }
    );
  }
  return [...porChave.values()].sort((a, b) => b.active_sec - a.active_sec || a.key.localeCompare(b.key));
}

/**
 * Cada lote traz só o tempo DELE (`buildEmptyBatch`), então o que a tela mostra
 * como "recente" precisa somar os lotes: mostrar o último exibia no máximo 60 s,
 * e o número caía a cada envio.
 *
 * `sinal = -1` tira um lote que não foi aceito e voltou para o lote em andamento
 * (`restoreUnsentBatch`): sem isso ele apareceria duas vezes.
 */
export function somarTimeMetrics(
  acumulado: TelemetryTimeMetrics | null,
  lote: TelemetryTimeMetrics,
  sinal: 1 | -1 = 1
): TelemetryTimeMetrics {
  if (!acumulado) return lote;
  const soma = (x: number, y: number) => Math.max(0, x + sinal * y);
  const a = acumulado.general;
  const b = lote.general;
  return {
    general: {
      ...b,
      batch_dwell_sec: soma(a.batch_dwell_sec, b.batch_dwell_sec),
      batch_active_sec: soma(a.batch_active_sec, b.batch_active_sec),
      batch_idle_sec: soma(a.batch_idle_sec, b.batch_idle_sec),
      touch_count: soma(a.touch_count, b.touch_count),
      scroll_distance_px: soma(a.scroll_distance_px, b.scroll_distance_px),
      max_depth_px: Math.max(a.max_depth_px, b.max_depth_px),
    },
    topics: somarEntradas(acumulado.topics, lote.topics, sinal),
    contents: somarEntradas(acumulado.contents, lote.contents, sinal),
    activities: somarEntradas(acumulado.activities, lote.activities, sinal),
    materials: somarEntradas(acumulado.materials, lote.materials, sinal),
  };
}
