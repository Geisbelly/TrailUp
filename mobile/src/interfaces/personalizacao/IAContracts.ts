type LooseRecord = Record<string, any>;

export type IAMentalStateKind =
  | "neutral"
  | "focused"
  | "motivated"
  | "confident"
  | "tired"
  | "frustrated"
  | "anxious"
  | "overwhelmed"
  | "bored";

export type IAFeatureKey =
  | "activity_timer"
  | "reading_timer"
  | "mentor_character"
  | "battle_mode";

export type IAFeatureScope = "session" | "topic" | "item";

export type IATimerTimeoutAction =
  | "nudge"
  | "pause"
  | "suggest_break"
  | "end_local_attempt";

export type IAFeatureCopy = {
  title?: string | null;
  body?: string | null;
  tone?: string | null;
  actionLabel?: string | null;
  speakerName?: string | null;
};

export type IAMentalStateSnapshot = {
  kind: IAMentalStateKind;
  intensity: number;
  confidence: number;
  reason?: string | null;
  source: "ai";
  observedAt?: string | null;
  expiresAt?: string | null;
};

export type IATimerConfig = {
  durationSec: number;
  warningAtSec?: number | null;
  timeoutAction?: IATimerTimeoutAction | null;
  autoStart?: boolean;
  label?: string | null;
};

export type IAEnemyPalette = {
  primaryColor?: string | null;
  secondaryColor?: string | null;
  accentColor?: string | null;
  hpColor?: string | null;
  shieldColor?: string | null;
  textColor?: string | null;
};

export type IAEnemyVisualSpec = {
  preset?: string | null;
  avatarUrl?: string | null;
  backgroundUrl?: string | null;
  frameUrl?: string | null;
  effectUrl?: string | null;
  badgeLabel?: string | null;
  palette?: IAEnemyPalette | null;
};

export type IABattleTiming = {
  encounterDurationSec?: number | null;
  warningAtSec?: number | null;
  introDelayMs?: number | null;
  defeatDelayMs?: number | null;
};

export type IAEnemySpec = {
  id: string;
  name: string;
  archetype?: string | null;
  avatarUrl?: string | null;
  imagePrompt?: string | null;
  visual?: IAEnemyVisualSpec | null;
  contentId?: number | null;
  itemKey?: string | null;
  hpMax: number;
  shieldMax?: number | null;
  introLine?: string | null;
  defeatLine?: string | null;
};

export type IABattleDamageConfig = {
  contentComplete?: number | null;
  activityCorrect?: number | null;
  activityComplete?: number | null;
};

export type IABattleConfig = {
  enemy: IAEnemySpec;
  damage?: IABattleDamageConfig | null;
  timing?: IABattleTiming | null;
  victoryMessage?: string | null;
  persistKey?: string | null;
  sourceItemKey?: string | null;
};

export type IACharacterConfig = {
  speakerName?: string | null;
  avatarUrl?: string | null;
  style?: string | null;
};

export type IAFeaturePatch = {
  key: IAFeatureKey;
  enabled?: boolean | null;
  mode?: string | null;
  priority?: number | null;
  cooldownMs?: number | null;
  copy?: IAFeatureCopy | null;
  timer?: Partial<IATimerConfig> | null;
  battle?: Partial<IABattleConfig> | null;
  character?: Partial<IACharacterConfig> | null;
  metadata?: Record<string, unknown> | null;
};

export type IAFeatureDescriptor = {
  key: IAFeatureKey;
  label: string;
  defaultEnabled: boolean;
  defaultMode?: string | null;
  defaultPriority: number;
  defaultCooldownMs: number;
  supportedScopes: IAFeatureScope[];
  disabledMentalStates?: IAMentalStateKind[];
  copy?: IAFeatureCopy | null;
  timer?: IATimerConfig | null;
  battle?: IABattleConfig | null;
  character?: IACharacterConfig | null;
};

export type IAResolvedFeatureState = {
  key: IAFeatureKey;
  scope: IAFeatureScope;
  enabled: boolean;
  mode?: string | null;
  priority: number;
  cooldownMs: number;
  copy?: IAFeatureCopy | null;
  timer?: IATimerConfig | null;
  battle?: IABattleConfig | null;
  character?: IACharacterConfig | null;
  topicoId?: number | null;
  itemKey?: string | null;
  disabledReason?: "user_preference" | "mental_state" | "runtime_safety" | null;
};

