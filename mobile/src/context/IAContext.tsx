import AsyncStorage from "@react-native-async-storage/async-storage";
import { getBrainHexGuideName } from "@/constants/profileImages";
import { useUsuario } from "@/context/SessaoContext";
import {
  buildIAFeatureCopyFromText,
  buildIAItemKey,
  IABattleConfig,
  IABattleRuntimeState,
  IACharacterCue,
  IAFeatureCopy,
  IAFeatureDescriptor,
  IAFeatureKey,
  IAFeaturePatch,
  IAFeatureSelectorScope,
  IAMentalStateSnapshot,
  IAPersonalizationPatch,
  IAResolvedFeatureState,
  IATimerConfig,
  IATriggerRule,
  IATriggerSignal,
} from "@/interfaces/personalizacao/IAContracts";
import { PersonalizedTopicPayload } from "@/interfaces/personalizacao/IPersonalizedTopic";
import {
  hasAnyBrainHexProfileSignal,
  hasBrainHexProfileSignal,
  resolveDominantBrainHexProfile,
} from "@/utils/brainHex";
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

type TopicPatchState = {
  topicoId: number;
  cycleId?: string | null;
  patch: IAPersonalizationPatch | null;
};

type IARuntimeStates = {
  wrongStreaks: Record<string, number>;
  triggerCooldowns: Record<string, number>;
  suppressedUntil: Record<string, number>;
  battleStates: Record<string, IABattleRuntimeState>;
  lastSignals: IATriggerSignal[];
};

type IAResolvedFeaturesState = {
  session: Record<IAFeatureKey, IAResolvedFeatureState>;
  topics: Record<number, Record<IAFeatureKey, IAResolvedFeatureState>>;
  items: Record<string, Record<IAFeatureKey, IAResolvedFeatureState>>;
};

type BattleScope = Extract<IAFeatureSelectorScope, { scope: "topic" | "item" }>;
export type IATriggerSignalListener = (signal: IATriggerSignal) => void;

type IAContextValue = {
  mentalState: IAMentalStateSnapshot;
  featureRegistry: Record<IAFeatureKey, IAFeatureDescriptor>;
  resolvedFeatures: IAResolvedFeaturesState;
  runtimeStates: IARuntimeStates;
  userPreferences: Partial<Record<IAFeatureKey, boolean>>;
  pendingCharacterCues: IACharacterCue[];
  registerTopicPayload: (payload: PersonalizedTopicPayload | null | undefined) => void;
  setActiveTopic: (topicoId: number | null, cycleId?: string | null) => void;
  hasFeaturePatch: (scope: IAFeatureSelectorScope, key: IAFeatureKey) => boolean;
  resolveFeature: (
    scope: IAFeatureSelectorScope,
    key: IAFeatureKey
  ) => IAResolvedFeatureState;
  emitSignal: (signal: IATriggerSignal) => void;
  subscribeToSignals: (listener: IATriggerSignalListener) => () => void;
  setUserFeaturePreference: (key: IAFeatureKey, enabled: boolean) => Promise<void>;
  dismissCharacterCue: (id: string) => void;
  pushMentorCue: (cue: {
    message: string;
    title?: string | null;
    topicoId?: number | null;
    itemKey?: string | null;
    actionLabel?: string | null;
  }) => void;
  getBattleState: (scope: BattleScope) => IABattleRuntimeState | null;
  resetBattleState: (scope: BattleScope) => Promise<void>;
};

const FEATURE_KEYS: IAFeatureKey[] = [
  "activity_timer",
  "reading_timer",
  "mentor_character",
  "battle_mode",
];

const DEFAULT_MENTAL_STATE: IAMentalStateSnapshot = {
  kind: "neutral",
  intensity: 0,
  confidence: 0.5,
  source: "ai",
  reason: null,
  observedAt: null,
  expiresAt: null,
};

const DEFAULT_FEATURE_REGISTRY: Record<IAFeatureKey, IAFeatureDescriptor> = {
  activity_timer: {
    key: "activity_timer",
    label: "Temporizador de atividade",
    defaultEnabled: false,
    defaultMode: "soft",
    defaultPriority: 40,
    defaultCooldownMs: 30_000,
    supportedScopes: ["session", "topic", "item"],
    disabledMentalStates: ["overwhelmed"],
    copy: buildIAFeatureCopyFromText("Respire. O tempo acabou, mas você pode tentar novamente.", {
      speakerName: "Guia",
      actionLabel: "Continuar",
      tone: "suporte",
    }),
    timer: {
      durationSec: 90,
      warningAtSec: 20,
      timeoutAction: "nudge",
      autoStart: true,
      label: "Tempo da atividade",
    },
  },
  reading_timer: {
    key: "reading_timer",
    label: "Temporizador de leitura",
    defaultEnabled: false,
    defaultMode: "soft",
    defaultPriority: 35,
    defaultCooldownMs: 20_000,
    supportedScopes: ["session", "topic", "item"],
    disabledMentalStates: ["overwhelmed"],
    copy: buildIAFeatureCopyFromText("Seu ritmo desacelerou. Se quiser, faça uma pausa curta.", {
      speakerName: "Guia",
      actionLabel: "Entendi",
      tone: "suporte",
    }),
    timer: {
      durationSec: 240,
      warningAtSec: 45,
      timeoutAction: "suggest_break",
      autoStart: true,
      label: "Tempo sugerido de leitura",
    },
  },
  mentor_character: {
    key: "mentor_character",
    label: "Personagem mentor",
    defaultEnabled: true,
    defaultMode: "proactive",
    defaultPriority: 55,
    defaultCooldownMs: 25_000,
    supportedScopes: ["session", "topic", "item"],
    copy: buildIAFeatureCopyFromText("Estou acompanhando você. Se travar, eu apareço com uma dica.", {
      speakerName: "Guia",
      tone: "suporte",
    }),
    character: {
      speakerName: "Guia",
      style: "mentor",
    },
  },
  battle_mode: {
    key: "battle_mode",
    label: "Modo batalha",
    defaultEnabled: false,
    defaultMode: "content_enemy",
    defaultPriority: 45,
    defaultCooldownMs: 15_000,
    supportedScopes: ["session", "topic", "item"],
    disabledMentalStates: ["anxious", "overwhelmed"],
    copy: buildIAFeatureCopyFromText("Cada acerto enfraquece o inimigo do tópico.", {
      speakerName: "Guia",
      tone: "desafiador",
    }),
    battle: {
      enemy: {
        id: "sombra-do-topico",
        name: "Sombra do Tópico",
        archetype: "phantom",
        hpMax: 100,
        shieldMax: 30,
        introLine: "Eu vou cair conforme você avançar.",
        defeatLine: "Você dominou este tópico.",
        imagePrompt: "Fantasma de estudo com brilho violeta e aura etérea.",
        visual: {
          preset: "phantom",
          badgeLabel: "Boss",
          palette: {
            primaryColor: "#f97316",
            secondaryColor: "#7a8794",
            accentColor: "#fcd34d",
            hpColor: "#f97316",
            shieldColor: "#60a5fa",
            textColor: "#f8fafc",
          },
        },
      },
      damage: {
        contentComplete: 12,
        activityCorrect: 18,
        activityComplete: 24,
      },
      timing: {
        encounterDurationSec: 300,
        warningAtSec: 45,
        introDelayMs: 0,
        defeatDelayMs: 0,
      },
      victoryMessage: "Tópico dominado. O inimigo foi derrotado.",
    },
  },
};

