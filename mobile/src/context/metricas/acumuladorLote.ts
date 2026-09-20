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
  UpdateStudyContextParams,
} from "@/interfaces/telemetria/TelemetryContracts";

export type TimeMetricEntryAccumulator = {
  key: string;
  topicoId: number | null;
  conteudoId: number | null;
  atividadeId: number | null;
  questaoId: number | null;
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
  questions: Record<string, TimeMetricEntryAccumulator>;
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
  questaoId: number | null;
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
  questaoId: null,
  itemKey: null,
  materialKey: null,
  materialType: null,
  target: "screen",
  studyState: "idle",
};

/**
 * `lastInteractionAtMs` e HERDADO do lote anterior, e isso nao e detalhe.
 *
 * O padrao anterior era `nowMs`, ou seja: todo flush fabricava uma interacao
 * que o aluno nao fez. Com o limiar de ocio rodando a partir dela, cada lote
 * comecava com um credito de tempo ativo de graca — media no banco, o material
 * mais lido da base tem `dwell 68s / active 15s`, e os 15s sao exatamente o
 * limiar, nao uma medida. Quem le sem tocar na tela nunca produziu outro
 * numero.
 *
 * Herdar mantem a conta continua atraves do flush, que e o que `20260830_01`
 * assume: o lote carrega o tempo DAQUELE lote, mas o relogio do ocio e da
 * sessao.
 */
export function buildEmptyBatch(
  nowMs: number,
  lastInteractionAtMs?: number
): BatchAccumulator {
  return {
    batchStartedAtMs: nowMs,
    lastAccruedAtMs: nowMs,
    lastInteractionAtMs: Math.min(nowMs, lastInteractionAtMs ?? nowMs),
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
      questions: {},
      materials: {},
    },
  };
}

type SeedEntrada = {
  key: string;
  topicoId?: number | null;
  conteudoId?: number | null;
  atividadeId?: number | null;
  questaoId?: number | null;
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
    questaoId: seed.questaoId ?? null,
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
    if (seed.questaoId != null) existing.questaoId = seed.questaoId;
    return existing;
  }

  const created = buildTimeMetricEntry(seed);
  collection[seed.key] = created;
  return created;
}

/**
 * `item_key` do ANCESTRAL, nunca o do descendente.
 *
 * O contexto carrega UMA `itemKey`, a do bloco aberto. Quando o bloco e uma
 * atividade ela vale `activity:<id>`, e ate aqui a entrada de CONTEUDO recebia
 * essa mesma chave. O estrago nao ficou no cliente: o gatilho
 * `telemetria_resolver_entidade` le a chave e preenche o que esta nulo, entao a
 * linha de escopo `content` saia do banco com o `atividade_id` da atividade
 * embutida nela. Medido em producao: as cinco linhas de `content:174` carimbadas
 * com 1057, 1059, 1061, 1062, 1063 e 1066 — a ultima atividade de cada lote,
 * uma por lote, sem significado nenhum.
 *
 * A regra aqui e simples: a entrada so aceita a `itemKey` do contexto quando a
 * chave descreve ELA, e nao um item aninhado dentro dela.
 */