export type IATriggerSignalType =
  | "topic_open"
  | "content_open"
  | "content_complete"
  | "activity_start"
  | "activity_correct"
  | "activity_wrong"
  | "wrong_streak"
  | "activity_complete"
  | "timer_warning"
  | "timer_timeout"
  | "encounter_timeout"
  | "idle_detected";

export type IATriggerSignal = {
  type: IATriggerSignalType;
  topicoId?: number | null;
  itemKey?: string | null;
  contentId?: number | null;
  activityId?: number | null;
  questionId?: number | null;
  cardId?: string | number | null;
  timestamp?: number;
  meta?: Record<string, unknown> | null;
};

export type IACharacterCue = {
  id: string;
  speakerName?: string | null;
  avatarUrl?: string | null;
  title?: string | null;
  message: string;
  tone?: string | null;
  topicoId?: number | null;
  itemKey?: string | null;
  createdAt: number;
  featureKey?: IAFeatureKey | null;
  action?: IATimerTimeoutAction | "dismiss" | null;
  actionLabel?: string | null;
};

export type IATriggerRule = {
  id: string;
  signal: IATriggerSignalType | IATriggerSignalType[];
  featureKey?: IAFeatureKey | null;
  cooldownMs?: number | null;
  minWrongStreak?: number | null;
  mentalStates?: IAMentalStateKind[] | null;
  itemKey?: string | null;
  cue?: Omit<IACharacterCue, "id" | "createdAt"> | null;
  action?: IATimerTimeoutAction | "enqueue_cue" | null;
};

export type IAPersonalizationPatch = {
  mentalState?: IAMentalStateSnapshot | null;
  session: IAFeaturePatch[];
  topic: IAFeaturePatch[];
  items: Record<string, IAFeaturePatch[]>;
  triggers: IATriggerRule[];
};

export type IAFeatureSelectorScope =
  | { scope: "session" }
  | { scope: "topic"; topicoId: number }
  | { scope: "item"; topicoId?: number | null; itemKey: string };

export type IABattleRuntimeState = {
  topicoId: number;
  cycleId?: string | null;
  moduleDifficulty?: string | null;
  enemy: IAEnemySpec;
  itemKey?: string | null;
  currentHp: number;
  currentShield: number;
  totalDamage: number;
  defeated: boolean;
  introShown: boolean;
  encounterEndsAt?: number | null;
  startedAt?: number | null;
  defeatedAt?: number | null;
  lastDamageAt?: number | null;
  warningSent?: boolean;
  updatedAt: number;
};

const FEATURE_KEYS: IAFeatureKey[] = [
  "activity_timer",
  "reading_timer",
  "mentor_character",
  "battle_mode",
];

const MENTAL_STATE_KEYS: IAMentalStateKind[] = [
  "neutral",
  "focused",
  "motivated",
  "confident",
  "tired",
  "frustrated",
  "anxious",
  "overwhelmed",
  "bored",
];

function isRecord(value: unknown): value is LooseRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asRecord(value: unknown): LooseRecord | null {
  if (!value) return null;
  if (isRecord(value)) return value;

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed || (!trimmed.startsWith("{") && !trimmed.startsWith("["))) {
      return null;
    }

    try {
      const parsed = JSON.parse(trimmed);
      return isRecord(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  return null;
}

function asArray<T = any>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function pickString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return null;
}

function pickNumber(...values: unknown[]) {
  for (const value of values) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function pickBoolean(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "boolean") return value;
    if (typeof value === "string") {
      const normalized = value.trim().toLowerCase();
      if (["true", "1", "yes", "sim"].includes(normalized)) return true;
      if (["false", "0", "no", "nao", "não"].includes(normalized)) return false;
    }
  }
  return null;
}

function clamp01(value: number | null | undefined, fallback: number) {
  if (!Number.isFinite(Number(value))) return fallback;
  return Math.max(0, Math.min(1, Number(value)));
}

function normalizeFeatureKey(value: unknown): IAFeatureKey | null {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (FEATURE_KEYS.includes(normalized as IAFeatureKey)) {
    return normalized as IAFeatureKey;
  }
  return null;
}

function normalizeMentalStateKind(value: unknown): IAMentalStateKind | null {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (MENTAL_STATE_KEYS.includes(normalized as IAMentalStateKind)) {
    return normalized as IAMentalStateKind;
  }
  return null;
}

function normalizeTimeoutAction(value: unknown): IATimerTimeoutAction | null {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (
    ["nudge", "pause", "suggest_break", "end_local_attempt"].includes(normalized)
  ) {
    return normalized as IATimerTimeoutAction;
  }
  return null;
}