const IAContext = createContext<IAContextValue | null>(null);

function getFeaturePreferenceStorageKey(userId: string) {
  return `@trailup/ia/preferences/${userId}`;
}

function getBattleStateStorageKey(userId: string) {
  return `@trailup/ia/battles/${userId}`;
}

function getNow() {
  return Date.now();
}

function isMentalStateExpired(state?: IAMentalStateSnapshot | null) {
  if (!state?.expiresAt) return false;
  const expiresAt = new Date(state.expiresAt).getTime();
  return Number.isFinite(expiresAt) && expiresAt <= getNow();
}

function getEffectiveMentalState(state?: IAMentalStateSnapshot | null) {
  if (!state || isMentalStateExpired(state)) {
    return DEFAULT_MENTAL_STATE;
  }
  return state;
}

function buildScopeFeatureKey(scope: IAFeatureSelectorScope, key: IAFeatureKey) {
  if (scope.scope === "session") return `session:${key}`;
  if (scope.scope === "topic") return `topic:${scope.topicoId}:${key}`;
  return `item:${scope.itemKey}:${key}`;
}

function buildBattleRuntimeKey(
  userId: string,
  scope: BattleScope,
  enemyId: string,
  cycleId?: string | null,
  persistKey?: string | null
) {
  const topicoId = scope.scope === "topic" ? scope.topicoId : scope.topicoId ?? 0;
  const scopeKey = scope.scope === "item" ? scope.itemKey : "topic";
  const suffix = persistKey ?? cycleId ?? "default";
  return `${userId}:${topicoId}:${scopeKey}:${suffix}:${enemyId}`;
}

function mergeCopy(base?: IAFeatureCopy | null, patch?: IAFeatureCopy | null) {
  if (!base && !patch) return null;
  return {
    ...(base ?? {}),
    ...(patch ?? {}),
  };
}

function mergeTimer(base?: IATimerConfig | null, patch?: Partial<IATimerConfig> | null) {
  if (!base && !patch) return null;
  const merged = {
    ...(base ?? {}),
    ...(patch ?? {}),
  };

  if (!merged.durationSec || merged.durationSec <= 0) return null;
  return merged as IATimerConfig;
}

function mergeBattle(base?: IABattleConfig | null, patch?: Partial<IABattleConfig> | null) {
  if (!base && !patch) return null;
  const mergedVisual = {
    ...(base?.enemy?.visual ?? {}),
    ...(patch?.enemy?.visual ?? {}),
    palette: {
      ...(base?.enemy?.visual?.palette ?? {}),
      ...(patch?.enemy?.visual?.palette ?? {}),
    },
  };
  const mergedEnemy = {
    ...(base?.enemy ?? {}),
    ...(patch?.enemy ?? {}),
    visual: Object.keys(mergedVisual).length ? mergedVisual : null,
  };

  if (!mergedEnemy.id || !mergedEnemy.name || !mergedEnemy.hpMax) {
    return null;
  }

  return {
    ...(base ?? {}),
    ...(patch ?? {}),
    enemy: mergedEnemy,
    damage: {
      ...(base?.damage ?? {}),
      ...(patch?.damage ?? {}),
    },
    timing: {
      ...(base?.timing ?? {}),
      ...(patch?.timing ?? {}),
    },
  } as IABattleConfig;
}

function inferProfileDefaultPatches(
  perfis?: { nome?: string | null; afinidade?: number | null }[] | null,
  profileName?: string | null,
  guideName?: string | null,
  modoNome?: string | null
): IAFeaturePatch[] {
  const profile = String(profileName ?? "").trim().toLowerCase();
  const modo = String(modoNome ?? "").trim().toLowerCase();
  const patches: IAFeaturePatch[] = [];
  const hasBattleSignal = hasBrainHexProfileSignal(perfis, "survivor");
  const hasSocialSignal = hasBrainHexProfileSignal(perfis, "socializer");
  const hasTimerSignal = hasAnyBrainHexProfileSignal(perfis, [
    "survivor",
    "mastermind",
    "achiever",
    "conqueror",
    "daredevil",
  ]);

  if (hasTimerSignal || ["mastermind", "achiever"].includes(profile)) {
    patches.push({
      key: "reading_timer",
      enabled: true,
      priority: 44,
      timer: { durationSec: 300, warningAtSec: 60 },
    });
    patches.push({
      key: "activity_timer",
      enabled: true,
      priority: 42,
      timer: { durationSec: 120, warningAtSec: 30 },
    });
  }

  if (hasSocialSignal || ["socializer", "seeker"].includes(profile)) {
    patches.push({
      key: "mentor_character",
      enabled: true,
      priority: hasSocialSignal ? 68 : 60,
      character: {
        speakerName: guideName,
        style: hasSocialSignal || profile === "socializer" ? "friendly" : "explorer",
      },
      copy: buildIAFeatureCopyFromText(
        hasSocialSignal
          ? "Vou priorizar a conversa para explicar personalização, progresso e estratégia sem entregar respostas."
          : "Estou acompanhando você. Se travar, eu apareço com uma dica.",
        {
          speakerName: guideName,
          tone: "suporte",
        }
      ),
    });
  }

  if (hasBattleSignal) {
    patches.push({
      key: "battle_mode",
      enabled: true,
      priority: 52,
    });
  }

  if (modo.includes("atividade")) {
    patches.push({
      key: "activity_timer",
      enabled: true,
      priority: 48,
    });
  }

  if (modo.includes("conteudo")) {
    patches.push({
      key: "reading_timer",
      enabled: true,
      priority: 46,
    });
  }

  return patches;
}