function itemKeyDoEscopo(
  context: CurrentStudyContext,
  escopo: "content" | "activity" | "question" | "material"
) {
  if (escopo === "content" && context.atividadeId != null) return null;
  if (escopo === "activity" && context.questaoId != null) return null;
  return context.itemKey;
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

export type EscopoDeMetrica = "topic" | "content" | "activity" | "question" | "material";

type EntradaDoEscopo = {
  escopo: EscopoDeMetrica;
  colecao: Record<string, TimeMetricEntryAccumulator>;
  seed: SeedEntrada;
  /** Identidade usada para decidir se houve TROCA de item — `null` = nao ha item. */
  identidade: number | string | null;
};

/**
 * A lista de escopos que o contexto atual alimenta, numa forma so.
 *
 * Tempo, visita, toque e scroll percorriam os mesmos cinco escopos em QUATRO
 * copias do mesmo `if` — duas aqui e duas em `MetricasContext.tsx`. As copias
 * divergiram: as de tempo e visita passavam a `itemKey` crua e as de toque e
 * scroll tambem, mas nenhuma delas conhecia `questaoId`. Com uma lista so, uma
 * semente errada erra em todos os lugares de uma vez — que e o unico jeito de
 * alguem notar.
 */
export function entradasDoContexto(
  batch: BatchAccumulator,
  context: CurrentStudyContext
): EntradaDoEscopo[] {
  const entradas: EntradaDoEscopo[] = [];

  if (context.topicoId != null) {
    entradas.push({
      escopo: "topic",
      colecao: batch.timeMetrics.topics,
      identidade: context.topicoId,
      seed: { key: `topic:${context.topicoId}`, topicoId: context.topicoId },
    });
  }

  if (context.conteudoId != null) {
    entradas.push({
      escopo: "content",
      colecao: batch.timeMetrics.contents,
      identidade: context.conteudoId,
      seed: {
        key: `content:${context.conteudoId}`,
        topicoId: context.topicoId,
        conteudoId: context.conteudoId,
        itemKey: itemKeyDoEscopo(context, "content"),
      },
    });
  }

  if (context.atividadeId != null) {
    entradas.push({
      escopo: "activity",
      colecao: batch.timeMetrics.activities,
      identidade: context.atividadeId,
      seed: {
        key: `activity:${context.atividadeId}`,
        topicoId: context.topicoId,
        conteudoId: context.conteudoId,
        atividadeId: context.atividadeId,
        itemKey: itemKeyDoEscopo(context, "activity"),
      },
    });
  }

  // A questao e o escopo mais fino, e ate `20260919` ele nao existia: o tempo
  // parava na atividade. `questao_aluno.tempo_gasto_seg` ja existia como coluna
  // e estava NULO nas 35 linhas da base — e e a entrada de `trailup_core/tempo`,
  // que modela justamente a latencia por questao.
  if (context.questaoId != null) {
    entradas.push({
      escopo: "question",
      colecao: batch.timeMetrics.questions,
      identidade: context.questaoId,
      seed: {
        key: `question:${context.questaoId}`,
        topicoId: context.topicoId,
        conteudoId: context.conteudoId,
        atividadeId: context.atividadeId,
        questaoId: context.questaoId,
        itemKey: itemKeyDoEscopo(context, "question"),
      },
    });
  }

  if (context.materialKey) {
    entradas.push({
      escopo: "material",
      colecao: batch.timeMetrics.materials,
      identidade: context.materialKey,
      seed: {
        key: context.materialKey,
        topicoId: context.topicoId,
        conteudoId: context.conteudoId,
        atividadeId: context.atividadeId,
        questaoId: context.questaoId,
        itemKey: itemKeyDoEscopo(context, "material"),
        materialKey: context.materialKey,
        materialType: context.materialType,
      },
    });
  }

  return entradas;
}

function identidadeNoContexto(
  context: CurrentStudyContext,
  escopo: EscopoDeMetrica
): number | string | null {
  if (escopo === "topic") return context.topicoId;
  if (escopo === "content") return context.conteudoId;
  if (escopo === "activity") return context.atividadeId;
  if (escopo === "question") return context.questaoId;
  return context.materialKey;
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

  for (const { colecao, seed } of entradasDoContexto(batch, context)) {
    accumulateEntryTime(getOrCreateTimeMetricEntry(colecao, seed), activeMs, idleMs);
  }
}

/** TOQUE. Mesmo veto do tempo: so conta dentro de um item. */
export function registerContextTouch(batch: BatchAccumulator, context: CurrentStudyContext) {
  if (context.studyState !== "active") {
    return;
  }

  for (const { colecao, seed } of entradasDoContexto(batch, context)) {
    getOrCreateTimeMetricEntry(colecao, seed).touchCount += 1;
  }
}

/** SCROLL. Distancia soma; profundidade e o maximo alcancado. */
export function registerContextScroll(
  batch: BatchAccumulator,
  context: CurrentStudyContext,
  deltaY: number,
  depthY: number
) {
  if (context.studyState !== "active") {
    return;
  }

  for (const { colecao, seed } of entradasDoContexto(batch, context)) {
    const entry = getOrCreateTimeMetricEntry(colecao, seed);
    entry.scrollDistancePx += deltaY;
    entry.maxDepthPx = Math.max(entry.maxDepthPx, depthY);
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
  for (const { escopo, colecao, seed, identidade } of entradasDoContexto(batch, next)) {
    if (identidade === identidadeNoContexto(previous, escopo)) continue;
    getOrCreateTimeMetricEntry(colecao, seed).visits += 1;
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
      questao_id: entry.questaoId,
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

/**
 * O contexto de estudo depois de um `updateStudyContext`.
 *
 * Mora aqui, e nao dentro do componente, pelo mesmo motivo que o resto deste
 * arquivo: `MetricasContext.tsx` importa `react-native` e o runner do projeto
 * morre no `import`. Esta funcao decide a que item cada segundo de estudo e
 * atribuido — se ela errar, nenhuma das contas de tempo do produto fecha.
 *
 * Duas regras, e a segunda existe por causa da primeira:
 *
 * 1. **Campo omitido preserva o anterior; `studyState: "idle"` zera tudo abaixo
 *    do topico.** Preservar e essencial: o efeito que abre o bloco em
 *    `trilha/[id].tsx` reroda no retorno do foco, e se cada rerun tivesse de
 *    reenviar o contexto inteiro, o que ele nao conhecesse seria apagado.
 *
 * 2. **A questao morre com a atividade dela.** Preservar sempre deixaria a
 *    questao da atividade ANTERIOR viva depois da troca, atribuindo tempo dela
 *    a um bloco onde ela nem existe. Quem sabe em qual questao o aluno esta e
 *    `QuestionActivity`; a invariante cobre o intervalo entre a troca de bloco
 *    e o `updateStudyContext` dele.
 */
export function proximoContextoDeEstudo(
  previous: CurrentStudyContext,
  params: UpdateStudyContextParams
): CurrentStudyContext {
  const ocioso = params.studyState === "idle";
  const preservando = <T,>(enviado: T | undefined, anterior: T): T | null =>
    ocioso ? null : enviado !== undefined ? enviado : anterior ?? null;

  const atividadeId = preservando(params.atividadeId, previous.atividadeId);
  const trocouDeAtividade = atividadeId !== previous.atividadeId;

  return {
    topicoId: params.topicoId ?? previous.topicoId ?? null,
    atividadeId,
    conteudoId: preservando(params.conteudoId, previous.conteudoId),
    questaoId: ocioso
      ? null
      : params.questaoId !== undefined
      ? params.questaoId
      : trocouDeAtividade
      ? null
      : previous.questaoId ?? null,
    itemKey: preservando(params.itemKey, previous.itemKey),
    materialKey: preservando(params.materialKey, previous.materialKey),
    materialType: preservando(params.materialType, previous.materialType),
    target: params.target ?? previous.target ?? "screen",
    studyState:
      params.studyState ??
      (params.atividadeId != null ||
      params.conteudoId != null ||
      params.questaoId != null ||
      params.itemKey != null
        ? "active"
        : previous.studyState ?? "idle"),
  };
}