function normalizeCopy(raw: unknown): IAFeatureCopy | null {
  const record = asRecord(raw);
  if (!record) return null;

  return {
    title: pickString(record.title, record.titulo),
    body: pickString(record.body, record.message, record.mensagem, record.descricao),
    tone: pickString(record.tone, record.tom),
    actionLabel: pickString(record.actionLabel, record.cta, record.botao),
    speakerName: pickString(record.speakerName, record.nome, record.personagem),
  };
}

function normalizeTimer(raw: unknown): IATimerConfig | null {
  const record = asRecord(raw);
  if (!record) return null;

  const durationSec = pickNumber(
    record.durationSec,
    record.duration_sec,
    record.duration,
    record.durationSeconds,
    record.duration_seconds,
    record.duracao,
    record.duracaoSegundos,
    record.duracao_segundos
  );

  if (!durationSec || durationSec <= 0) return null;

  return {
    durationSec: Math.max(5, Math.round(durationSec)),
    warningAtSec: Math.max(
      0,
      Math.round(
        pickNumber(
          record.warningAtSec,
          record.warning_at_sec,
          record.warningAt,
          record.warning_at,
          record.alertAtSec,
          record.alert_at_sec,
          record.alertaEm
        ) ??
          Math.max(5, Math.round(durationSec * 0.25))
      )
    ),
    timeoutAction:
      normalizeTimeoutAction(
        pickString(
          record.timeoutAction,
          record.timeout_action,
          record.actionOnTimeout,
          record.action_on_timeout,
          record.acaoAoFinalizar
        )
      ) ?? "nudge",
    autoStart: pickBoolean(record.autoStart, record.autostart, record.inicioAutomatico) ?? true,
    label: pickString(record.label, record.titulo, record.nome),
  };
}

function normalizeBattlePalette(raw: unknown): IAEnemyPalette | null {
  const record = asRecord(raw);
  if (!record) return null;

  return {
    primaryColor: pickString(record.primaryColor, record.primary_color, record.primaria),
    secondaryColor: pickString(record.secondaryColor, record.secondary_color, record.secundaria),
    accentColor: pickString(record.accentColor, record.accent_color, record.destaque),
    hpColor: pickString(record.hpColor, record.hp_color, record.vida),
    shieldColor: pickString(record.shieldColor, record.shield_color, record.escudo),
    textColor: pickString(record.textColor, record.text_color, record.texto),
  };
}

function normalizeEnemyVisual(raw: unknown): IAEnemyVisualSpec | null {
  const record = asRecord(raw);
  if (!record) return null;

  return {
    preset: pickString(record.preset, record.variant, record.variante, record.layout),
    avatarUrl: pickString(record.avatarUrl, record.avatar_url, record.avatar, record.imageUrl),
    backgroundUrl: pickString(
      record.backgroundUrl,
      record.background_url,
      record.bgUrl,
      record.bg_url
    ),
    frameUrl: pickString(record.frameUrl, record.frame_url, record.molduraUrl, record.moldura_url),
    effectUrl: pickString(record.effectUrl, record.effect_url, record.fxUrl, record.fx_url),
    badgeLabel: pickString(record.badgeLabel, record.badge_label, record.badge, record.rotulo),
    palette: normalizeBattlePalette(record.palette ?? record.paleta),
  };
}

function normalizeBattleTiming(raw: unknown): IABattleTiming | null {
  const record = asRecord(raw);
  if (!record) return null;

  const encounterDurationSec = pickNumber(
    record.encounterDurationSec,
    record.encounter_duration_sec,
    record.durationSec,
    record.duration_sec,
    record.duration,
    record.duracao
  );
  const warningAtSec = pickNumber(
    record.warningAtSec,
    record.warning_at_sec,
    record.warningAt,
    record.warning_at,
    record.alertAtSec,
    record.alert_at_sec
  );
  const introDelayMs = pickNumber(
    record.introDelayMs,
    record.intro_delay_ms,
    record.introDelay,
    record.intro_delay
  );
  const defeatDelayMs = pickNumber(
    record.defeatDelayMs,
    record.defeat_delay_ms,
    record.defeatDelay,
    record.defeat_delay
  );

  if (
    encounterDurationSec == null &&
    warningAtSec == null &&
    introDelayMs == null &&
    defeatDelayMs == null
  ) {
    return null;
  }

  return {
    encounterDurationSec:
      encounterDurationSec != null ? Math.max(0, Math.round(encounterDurationSec)) : null,
    warningAtSec: warningAtSec != null ? Math.max(0, Math.round(warningAtSec)) : null,
    introDelayMs: introDelayMs != null ? Math.max(0, Math.round(introDelayMs)) : null,
    defeatDelayMs: defeatDelayMs != null ? Math.max(0, Math.round(defeatDelayMs)) : null,
  };
}