function deriveItemKey(signal: IATriggerSignal) {
  if (signal.itemKey) return signal.itemKey;
  if (signal.questionId != null) return buildIAItemKey("question", signal.questionId);
  if (signal.activityId != null) return buildIAItemKey("activity", signal.activityId);
  if (signal.contentId != null) return buildIAItemKey("content", signal.contentId);
  if (signal.cardId != null) return buildIAItemKey("card", signal.cardId);
  return null;
}

function buildDefaultCueId() {
  return `cue-${getNow()}-${Math.random().toString(36).slice(2, 8)}`;
}

function applyDamageToBattleState(state: IABattleRuntimeState, damage: number) {
  const normalizedDamage = Math.max(0, Math.round(damage));
  if (normalizedDamage <= 0 || state.defeated) {
    return { nextState: state, defeatedNow: false };
  }

  let remainingDamage = normalizedDamage;
  const shield = Math.max(0, state.currentShield);
  const hp = Math.max(0, state.currentHp);

  const shieldAfter = Math.max(0, shield - remainingDamage);
  remainingDamage = Math.max(0, remainingDamage - shield);
  const hpAfter = Math.max(0, hp - remainingDamage);
  const defeatedNow = hp > 0 && hpAfter <= 0;

  return {
    defeatedNow,
    nextState: {
      ...state,
      currentShield: shieldAfter,
      currentHp: hpAfter,
      totalDamage: state.totalDamage + normalizedDamage,
      defeated: hpAfter <= 0,
      defeatedAt: defeatedNow ? getNow() : state.defeatedAt ?? null,
      lastDamageAt: getNow(),
      encounterEndsAt: hpAfter <= 0 ? null : state.encounterEndsAt ?? null,
      updatedAt: getNow(),
    },
  };
}

type BattleDifficultyKey = "easy" | "medium" | "hard";

type BattleDifficultyRule = {
  hpMax: number;
  shieldMax: number;
  damage: {
    contentComplete: number;
    activityCorrect: number;
    activityComplete: number;
    min: number;
    max: number;
  };
};

const BATTLE_DIFFICULTY_RULES: Record<BattleDifficultyKey, BattleDifficultyRule> = {
  easy: {
    hpMax: 120,
    shieldMax: 24,
    damage: {
      contentComplete: 8,
      activityCorrect: 14,
      activityComplete: 18,
      min: 4,
      max: 24,
    },
  },
  medium: {
    hpMax: 180,
    shieldMax: 36,
    damage: {
      contentComplete: 12,
      activityCorrect: 18,
      activityComplete: 24,
      min: 6,
      max: 36,
    },
  },
  hard: {
    hpMax: 260,
    shieldMax: 52,
    damage: {
      contentComplete: 16,
      activityCorrect: 24,
      activityComplete: 32,
      min: 8,
      max: 52,
    },
  },
};

function normalizeBattleDifficulty(input: unknown): BattleDifficultyKey {
  const normalized = String(input ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, "_");

  if (["facil", "easy", "beginner", "iniciante"].includes(normalized)) {
    return "easy";
  }
  if (["dificil", "hard", "avancado", "advanced"].includes(normalized)) {
    return "hard";
  }
  return "medium";
}

function readSignalMetaNumber(signal: IATriggerSignal, ...keys: string[]) {
  const meta = signal.meta;
  if (!meta || typeof meta !== "object") return null;

  for (const key of keys) {
    const parsed = Number((meta as Record<string, unknown>)[key]);
    if (Number.isFinite(parsed)) return parsed;
  }

  return null;
}

function readSignalMetaPercent(signal: IATriggerSignal, ...keys: string[]) {
  const value = readSignalMetaNumber(signal, ...keys);
  if (!Number.isFinite(Number(value))) return 0;
  return Math.max(0, Math.min(100, Number(value)));
}

function resolveBattleDifficultyFromSignal(
  signal: IATriggerSignal,
  fallback?: string | null
) {
  const metaDifficulty =
    signal.meta && typeof signal.meta === "object"
      ? (signal.meta as Record<string, unknown>).moduleDifficulty
      : null;
  return normalizeBattleDifficulty(metaDifficulty ?? fallback ?? "medium");
}

function clampBattleDamage(rawDamage: number, difficulty: BattleDifficultyKey) {
  const limits = BATTLE_DIFFICULTY_RULES[difficulty].damage;
  const rounded = Math.round(Number(rawDamage) || 0);
  return Math.max(limits.min, Math.min(limits.max, rounded));
}

function getDefaultBattleDamage(signal: IATriggerSignal, config?: IABattleConfig | null) {
  const difficulty = resolveBattleDifficultyFromSignal(signal);
  const rule = BATTLE_DIFFICULTY_RULES[difficulty];
  const configDamage = config?.damage ?? null;

  if (signal.type === "content_complete") {
    const base =
      Number(configDamage?.contentComplete ?? rule.damage.contentComplete) || rule.damage.contentComplete;
    return clampBattleDamage(base, difficulty);
  }

  if (signal.type === "activity_correct") {
    const base =
      Number(configDamage?.activityCorrect ?? rule.damage.activityCorrect) || rule.damage.activityCorrect;
    const acertosPercentual = readSignalMetaPercent(signal, "acertosPercentual", "accuracyPct");
    const rawDamage = base * (0.6 + 0.8 * (acertosPercentual / 100));
    return clampBattleDamage(rawDamage, difficulty);
  }

  if (signal.type === "activity_complete") {
    const base =
      Number(configDamage?.activityComplete ?? rule.damage.activityComplete) || rule.damage.activityComplete;
    const scoreAwarded = readSignalMetaNumber(signal, "scoreAwarded", "score_awarded");
    const scoreMax = readSignalMetaNumber(signal, "scoreMax", "score_max", "pontuacaoMaxima");
    const fallbackRatio = readSignalMetaPercent(signal, "acertosPercentual", "accuracyPct") / 100;
    const scoreRatio =
      scoreAwarded != null &&
      scoreMax != null &&
      Number(scoreMax) > 0
        ? Math.max(0, Math.min(1, Number(scoreAwarded) / Number(scoreMax)))
        : fallbackRatio;
    const rawDamage = base * (0.8 + 0.6 * scoreRatio);
    return clampBattleDamage(rawDamage, difficulty);
  }

  return 0;
}