function normalizeEnemy(raw: unknown): IAEnemySpec | null {
  const record = asRecord(raw);
  if (!record) return null;

  const id = pickString(record.id, record.enemyId, record.enemy_id, record.slug, record.name);
  const name = pickString(record.name, record.nome);
  const hpMax = pickNumber(
    record.hpMax,
    record.hp_max,
    record.hp,
    record.vidaMaxima,
    record.vida_maxima,
    record.vida
  );

  if (!id || !name || !hpMax || hpMax <= 0) return null;

  return {
    id,
    name,
    archetype: pickString(record.archetype, record.arquetipo, record.tipo),
    avatarUrl: pickString(
      record.avatarUrl,
      record.avatar_url,
      record.avatar,
      record.imageUrl,
      record.image_url,
      record.imagemUrl,
      record.imagem_url
    ),
    imagePrompt: pickString(
      record.imagePrompt,
      record.image_prompt,
      record.prompt,
      record.promptImagem,
      record.prompt_imagem
    ),
    visual: normalizeEnemyVisual(record.visual ?? record.appearance ?? record.visual_spec),
    contentId: pickNumber(record.contentId, record.content_id, record.content_id_ref),
    itemKey: pickString(record.itemKey, record.item_key, record.sourceItemKey, record.source_item_key),
    hpMax: Math.max(1, Math.round(hpMax)),
    shieldMax: Math.max(
      0,
      Math.round(
        pickNumber(
          record.shieldMax,
          record.shield_max,
          record.shield,
          record.escudoMaximo,
          record.escudo_maximo,
          record.escudo
        ) ?? 0
      )
    ),
    introLine: pickString(
      record.introLine,
      record.intro_line,
      record.fraseInicial,
      record.frase_inicial,
      record.introducao
    ),
    defeatLine: pickString(
      record.defeatLine,
      record.defeat_line,
      record.fraseDerrota,
      record.frase_derrota,
      record.derrota
    ),
  };
}

function normalizeBattle(raw: unknown): IABattleConfig | null {
  const record = asRecord(raw);
  if (!record) return null;

  const enemy = normalizeEnemy(record.enemy ?? record.inimigo);
  if (!enemy) return null;

  const damageRecord = asRecord(record.damage ?? record.dano);
  const damage = damageRecord
    ? {
        contentComplete: pickNumber(
          damageRecord.contentComplete,
          damageRecord.content_complete,
          damageRecord.conteudoConcluido
        ),
        activityCorrect: pickNumber(
          damageRecord.activityCorrect,
          damageRecord.activity_correct,
          damageRecord.atividadeAcertada
        ),
        activityComplete: pickNumber(
          damageRecord.activityComplete,
          damageRecord.activity_complete,
          damageRecord.atividadeConcluida
        ),
      }
    : null;

  return {
    enemy,
    damage,
    timing: normalizeBattleTiming(record.timing ?? record.tempo ?? record),
    victoryMessage: pickString(record.victoryMessage, record.victory_message, record.mensagemVitoria),
    persistKey: pickString(record.persistKey, record.chavePersistencia),
    sourceItemKey: pickString(
      record.sourceItemKey,
      record.source_item_key,
      record.itemKey,
      record.item_key,
      enemy.itemKey
    ),
  };
}

function normalizeCharacter(raw: unknown): IACharacterConfig | null {
  const record = asRecord(raw);
  if (!record) return null;

  return {
    speakerName: pickString(record.speakerName, record.nome, record.personagem),
    avatarUrl: pickString(record.avatarUrl, record.avatar_url, record.avatar, record.imagemUrl),
    style: pickString(record.style, record.estilo),
  };
}

export function buildIAItemKey(
  kind: "content" | "activity" | "question" | "card",
  id: string | number
) {
  return `${kind}:${id}`;
}

export function resolveIAItemKey(
  raw: unknown,
  fallback?: {
    kind: "content" | "activity" | "question" | "card";
    id?: string | number | null;
  }
) {
  const record = asRecord(raw);
  const explicitItemKey = record
    ? pickString(
        record.itemKey,
        record.item_key,
        record.sourceItemKey,
        record.source_item_key
      )
    : null;

  if (explicitItemKey) {
    return explicitItemKey;
  }

  const inferredKindRaw = pickString(record?.itemKind, record?.item_kind);
  const inferredKind =
    inferredKindRaw && ["content", "activity", "question", "card"].includes(inferredKindRaw)
      ? (inferredKindRaw as "content" | "activity" | "question" | "card")
      : null;
  const inferredId =
    pickNumber(
      record?.contentId,
      record?.content_id,
      record?.content_id_ref,
      record?.activityId,
      record?.activity_id,
      record?.questionId,
      record?.question_id,
      record?.cardId,
      record?.card_id
    ) ?? null;

  if (inferredKind && inferredId != null) {
    return buildIAItemKey(inferredKind, inferredId);
  }

  if (record) {
    const contentId = pickNumber(record.contentId, record.content_id, record.content_id_ref);
    if (contentId != null) return buildIAItemKey("content", contentId);

    const activityId = pickNumber(record.activityId, record.activity_id);
    if (activityId != null) return buildIAItemKey("activity", activityId);

    const questionId = pickNumber(record.questionId, record.question_id);
    if (questionId != null) return buildIAItemKey("question", questionId);

    const cardId = pickNumber(record.cardId, record.card_id);
    if (cardId != null) return buildIAItemKey("card", cardId);
  }

  if (fallback?.id != null) {
    return buildIAItemKey(fallback.kind, fallback.id);
  }

  return null;
}

export function buildIAFeatureCopyFromText(
  message: string,
  extras: Partial<IAFeatureCopy> = {}
): IAFeatureCopy {
  return {
    body: message,
    ...extras,
  };
}

export function normalizeIAMentalStateSnapshot(raw: unknown): IAMentalStateSnapshot | null {
  const record = asRecord(raw);
  if (!record) return null;

  const kind =
    normalizeMentalStateKind(record.kind) ??
    normalizeMentalStateKind(record.state) ??
    normalizeMentalStateKind(record.estado) ??
    "neutral";

  return {
    kind,
    intensity: clamp01(
      pickNumber(record.intensity, record.intensidade),
      kind === "neutral" ? 0 : 0.5
    ),
    confidence: clamp01(
      pickNumber(record.confidence, record.confianca, record.confiabilidade),
      0.6
    ),
    reason: pickString(record.reason, record.justification, record.motivo),
    source: "ai",
    observedAt: pickString(record.observedAt, record.observed_at, record.observadoEm),
    expiresAt: pickString(record.expiresAt, record.expires_at, record.expiraEm),
  };
}

export function normalizeIAFeaturePatch(raw: unknown): IAFeaturePatch | null {
  const record = asRecord(raw);
  if (!record) return null;

  const key = normalizeFeatureKey(record.key ?? record.feature ?? record.nome);
  if (!key) return null;

  return {
    key,
    enabled: pickBoolean(record.enabled, record.ativo, record.active),
    mode: pickString(record.mode, record.modo),
    priority: pickNumber(record.priority, record.prioridade),
    cooldownMs: pickNumber(record.cooldownMs, record.cooldown, record.cooldown_ms),
    copy: normalizeCopy(record.copy ?? record.texto ?? record.mensagem),
    timer: normalizeTimer(record.timer ?? record.temporizador),
    battle: normalizeBattle(record.battle ?? record.batalha),
    character: normalizeCharacter(record.character ?? record.personagem),
    metadata: asRecord(record.metadata ?? record.meta),
  };
}

function normalizeTriggerSignal(value: unknown): IATriggerSignalType | null {
  const normalized = String(value ?? "").trim().toLowerCase();
  const allSignals: IATriggerSignalType[] = [
    "topic_open",
    "content_open",
    "content_complete",
    "activity_start",
    "activity_correct",
    "activity_wrong",
    "wrong_streak",
    "activity_complete",
    "timer_warning",
    "timer_timeout",
    "encounter_timeout",
    "idle_detected",
  ];

  return allSignals.includes(normalized as IATriggerSignalType)
    ? (normalized as IATriggerSignalType)
    : null;
}