export function IAProvider({ children }: { children: React.ReactNode }) {
  const { usuario } = useUsuario();
  const [mentalState, setMentalState] = useState<IAMentalStateSnapshot | null>(null);
  const [topicPatches, setTopicPatches] = useState<Record<number, TopicPatchState>>({});
  const [activeTopicId, setActiveTopicId] = useState<number | null>(null);
  const [activeCycleId, setActiveCycleId] = useState<string | null>(null);
  const [userPreferences, setUserPreferences] = useState<Partial<Record<IAFeatureKey, boolean>>>({});
  const [pendingCharacterCues, setPendingCharacterCues] = useState<IACharacterCue[]>([]);
  const [runtimeStates, setRuntimeStates] = useState<IARuntimeStates>({
    wrongStreaks: {},
    triggerCooldowns: {},
    suppressedUntil: {},
    battleStates: {},
    lastSignals: [],
  });
  const signalListenersRef = useRef<Set<IATriggerSignalListener>>(
    new Set<IATriggerSignalListener>()
  );

  const userId = usuario?.id ?? null;
  const perfis = usuario?.perfis ?? null;
  const profileName = resolveDominantBrainHexProfile(usuario?.perfis ?? null, "seeker");
  const guideName = getBrainHexGuideName(profileName);
  const modoNome = usuario?.modoOperacao_nome ?? usuario?.modoOperacao_descricao ?? null;
  const hasBattleProfileSignal = useMemo(
    () => hasBrainHexProfileSignal(perfis, "survivor"),
    [perfis]
  );
  const hasTimerProfileSignal = useMemo(
    () =>
      hasAnyBrainHexProfileSignal(perfis, [
        "survivor",
        "mastermind",
        "achiever",
        "conqueror",
        "daredevil",
      ]),
    [perfis]
  );
  const featureRegistry = DEFAULT_FEATURE_REGISTRY;
  const effectiveMentalState = useMemo(
    () => getEffectiveMentalState(mentalState),
    [mentalState]
  );
  const profileDefaultPatches = useMemo(
    () => inferProfileDefaultPatches(perfis, profileName, guideName, modoNome),
    [guideName, modoNome, perfis, profileName]
  );

  useEffect(() => {
    let active = true;

    async function hydratePreferences() {
      if (!userId) {
        if (active) {
          setUserPreferences({});
          setRuntimeStates((prev) => ({ ...prev, battleStates: {} }));
          setPendingCharacterCues([]);
        }
        return;
      }

      try {
        const [rawPrefs, rawBattles] = await Promise.all([
          AsyncStorage.getItem(getFeaturePreferenceStorageKey(userId)),
          AsyncStorage.getItem(getBattleStateStorageKey(userId)),
        ]);

        if (!active) return;

        setUserPreferences(rawPrefs ? JSON.parse(rawPrefs) : {});
        setRuntimeStates((prev) => ({
          ...prev,
          battleStates: rawBattles ? JSON.parse(rawBattles) : {},
        }));
      } catch {
        if (!active) return;
        setUserPreferences({});
      }
    }

    void hydratePreferences();

    return () => {
      active = false;
    };
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    void AsyncStorage.setItem(
      getFeaturePreferenceStorageKey(userId),
      JSON.stringify(userPreferences)
    );
  }, [userId, userPreferences]);

  useEffect(() => {
    if (!userId) return;
    void AsyncStorage.setItem(
      getBattleStateStorageKey(userId),
      JSON.stringify(runtimeStates.battleStates)
    );
  }, [runtimeStates.battleStates, userId]);

  const registerTopicPayload = useCallback((payload: PersonalizedTopicPayload | null | undefined) => {
    if (!payload?.topicoId) return;

    setTopicPatches((prev) => {
      const nextEntry: TopicPatchState = {
        topicoId: payload.topicoId,
        cycleId: payload.planMeta.cycleId ?? null,
        patch: payload.aiPatch ?? null,
      };
      const currentEntry = prev[payload.topicoId];

      if (
        currentEntry?.cycleId === nextEntry.cycleId &&
        currentEntry?.patch === nextEntry.patch
      ) {
        return prev;
      }

      return {
        ...prev,
        [payload.topicoId]: nextEntry,
      };
    });

    if (payload.aiPatch?.mentalState) {
      setMentalState((prev) => {
        const nextMentalState = payload.aiPatch?.mentalState ?? null;
        if (
          prev?.kind === nextMentalState?.kind &&
          prev?.observedAt === nextMentalState?.observedAt &&
          prev?.expiresAt === nextMentalState?.expiresAt &&
          prev?.reason === nextMentalState?.reason
        ) {
          return prev;
        }
        return nextMentalState;
      });
    }
  }, []);

  const setActiveTopic = useCallback((topicoId: number | null, cycleId?: string | null) => {
    setActiveTopicId(topicoId);
    setActiveCycleId(cycleId ?? null);
  }, []);

  const getTopicPatch = useCallback(
    (topicoId?: number | null) => {
      if (topicoId == null) return null;
      return topicPatches[topicoId]?.patch ?? null;
    },
    [topicPatches]
  );

  const getCycleIdForTopico = useCallback(
    (topicoId?: number | null) => {
      if (topicoId == null) return activeCycleId ?? null;
      return topicPatches[topicoId]?.cycleId ?? activeCycleId ?? null;
    },
    [activeCycleId, topicPatches]
  );

  const hasItemFeaturePatch = useCallback(
    (topicoId: number | null | undefined, itemKey: string | null | undefined, key: IAFeatureKey) => {
      if (topicoId == null || !itemKey) return false;
      return Boolean(
        getTopicPatch(topicoId)?.items?.[itemKey]?.some((featurePatch) => featurePatch.key === key)
      );
    },
    [getTopicPatch]
  );

  const hasFeaturePatch = useCallback(
    (scope: IAFeatureSelectorScope, key: IAFeatureKey) => {
      const topicoId =
        scope.scope === "topic"
          ? scope.topicoId
          : scope.scope === "item"
          ? scope.topicoId ?? activeTopicId ?? null
          : activeTopicId ?? null;
      const patch = getTopicPatch(topicoId);

      if (scope.scope === "session") {
        return Boolean(patch?.session?.some((featurePatch) => featurePatch.key === key));
      }

      if (scope.scope === "topic") {
        return Boolean(patch?.topic?.some((featurePatch) => featurePatch.key === key));
      }

      return Boolean(
        scope.itemKey &&
          patch?.items?.[scope.itemKey]?.some((featurePatch) => featurePatch.key === key)
      );
    },
    [activeTopicId, getTopicPatch]
  );

  const resolveFeature = useCallback(
    (scope: IAFeatureSelectorScope, key: IAFeatureKey): IAResolvedFeatureState => {
      const descriptor = featureRegistry[key];
      const topicoId =
        scope.scope === "topic"
          ? scope.topicoId
          : scope.scope === "item"
          ? scope.topicoId ?? activeTopicId ?? null
          : activeTopicId ?? null;
      const itemKey = scope.scope === "item" ? scope.itemKey : null;
      const patch = getTopicPatch(topicoId);
      const sessionPatches = patch?.session ?? [];
      const topicPatchesList = patch?.topic ?? [];
      const itemPatches = itemKey ? patch?.items?.[itemKey] ?? [] : [];

      let resolved: IAResolvedFeatureState = {
        key,
        scope: scope.scope,
        enabled: descriptor.defaultEnabled,
        mode: descriptor.defaultMode ?? null,
        priority: descriptor.defaultPriority,
        cooldownMs: descriptor.defaultCooldownMs,
        copy: descriptor.copy ?? null,
        timer: descriptor.timer ?? null,
        battle: descriptor.battle ?? null,
        character: descriptor.character ?? null,
        topicoId,
        itemKey,
        disabledReason: null,
      };

      const mergePatch = (featurePatch?: IAFeaturePatch | null) => {
        if (!featurePatch || featurePatch.key !== key) return;
        if (featurePatch.enabled != null) resolved.enabled = featurePatch.enabled;
        if (featurePatch.mode != null) resolved.mode = featurePatch.mode;
        if (featurePatch.priority != null) resolved.priority = Number(featurePatch.priority);
        if (featurePatch.cooldownMs != null) {
          resolved.cooldownMs = Math.max(0, Number(featurePatch.cooldownMs));
        }
        resolved.copy = mergeCopy(resolved.copy, featurePatch.copy ?? null);
        resolved.timer = mergeTimer(resolved.timer, featurePatch.timer ?? null);
        resolved.battle = mergeBattle(resolved.battle, featurePatch.battle ?? null);
        resolved.character = {
          ...(resolved.character ?? {}),
          ...(featurePatch.character ?? {}),
        };
      };

      profileDefaultPatches.forEach(mergePatch);
      sessionPatches.forEach(mergePatch);
      topicPatchesList.forEach(mergePatch);
      itemPatches.forEach(mergePatch);

      if (userPreferences[key] === false) {
        resolved.enabled = false;
        resolved.disabledReason = "user_preference";
      }

      if (
        resolved.enabled &&
        descriptor.disabledMentalStates?.includes(effectiveMentalState.kind)
      ) {
        resolved.enabled = false;
        resolved.disabledReason = "mental_state";
      }

      const suppressedUntil =
        runtimeStates.suppressedUntil[buildScopeFeatureKey(scope, key)] ?? 0;
      if (resolved.enabled && suppressedUntil > getNow()) {
        resolved.enabled = false;
        resolved.disabledReason = "runtime_safety";
      }

      if (key === "battle_mode" && !hasBattleProfileSignal) {
        resolved.enabled = false;
        resolved.battle = null;
        resolved.disabledReason = "runtime_safety";
      }

      if ((key === "reading_timer" || key === "activity_timer") && !hasTimerProfileSignal) {
        resolved.enabled = false;
        resolved.timer = null;
        resolved.disabledReason = "runtime_safety";
      }

      if (key === "battle_mode" && (!resolved.battle?.enemy?.id || !resolved.battle.enemy.name)) {
        resolved.enabled = false;
      }

      if (key === "mentor_character") {
        resolved.character = {
          ...(resolved.character ?? {}),
          speakerName:
            resolved.character?.speakerName && resolved.character.speakerName !== "Guia"
              ? resolved.character.speakerName
              : guideName,
        };
        resolved.copy = resolved.copy
          ? {
              ...resolved.copy,
              speakerName:
                resolved.copy.speakerName && resolved.copy.speakerName !== "Guia"
                  ? resolved.copy.speakerName
                  : guideName,
            }
          : resolved.copy;
      }

      if (key !== "battle_mode" && key !== "mentor_character" && !resolved.timer?.durationSec) {
        resolved.enabled = false;
      }

      return resolved;
    },
    [
      activeTopicId,
      effectiveMentalState.kind,
      featureRegistry,
      getTopicPatch,
      hasBattleProfileSignal,
      hasTimerProfileSignal,
      guideName,
      profileDefaultPatches,
      runtimeStates.suppressedUntil,
      userPreferences,
    ]
  );

  const resolveBattleScope = useCallback(
    (scope: BattleScope): BattleScope | null => {
      if (scope.scope === "item") {
        const itemTopicoId = scope.topicoId ?? activeTopicId ?? null;
        if (
          itemTopicoId != null &&
          hasItemFeaturePatch(itemTopicoId, scope.itemKey, "battle_mode")
        ) {
          const itemResolved = resolveFeature(
            { scope: "item", topicoId: itemTopicoId, itemKey: scope.itemKey },
            "battle_mode"
          );

          if (itemResolved.enabled && itemResolved.battle) {
            return { scope: "item", topicoId: itemTopicoId, itemKey: scope.itemKey };
          }
        }

        if (itemTopicoId != null) {
          const topicResolved = resolveFeature(
            { scope: "topic", topicoId: itemTopicoId },
            "battle_mode"
          );

          if (topicResolved.enabled && topicResolved.battle) {
            return { scope: "topic", topicoId: itemTopicoId };
          }
        }

        return null;
      }

      const topicResolved = resolveFeature(scope, "battle_mode");
      return topicResolved.enabled && topicResolved.battle ? scope : null;
    },
    [activeTopicId, hasItemFeaturePatch, resolveFeature]
  );

  const enqueueCue = useCallback((cue: Omit<IACharacterCue, "id" | "createdAt">) => {
    if (!cue.message?.trim()) return;

    const nextCue: IACharacterCue = {
      ...cue,
      id: buildDefaultCueId(),
      createdAt: getNow(),
    };

    setPendingCharacterCues((prev) => [...prev.slice(-2), nextCue]);
  }, []);

  const getBattleState = useCallback(
    (scope: BattleScope) => {
      if (!userId) return null;
      const selectedScope = resolveBattleScope(scope);
      if (!selectedScope) return null;

      const resolved = resolveFeature(selectedScope, "battle_mode");
      const battle = resolved.battle;
      if (!resolved.enabled || !battle) return null;

      const cycleId = getCycleIdForTopico(selectedScope.topicoId);
      const battleKey = buildBattleRuntimeKey(
        userId,
        selectedScope,
        battle.enemy.id,
        cycleId,
        battle.persistKey
      );

      return runtimeStates.battleStates[battleKey] ?? null;
    },
    [getCycleIdForTopico, resolveBattleScope, resolveFeature, runtimeStates.battleStates, userId]
  );

  const ensureBattleState = useCallback(
    (scope: BattleScope, moduleDifficultyHint?: string | null) => {
      if (!userId) return null;
      const selectedScope = resolveBattleScope(scope);
      if (!selectedScope) return null;

      const resolved = resolveFeature(selectedScope, "battle_mode");
      const battle = resolved.battle;
      if (!resolved.enabled || !battle) return null;

      const cycleId = getCycleIdForTopico(selectedScope.topicoId);
      const battleKey = buildBattleRuntimeKey(
        userId,
        selectedScope,
        battle.enemy.id,
        cycleId,
        battle.persistKey
      );

      const existing = runtimeStates.battleStates[battleKey];
      const difficulty = normalizeBattleDifficulty(moduleDifficultyHint ?? existing?.moduleDifficulty);
      const rule = BATTLE_DIFFICULTY_RULES[difficulty];

      if (existing) {
        const previousHpMax = Math.max(1, Number(existing.enemy.hpMax ?? 1));
        const previousShieldMax = Math.max(0, Number(existing.enemy.shieldMax ?? 0));
        const hpRatio = Math.max(0, Math.min(1, Number(existing.currentHp ?? previousHpMax) / previousHpMax));
        const shieldRatio =
          previousShieldMax > 0
            ? Math.max(0, Math.min(1, Number(existing.currentShield ?? previousShieldMax) / previousShieldMax))
            : 0;
        const needsAdjustment =
          previousHpMax !== rule.hpMax ||
          previousShieldMax !== rule.shieldMax ||
          normalizeBattleDifficulty(existing.moduleDifficulty ?? null) !== difficulty;

        if (needsAdjustment) {
          const adjustedState: IABattleRuntimeState = {
            ...existing,
            moduleDifficulty: difficulty,
            enemy: {
              ...existing.enemy,
              hpMax: rule.hpMax,
              shieldMax: rule.shieldMax,
            },
            currentHp: Math.max(0, Math.round(rule.hpMax * hpRatio)),
            currentShield: Math.max(0, Math.round(rule.shieldMax * shieldRatio)),
            updatedAt: getNow(),
          };

          setRuntimeStates((prev) => ({
            ...prev,
            battleStates: {
              ...prev.battleStates,
              [battleKey]: adjustedState,
            },
          }));

          return adjustedState;
        }

        return existing;
      }

      const nextBattleState: IABattleRuntimeState = {
        topicoId:
          selectedScope.scope === "item"
            ? selectedScope.topicoId ?? activeTopicId ?? 0
            : selectedScope.topicoId,
        cycleId,
        moduleDifficulty: difficulty,
        enemy: {
          ...battle.enemy,
          hpMax: rule.hpMax,
          shieldMax: rule.shieldMax,
          itemKey: battle.enemy.itemKey ?? (selectedScope.scope === "item" ? selectedScope.itemKey : null),
        },
        itemKey:
          selectedScope.scope === "item"
            ? selectedScope.itemKey
            : battle.sourceItemKey ?? battle.enemy.itemKey ?? null,
        currentHp: rule.hpMax,
        currentShield: rule.shieldMax,
        totalDamage: 0,
        defeated: false,
        introShown: false,
        encounterEndsAt:
          battle.timing?.encounterDurationSec && battle.timing.encounterDurationSec > 0
            ? getNow() + battle.timing.encounterDurationSec * 1000
            : null,
        startedAt: getNow(),
        defeatedAt: null,
        lastDamageAt: null,
        warningSent: false,
        updatedAt: getNow(),
      };

      setRuntimeStates((prev) => ({
        ...prev,
        battleStates: {
          ...prev.battleStates,
          [battleKey]: nextBattleState,
        },
      }));

      return nextBattleState;
    },
    [activeTopicId, getCycleIdForTopico, resolveBattleScope, resolveFeature, runtimeStates.battleStates, userId]
  );

  const dismissCharacterCue = useCallback((id: string) => {
    setPendingCharacterCues((prev) => prev.filter((cue) => cue.id !== id));
  }, []);

  const pushMentorCue = useCallback(
    (cue: {
      message: string;
      title?: string | null;
      topicoId?: number | null;
      itemKey?: string | null;
      actionLabel?: string | null;
    }) => {
      const message = String(cue.message ?? "").trim();
      if (!message) return;

      enqueueCue({
        message,
        title: cue.title ?? `${guideName} e a personalização`,
        speakerName: guideName,
        avatarUrl: null,
        topicoId: cue.topicoId ?? null,
        itemKey: cue.itemKey ?? null,
        featureKey: "mentor_character",
        actionLabel: cue.actionLabel ?? "Entendi",
      });
    },
    [enqueueCue, guideName]
  );

  const subscribeToSignals = useCallback((listener: IATriggerSignalListener) => {
    signalListenersRef.current.add(listener);
    return () => {
      signalListenersRef.current.delete(listener);
    };
  }, []);

  const setUserFeaturePreference = useCallback(
    async (key: IAFeatureKey, enabled: boolean) => {
      setUserPreferences((prev) => ({
        ...prev,
        [key]: enabled,
      }));
    },
    []
  );

  const resetBattleState = useCallback(
    async (scope: BattleScope) => {
      if (!userId) return;

      setRuntimeStates((prev) => {
        const nextBattles = { ...prev.battleStates };

        Object.keys(nextBattles).forEach((battleKey) => {
          if (scope.scope === "topic") {
            if (battleKey.includes(`:${scope.topicoId}:`)) {
              delete nextBattles[battleKey];
            }
            return;
          }

          const itemTopicoId = scope.topicoId ?? activeTopicId ?? null;
          if (itemTopicoId == null) return;
          if (battleKey.includes(`:${itemTopicoId}:${scope.itemKey}:`)) {
            delete nextBattles[battleKey];
          }
        });

        return {
          ...prev,
          battleStates: nextBattles,
        };
      });
    },
    [activeTopicId, userId]
  );

  const resolveBattleScopeFromSignal = useCallback(
    (signal: IATriggerSignal): BattleScope | null => {
      const topicoId = signal.topicoId ?? activeTopicId ?? null;
      if (topicoId == null) return null;

      const meta = (signal.meta ?? null) as Record<string, unknown> | null;
      const explicitContentItemKey =
        typeof meta?.contentItemKey === "string" && meta.contentItemKey.trim()
          ? meta.contentItemKey.trim()
          : null;
      const referencedContentId =
        typeof meta?.contentId === "number" && Number.isFinite(meta.contentId)
          ? Number(meta.contentId)
          : signal.contentId != null
          ? Number(signal.contentId)
          : null;
      const contentItemKey =
        explicitContentItemKey ??
        (signal.itemKey?.startsWith("content:") ? signal.itemKey : null) ??
        (referencedContentId != null ? buildIAItemKey("content", referencedContentId) : null);

      if (
        contentItemKey &&
        hasItemFeaturePatch(topicoId, contentItemKey, "battle_mode")
      ) {
        const itemScope: BattleScope = { scope: "item", topicoId, itemKey: contentItemKey };
        const itemResolved = resolveFeature(itemScope, "battle_mode");
        if (itemResolved.enabled && itemResolved.battle) {
          return itemScope;
        }
      }

      const topicScope: BattleScope = { scope: "topic", topicoId };
      const topicResolved = resolveFeature(topicScope, "battle_mode");
      return topicResolved.enabled && topicResolved.battle ? topicScope : null;
    },
    [activeTopicId, hasItemFeaturePatch, resolveFeature]
  );

  const emitSignal = useCallback(
    (inputSignal: IATriggerSignal) => {
      const signal: IATriggerSignal = {
        ...inputSignal,
        topicoId: inputSignal.topicoId ?? activeTopicId ?? null,
        itemKey: deriveItemKey(inputSignal),
        timestamp: inputSignal.timestamp ?? getNow(),
      };

      signalListenersRef.current.forEach((listener: IATriggerSignalListener) => {
        try {
          listener(signal);
        } catch (error) {
          console.warn("[IAContext] Falha ao notificar listener de sinal:", error);
        }
      });

      const itemKey = signal.itemKey ?? null;
      const wrongStreakKey =
        itemKey ??
        (signal.activityId != null ? buildIAItemKey("activity", signal.activityId) : null);
      const previousWrongStreak =
        wrongStreakKey != null ? runtimeStates.wrongStreaks[wrongStreakKey] ?? 0 : 0;

      let nextWrongStreak = previousWrongStreak;
      if (signal.type === "activity_wrong") {
        nextWrongStreak = previousWrongStreak + 1;
      } else if (
        signal.type === "activity_correct" ||
        signal.type === "activity_complete" ||
        signal.type === "content_complete"
      ) {
        nextWrongStreak = 0;
      }

      setRuntimeStates((prev) => ({
        ...prev,
        wrongStreaks:
          wrongStreakKey == null
            ? prev.wrongStreaks
            : {
                ...prev.wrongStreaks,
                [wrongStreakKey]: nextWrongStreak,
              },
        lastSignals: [...prev.lastSignals.slice(-9), signal],
      }));

      const matchedSignalTypes: IATriggerSignal["type"][] =
        signal.type === "activity_wrong" && nextWrongStreak >= 2
          ? [signal.type, "wrong_streak"]
          : [signal.type];

      const resolvedMentor = resolveFeature(
        itemKey
          ? { scope: "item", itemKey, topicoId: signal.topicoId ?? null }
          : signal.topicoId != null
          ? { scope: "topic", topicoId: signal.topicoId }
          : { scope: "session" },
        "mentor_character"
      );

      if (signal.topicoId != null) {
        const battleScope = resolveBattleScopeFromSignal(signal);
        const battleDifficulty = resolveBattleDifficultyFromSignal(signal);
        const battleState = battleScope
          ? ensureBattleState(battleScope, battleDifficulty)
          : null;
        const resolvedBattle = battleScope
          ? resolveFeature(battleScope, "battle_mode")
          : null;

        if (battleScope && resolvedBattle?.enabled && battleState && resolvedBattle.battle) {
          const cycleId = getCycleIdForTopico(battleScope.topicoId);
          const battleKey = buildBattleRuntimeKey(
            userId ?? "anonymous",
            battleScope,
            resolvedBattle.battle.enemy.id,
            cycleId,
            resolvedBattle.battle.persistKey
          );
          let warningTriggered = false;
          const shouldOpenIntro =
            ((battleScope.scope === "item" && signal.type === "content_open") ||
              (battleScope.scope === "topic" && signal.type === "topic_open")) &&
            !battleState.introShown &&
            Boolean(battleState.enemy.introLine);

          if (shouldOpenIntro) {
            enqueueCue({
              message: battleState.enemy.introLine ?? "",
              title: battleState.enemy.name,
              speakerName: battleState.enemy.name,
              avatarUrl:
                battleState.enemy.visual?.avatarUrl ??
                battleState.enemy.avatarUrl,
              topicoId: signal.topicoId,
              itemKey: battleState.itemKey ?? null,
              featureKey: "battle_mode",
            });

            setRuntimeStates((prev) => ({
              ...prev,
              battleStates: {
                ...prev.battleStates,
                [battleKey]: {
                  ...battleState,
                  introShown: true,
                  updatedAt: getNow(),
                },
              },
            }));
          }

          const timing = resolvedBattle.battle.timing;
          if (
            timing?.warningAtSec != null &&
            battleState.encounterEndsAt &&
            !battleState.warningSent
          ) {
            const remainingMs = battleState.encounterEndsAt - getNow();
            if (remainingMs > 0 && remainingMs <= timing.warningAtSec * 1000) {
              warningTriggered = true;
              enqueueCue({
                message:
                  resolvedBattle.copy?.body ??
                  "O encontro está no limite. Mantenha o foco para finalizar este conteúdo.",
                title: "Boss em alerta",
                speakerName:
                  battleState.enemy.name ??
                  resolvedBattle.copy?.speakerName ??
                  guideName,
                avatarUrl:
                  battleState.enemy.visual?.avatarUrl ??
                  battleState.enemy.avatarUrl,
                topicoId: signal.topicoId,
                itemKey: battleState.itemKey ?? null,
                featureKey: "battle_mode",
                actionLabel: "Continuar",
              });

              setRuntimeStates((prev) => ({
                ...prev,
                battleStates: {
                  ...prev.battleStates,
                  [battleKey]: {
                    ...battleState,
                    warningSent: true,
                    updatedAt: getNow(),
                  },
                },
              }));
            }
          }

          const damage = getDefaultBattleDamage(signal, resolvedBattle.battle);
          if (damage > 0) {
            const { nextState, defeatedNow } = applyDamageToBattleState(battleState, damage);
            setRuntimeStates((prev) => ({
              ...prev,
              battleStates: {
                ...prev.battleStates,
                [battleKey]: {
                  ...nextState,
                  warningSent: battleState.warningSent || warningTriggered,
                },
              },
            }));

            if (defeatedNow) {
              enqueueCue({
                message:
                  nextState.enemy.defeatLine ??
                  resolvedBattle.battle.victoryMessage ??
                  "O inimigo foi derrotado.",
                title: `${nextState.enemy.name} derrotado`,
                speakerName: nextState.enemy.name,
                avatarUrl:
                  nextState.enemy.visual?.avatarUrl ??
                  nextState.enemy.avatarUrl,
                topicoId: signal.topicoId,
                itemKey: nextState.itemKey ?? null,
                featureKey: "battle_mode",
              });
            }
          }
        }
      }

      const topicPatch = signal.topicoId != null ? topicPatches[signal.topicoId]?.patch : null;
      const triggerRules: IATriggerRule[] = [
        ...(topicPatch?.triggers ?? []),
      ];

      const processRule = (rule: IATriggerRule) => {
        const signals = Array.isArray(rule.signal) ? rule.signal : [rule.signal];
        if (!signals.some((ruleSignal) => matchedSignalTypes.includes(ruleSignal))) return;
        if (rule.featureKey && !FEATURE_KEYS.includes(rule.featureKey)) return;
        if (
          rule.itemKey &&
          itemKey &&
          rule.itemKey !== itemKey
        ) {
          return;
        }
        if (
          rule.mentalStates?.length &&
          !rule.mentalStates.includes(effectiveMentalState.kind)
        ) {
          return;
        }
        if (
          rule.minWrongStreak != null &&
          nextWrongStreak < Number(rule.minWrongStreak)
        ) {
          return;
        }

        const ruleKey = `trigger:${rule.id}`;
        const nextAllowedAt = runtimeStates.triggerCooldowns[ruleKey] ?? 0;
        if (nextAllowedAt > getNow()) return;

        if (rule.cue) {
          enqueueCue({
            ...rule.cue,
            topicoId: rule.cue.topicoId ?? signal.topicoId,
            itemKey: rule.cue.itemKey ?? itemKey,
          });
        }

        if (rule.cooldownMs && rule.cooldownMs > 0) {
          setRuntimeStates((prev) => ({
            ...prev,
            triggerCooldowns: {
              ...prev.triggerCooldowns,
              [ruleKey]: getNow() + Number(rule.cooldownMs),
            },
          }));
        }
      };

      triggerRules.forEach(processRule);

      if (
        resolvedMentor.enabled &&
        matchedSignalTypes.includes("wrong_streak") &&
        nextWrongStreak >= 2
      ) {
        enqueueCue({
          message:
            resolvedMentor.copy?.body ??
            "Vamos por partes. Respire, revise o enunciado e tente novamente.",
          title: resolvedMentor.copy?.title ?? "Dica do mentor",
          speakerName:
            resolvedMentor.character?.speakerName ??
            resolvedMentor.copy?.speakerName ??
            guideName,
          avatarUrl: resolvedMentor.character?.avatarUrl ?? null,
          topicoId: signal.topicoId,
          itemKey,
          featureKey: "mentor_character",
          actionLabel: resolvedMentor.copy?.actionLabel ?? "Continuar",
        });
      }

      if (
        resolvedMentor.enabled &&
        signal.type === "timer_timeout" &&
        resolvedMentor.mode === "__disabled__"
      ) {
        enqueueCue({
          message:
            resolvedMentor.copy?.body ??
            "Seu tempo acabou. Se quiser, faça uma pausa curta e retome com calma.",
          title: "Tempo esgotado",
          speakerName:
            resolvedMentor.character?.speakerName ??
            resolvedMentor.copy?.speakerName ??
            guideName,
          avatarUrl: resolvedMentor.character?.avatarUrl ?? null,
          topicoId: signal.topicoId,
          itemKey,
          featureKey: "mentor_character",
          actionLabel: "Entendi",
        });
      }
    },
    [
      activeTopicId,
      effectiveMentalState.kind,
      enqueueCue,
      ensureBattleState,
      getCycleIdForTopico,
      resolveBattleScopeFromSignal,
      resolveFeature,
      runtimeStates.triggerCooldowns,
      runtimeStates.wrongStreaks,
      topicPatches,
      guideName,
      userId,
    ]
  );

  useEffect(() => {
    if (activeTopicId == null) return;
    void ensureBattleState({ scope: "topic", topicoId: activeTopicId });
  }, [activeTopicId, ensureBattleState]);

  const resolvedFeatures = useMemo<IAResolvedFeaturesState>(() => {
    const session = FEATURE_KEYS.reduce((acc, key) => {
      acc[key] = resolveFeature({ scope: "session" }, key);
      return acc;
    }, {} as Record<IAFeatureKey, IAResolvedFeatureState>);

    const topics = activeTopicId != null
      ? {
          [activeTopicId]: FEATURE_KEYS.reduce((acc, key) => {
            acc[key] = resolveFeature({ scope: "topic", topicoId: activeTopicId }, key);
            return acc;
          }, {} as Record<IAFeatureKey, IAResolvedFeatureState>),
        }
      : {};

    const items: Record<string, Record<IAFeatureKey, IAResolvedFeatureState>> = {};
    if (activeTopicId != null) {
      const itemKeys = Object.keys(topicPatches[activeTopicId]?.patch?.items ?? {});
      itemKeys.forEach((itemKey) => {
        items[itemKey] = FEATURE_KEYS.reduce((acc, key) => {
          acc[key] = resolveFeature(
            { scope: "item", topicoId: activeTopicId, itemKey },
            key
          );
          return acc;
        }, {} as Record<IAFeatureKey, IAResolvedFeatureState>);
      });
    }

    return {
      session,
      topics,
      items,
    };
  }, [activeTopicId, resolveFeature, topicPatches]);

  const value = useMemo<IAContextValue>(
    () => ({
      mentalState: effectiveMentalState,
      featureRegistry,
      resolvedFeatures,
      runtimeStates,
      userPreferences,
      pendingCharacterCues,
      registerTopicPayload,
      setActiveTopic,
      hasFeaturePatch,
      resolveFeature,
      emitSignal,
      subscribeToSignals,
      setUserFeaturePreference,
      dismissCharacterCue,
      pushMentorCue,
      getBattleState,
      resetBattleState,
    }),
    [
      dismissCharacterCue,
      effectiveMentalState,
      emitSignal,
      featureRegistry,
      getBattleState,
      hasFeaturePatch,
      pendingCharacterCues,
      pushMentorCue,
      registerTopicPayload,
      resetBattleState,
      resolveFeature,
      resolvedFeatures,
      runtimeStates,
      setActiveTopic,
      setUserFeaturePreference,
      subscribeToSignals,
      userPreferences,
    ]
  );

  return <IAContext.Provider value={value}>{children}</IAContext.Provider>;
}

export function useIA() {
  const context = useContext(IAContext);
  if (!context) {
    throw new Error("useIA deve ser usado dentro de um IAProvider");
  }
  return context;
}