function normalizeCharacterCue(raw: unknown): Omit<IACharacterCue, "id" | "createdAt"> | null {
  const record = asRecord(raw);
  if (!record) return null;

  const message = pickString(record.message, record.body, record.mensagem, record.texto);
  if (!message) return null;

  return {
    speakerName: pickString(record.speakerName, record.nome, record.personagem),
    avatarUrl: pickString(record.avatarUrl, record.avatar, record.imagemUrl),
    title: pickString(record.title, record.titulo),
    message,
    tone: pickString(record.tone, record.tom),
    topicoId: pickNumber(record.topicoId, record.topico_id),
    itemKey: pickString(record.itemKey, record.item_key),
    featureKey:
      normalizeFeatureKey(record.featureKey ?? record.feature_key ?? record.feature) ?? null,
    action:
      normalizeTimeoutAction(record.action) ??
      (pickString(record.action) === "dismiss" ? "dismiss" : null),
    actionLabel: pickString(record.actionLabel, record.cta, record.botao),
  };
}

export function normalizeIATriggerRule(raw: unknown, fallbackId: string): IATriggerRule | null {
  const record = asRecord(raw);
  if (!record) return null;

  const signalList = [
    ...asArray(record.signal),
    ...asArray(record.signals),
    ...(record.on ? [record.on] : []),
  ]
    .map((signal) => normalizeTriggerSignal(signal))
    .filter(Boolean) as IATriggerSignalType[];

  if (!signalList.length) return null;

  const cue = normalizeCharacterCue(record.cue ?? record.message ?? record.mensagem);

  return {
    id: pickString(record.id, record.slug) ?? fallbackId,
    signal: signalList.length === 1 ? signalList[0] : signalList,
    featureKey:
      normalizeFeatureKey(record.featureKey ?? record.feature_key ?? record.feature) ?? null,
    cooldownMs: pickNumber(record.cooldownMs, record.cooldown, record.cooldown_ms),
    minWrongStreak: pickNumber(record.minWrongStreak, record.wrongStreakAtLeast, record.errosSeguidos),
    mentalStates: [
      ...asArray(record.mentalStates),
      ...asArray(record.estadosMentais),
    ]
      .map((state) => normalizeMentalStateKind(state))
      .filter(Boolean) as IAMentalStateKind[],
    itemKey: pickString(record.itemKey, record.item_key),
    cue,
    action:
      normalizeTimeoutAction(record.action) ??
      (pickString(record.action) === "enqueue_cue" ? "enqueue_cue" : null),
  };
}

export function normalizeIAPersonalizationPatch(raw: unknown): IAPersonalizationPatch | null {
  const record = asRecord(raw);
  if (!record) return null;

  const session = asArray(record.session ?? record.sessionFeatures ?? record.session_features)
    .map(normalizeIAFeaturePatch)
    .filter((item): item is IAFeaturePatch => Boolean(item));

  const topic = asArray(record.topic ?? record.topicFeatures ?? record.topic_features)
    .map(normalizeIAFeaturePatch)
    .filter((item): item is IAFeaturePatch => Boolean(item));

  const items: Record<string, IAFeaturePatch[]> = {};
  const rawItems = record.items ?? record.itemFeatures ?? record.item_features;

  if (isRecord(rawItems)) {
    Object.entries(rawItems).forEach(([itemKey, patches]) => {
      const normalized = asArray(patches)
        .map(normalizeIAFeaturePatch)
        .filter((item): item is IAFeaturePatch => Boolean(item));
      if (normalized.length) items[itemKey] = normalized;
    });
  } else {
    asArray(rawItems).forEach((entry, index) => {
      const entryRecord = asRecord(entry);
      if (!entryRecord) return;
      const itemKey = pickString(entryRecord.itemKey, entryRecord.item_key);
      if (!itemKey) return;
      const normalized = asArray(entryRecord.features ?? entryRecord.patches ?? entryRecord.config)
        .map(normalizeIAFeaturePatch)
        .filter((item): item is IAFeaturePatch => Boolean(item));
      if (normalized.length) items[itemKey] = normalized;
      if (!normalized.length && Array.isArray(entry) && index >= 0) {
        items[itemKey] = normalized;
      }
    });
  }

  const triggers = asArray(record.triggers ?? record.gatilhos)
    .map((trigger, index) => normalizeIATriggerRule(trigger, `trigger-${index}`))
    .filter((item): item is IATriggerRule => Boolean(item));

  const mentalState = normalizeIAMentalStateSnapshot(
    record.mentalState ?? record.mental_state ?? record.estadoMental ?? record.estado_mental
  );

  return {
    mentalState,
    session,
    topic,
    items,
    triggers,
  };
}
