import { ActivityCompletePayload, ActivityRenderer } from "@/components/ActivityRenderer";
import CardSemDados from "@/components/CardSemDados";
import { ContentRenderer } from "@/components/ContentRenderer";
import { IABattleHeaderChip } from "@/components/ia/IABattleHeaderChip";
import { IAHeaderTimer } from "@/components/ia/IAHeaderTimer";
import { IAMentorPanel } from "@/components/ia/IAMentorPanel";
import { TopicoIntroSummary } from "@/components/TopicoIntroSummary";
import { useDialog } from "@/context/DialogContext";
import { useIA } from "@/context/IAContext";
import { useUsuario } from "@/context/SessaoContext";
import {
  buildIAItemKey,
  IATimerTimeoutAction,
  resolveIAItemKey,
} from "@/interfaces/personalizacao/IAContracts";
import { PersonalizedTopicPayload } from "@/interfaces/personalizacao/IPersonalizedTopic";
import { ContentBlock } from "@/interfaces/componentes_simples/IContentBlock";
import { UpdateStudyContextParams } from "@/interfaces/telemetria/TelemetryContracts";
import { Color, FontFamily } from "@/styles/GlobalStyle";
import { buildContentBlocks } from "@/utils/contentBlocks";
import { getProfileShellPalette } from "@/utils/profileShellTheme";
import {
  clearTrilhaCheckpoint,
  loadTrilhaCheckpoint,
  saveTrilhaCheckpoint,
} from "@/utils/trilhaCheckpoint";
import { buildPrimaryMaterialContext, parseContentIdFromItemKey } from "@/utils/telemetryMetrics";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  GestureResponderEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView, useSafeAreaInsets } from "react-native-safe-area-context";

type Props = {
  topico: any;
  payload: PersonalizedTopicPayload;
  loading?: boolean;
  WebView?: React.ComponentType<any> | null;
  topicoConcluido?: boolean;
  onFinish: (context?: {
    completedAcademicContentId?: number | null;
    completedAcademicActivityId?: number | null;
    academicContentIds?: number[];
    academicActivityIds?: number[];
  }) => Promise<void>;
  onPersonalizedActivityComplete?: (
    activity: PersonalizedTopicPayload["primaryActivities"][number],
    result?: ActivityCompletePayload
  ) => Promise<void> | void;
  onAcademicActivityComplete?: (
    activity: any,
    linkedConteudoId: number | null,
    result?: ActivityCompletePayload
  ) => Promise<void> | void;
  onAcademicContentComplete?: (
    conteudoId: number,
    itemKey?: string | null
  ) => Promise<void> | void;
  isAcademicContentCompleted?: (conteudoId: number) => boolean;
  isAcademicActivityCompleted?: (atividadeId: number) => boolean;
  onTelemetryTouch?: (event: GestureResponderEvent) => void;
  onTelemetryScroll?: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
  onStudyContextChange?: (params: UpdateStudyContextParams) => void;
  onPersistContentTime?: (conteudoId: number, tempoGastoMin: number) => Promise<void>;
  onPersistActivityTime?: (atividadeId: number, tempoGastoMin: number) => Promise<void>;
  onSavePersonalizedStepProgress?: (params: {
    itemKey: string;
    itemKind: "content" | "activity" | "cards";
    itemTitle: string;
    status: "nao_iniciado" | "em_andamento" | "concluido";
    percentualConcluido: number;
    acertosPercentual?: number | null;
    tempoGastoMin?: number | null;
    pontuacaoObtida?: number | null;
    pontuacaoMaxima?: number | null;
    metadata?: Record<string, unknown> | null;
  }) => Promise<void>;
};

type TeacherActivityLink = {
  atividade: any;
  vinculadoConteudoId: number | null;
  anchorIndex: number;
  ordem: number;
};

type UnifiedTopicStep =
  | {
      id: string;
      source: "personalizado";
      academic: false;
      kind: "content";
      title: string;
      blocks: ContentBlock[];
      itemKey: string | null;
      conteudoId: number | null;
      canonicalConteudoId: number | null;
      materialKey: string | null;
      materialType: string | null;
    }
  | {
      id: string;
      source: "personalizado";
      academic: false;
      kind: "activity";
      title: string;
      activity: PersonalizedTopicPayload["primaryActivities"][number];
      atividadeId: number;
      linkedConteudoId: number | null;
    }
  | {
      id: string;
      source: "professor";
      academic: true;
      kind: "content";
      title: string;
      conteudo: any;
      conteudoId: number;
      blocks: ContentBlock[];
      itemKey: string | null;
      materialKey: string | null;
      materialType: string | null;
    }
  | {
      id: string;
      source: "professor";
      academic: true;
      kind: "activity";
      title: string;
      activity: any;
      atividadeId: number;
      linkedConteudoId: number | null;
    };

function heroLabel(value: string | null | undefined) {
  const hero = String(value ?? "").toLowerCase();
  if (hero === "pdf") return "Decisão de personalização";
  if (hero === "documento") return "Decisão de personalização";
  if (hero === "apresentacao") return "Decisão de personalização";
  if (hero === "imagem") return "Decisão de personalização";
  if (hero === "audio") return "Decisão de personalização";
  if (hero === "video") return "Decisão de personalização";
  if (hero === "cards") return "Decisão de personalização";
  if (hero === "quiz") return "Decisão de personalização";
  return "Decisão de personalização";
}

function heroIcon(value: string | null | undefined) {
  const hero = String(value ?? "").toLowerCase();
  if (hero === "pdf") return "book-open-page-variant";
  if (hero === "documento") return "file-document-outline";
  if (hero === "apresentacao") return "presentation";
  if (hero === "imagem") return "image-outline";
  if (hero === "audio") return "headphones";
  if (hero === "video") return "play-circle";
  if (hero === "cards") return "cards-outline";
  if (hero === "quiz") return "help-circle";
  return "auto-fix";
}

function groupTeacherActivities(atividades: any[] = [], conteudos: any[] = []) {
  const orderMap = new Map<number, number>();
  conteudos.forEach((conteudo, index) => orderMap.set(Number(conteudo?.id), index));

  const linkedList: TeacherActivityLink[] = atividades.map((atividade, index) => {
    const rawIds =
      Array.isArray(atividade?.conteudo_ids) && atividade.conteudo_ids.length > 0
        ? atividade.conteudo_ids
        : atividade?.conteudo_id != null
        ? [atividade.conteudo_id]
        : [];

    const anchorId =
      rawIds
        .map((conteudoId: any) => Number(conteudoId))
        .filter((conteudoId: number) => orderMap.has(conteudoId))
        .sort((a: number, b: number) => (orderMap.get(a) ?? 0) - (orderMap.get(b) ?? 0))[0] ??
      null;

    return {
      atividade,
      vinculadoConteudoId: anchorId,
      anchorIndex: anchorId != null ? orderMap.get(anchorId) ?? Number.MAX_SAFE_INTEGER : Number.MAX_SAFE_INTEGER,
      ordem: index,
    };
  });

  const byConteudo = new Map<number, TeacherActivityLink[]>();
  const unanchored: TeacherActivityLink[] = [];

  linkedList.forEach((item) => {
    if (item.vinculadoConteudoId == null) {
      unanchored.push(item);
      return;
    }

    const current = byConteudo.get(item.vinculadoConteudoId) ?? [];
    current.push(item);
    byConteudo.set(item.vinculadoConteudoId, current);
  });

  return { byConteudo, linkedList, unanchored };
}

function buildTeacherAcademicSteps(topico: any, presentationMode?: string | null): UnifiedTopicStep[] {
  const conteudos = Array.isArray(topico?.conteudos) ? topico.conteudos : [];
  const atividades = Array.isArray(topico?.atividades) ? topico.atividades : [];
  const mode = String(presentationMode ?? "conteudo_primeiro").toLowerCase();
  const { byConteudo, linkedList, unanchored } = groupTeacherActivities(atividades, conteudos);
  const steps: UnifiedTopicStep[] = [];

  const pushActivities = (items: TeacherActivityLink[]) => {
    items.forEach((item, index) => {
      const atividadeId = Number(item.atividade?.id);
      steps.push({
        id: `teacher-activity-${atividadeId}-${index}`,
        source: "professor",
        academic: true,
        kind: "activity",
        title: item.atividade?.titulo ?? `Atividade ${index + 1}`,
        activity: item.atividade,
        atividadeId,
        linkedConteudoId: item.vinculadoConteudoId,
      });
    });
  };

  conteudos.forEach((conteudo: any, index: number) => {
    const conteudoId = Number(conteudo?.id);
    const blocks = buildContentBlocks(conteudo);
    const explicitItemKey =
      blocks
        .map((block) =>
          typeof block.payload === "object" && block.payload
            ? resolveIAItemKey(block.payload.metadata ?? null)
            : null
        )
        .find(Boolean) ?? null;
    const itemKey = explicitItemKey ?? buildIAItemKey("content", conteudoId);
    const materialContext = buildPrimaryMaterialContext({
      blocks,
      conteudoId,
      itemKey,
    });
    const linkedActivities = byConteudo.get(conteudoId) ?? [];
    const contentStep: UnifiedTopicStep = {
      id: `teacher-content-${conteudoId}`,
      source: "professor",
      academic: true,
      kind: "content",
      title: conteudo?.titulo ?? topico?.nome ?? `Conteudo ${index + 1}`,
      conteudo,
      conteudoId,
      blocks,
      itemKey,
      materialKey: materialContext.materialKey,
      materialType: materialContext.materialType,
    };

    switch (mode) {
      case "atividade_primeiro":
        pushActivities(linkedActivities);
        steps.push(contentStep);
        break;
      case "misto": {
        if (linkedActivities.length === 0) {
          steps.push(contentStep);
          break;
        }

        const [first, ...rest] = linkedActivities;
        if (index % 2 === 0) {
          steps.push(contentStep);
          pushActivities([first, ...rest]);
        } else {
          pushActivities([first]);
          steps.push(contentStep);
          pushActivities(rest);
        }
        break;
      }
      case "atividade_fim":
      case "conteudo_primeiro":
      default:
        steps.push(contentStep);
        if (mode === "conteudo_primeiro") {
          pushActivities(linkedActivities);
        }
        break;
    }
  });

  if (mode === "atividade_fim") {
    pushActivities(
      [...linkedList].sort((a, b) => {
        if (a.anchorIndex !== b.anchorIndex) {
          return a.anchorIndex - b.anchorIndex;
        }
        return a.ordem - b.ordem;
      })
    );
  } else if (unanchored.length) {
    pushActivities(unanchored);
  }

  return steps;
}

function buildPersonalizedContentSteps(
  payload: PersonalizedTopicPayload
): Extract<UnifiedTopicStep, { source: "personalizado"; kind: "content" }>[] {
  return payload.primaryBlocks.map((block, index) => {
    const itemKey =
      typeof block.payload === "object" && block.payload
        ? resolveIAItemKey(block.payload.metadata ?? null)
        : null;
    const metadata =
      typeof block.payload === "object" && block.payload && block.payload.metadata && typeof block.payload.metadata === "object"
        ? (block.payload.metadata as Record<string, unknown>)
        : null;
    const conteudoIdRaw = Number(
      metadata?.contentId ??
        metadata?.contentIdRef ??
        parseContentIdFromItemKey(itemKey ?? null) ??
        Number.NaN
    );
    const canonicalConteudoId = Number.isFinite(conteudoIdRaw) ? Number(conteudoIdRaw) : null;
    const materialContext = buildPrimaryMaterialContext({
      blocks: [block],
      conteudoId: canonicalConteudoId,
      itemKey,
    });

    return {
      id: `personalized-content-${block.id}-${index}`,
      source: "personalizado",
      academic: false,
      kind: "content",
      title:
        (typeof block.payload === "object" && block.payload?.title) || `Etapa personalizada ${index + 1}`,
      blocks: [block],
      itemKey,
      conteudoId: canonicalConteudoId,
      canonicalConteudoId,
      materialKey: materialContext.materialKey,
      materialType: materialContext.materialType,
    };
  });
}

function buildPersonalizedActivitySteps(
  payload: PersonalizedTopicPayload
): Extract<UnifiedTopicStep, { source: "personalizado"; kind: "activity" }>[] {
  void payload;
  // Regra de produto: as questoes devem vir da atividade do professor.
  return [];
}

function buildOfficialPersonalizedSteps(payload: PersonalizedTopicPayload): UnifiedTopicStep[] {
  if (!Array.isArray(payload.steps) || payload.steps.length === 0) {
    return [];
  }

  return [...payload.steps]
    .sort((left, right) => Number(left.ordem ?? 0) - Number(right.ordem ?? 0))
    .map((step, index): UnifiedTopicStep | null => {
      const metadata =
        step.metadata && typeof step.metadata === "object"
          ? (step.metadata as Record<string, unknown>)
          : null;
      const itemKey =
        String(step.item_key ?? "").trim() ||
        `personalized:${payload.topicoId}:${step.kind}:${index + 1}`;

      if (step.kind === "activity" && step.activity) {
        return null;
      }

      const blocks = Array.isArray(step.blocks) ? step.blocks : [];
      const conteudoIdRaw = Number(
        metadata?.contentId ??
          metadata?.contentIdRef ??
          parseContentIdFromItemKey(itemKey) ??
          Number.NaN
      );
      const canonicalConteudoId = Number.isFinite(conteudoIdRaw) ? Number(conteudoIdRaw) : null;
      const materialContext = buildPrimaryMaterialContext({
        blocks,
        conteudoId: canonicalConteudoId,
        itemKey,
      });

      return {
        id: `personalized-step-content-${itemKey}`,
        source: "personalizado",
        academic: false,
        kind: "content",
        title: step.title ?? `Etapa personalizada ${index + 1}`,
        blocks,
        itemKey,
        conteudoId: canonicalConteudoId,
        canonicalConteudoId,
        materialKey: materialContext.materialKey,
        materialType: materialContext.materialType,
      };
    })
    .filter((step): step is UnifiedTopicStep => Boolean(step));
}

function buildUnifiedSteps(topico: any, payload: PersonalizedTopicPayload): UnifiedTopicStep[] {
  const officialSteps = buildOfficialPersonalizedSteps(payload);
  if (officialSteps.length > 0) {
    const teacherSteps = buildTeacherAcademicSteps(topico, payload.planMeta.presentationMode);
    const officialContentSteps = officialSteps.filter(
      (step) => step.source === "personalizado" && step.kind === "content"
    );
    return [...officialContentSteps, ...teacherSteps];
  }

  const teacherSteps = buildTeacherAcademicSteps(topico, payload.planMeta.presentationMode);
  const personalizedContentSteps = buildPersonalizedContentSteps(payload);
  const personalizedActivitySteps = buildPersonalizedActivitySteps(payload);

  if (personalizedContentSteps.length > 0 || personalizedActivitySteps.length > 0) {
    const byAnchor = new Map<number, Extract<UnifiedTopicStep, { source: "personalizado"; kind: "activity" }>[]>();
    const unanchoredActivities: Extract<
      UnifiedTopicStep,
      { source: "personalizado"; kind: "activity" }
    >[] = [];

    personalizedActivitySteps.forEach((step) => {
      if (step.linkedConteudoId == null) {
        unanchoredActivities.push(step);
        return;
      }

      const current = byAnchor.get(step.linkedConteudoId) ?? [];
      current.push(step);
      byAnchor.set(step.linkedConteudoId, current);
    });

    const orderedSteps: UnifiedTopicStep[] = [];

    personalizedContentSteps.forEach((step) => {
      orderedSteps.push(step);

      const anchorId = step.canonicalConteudoId ?? step.conteudoId;
      if (anchorId == null) return;

      (byAnchor.get(anchorId) ?? []).forEach((activityStep) => {
        orderedSteps.push(activityStep);
      });
    });

    if (!personalizedContentSteps.length) {
      orderedSteps.push(...personalizedActivitySteps);
      return orderedSteps;
    }

    orderedSteps.push(
      ...unanchoredActivities,
      ...personalizedActivitySteps.filter(
        (step) =>
          step.linkedConteudoId != null && !orderedSteps.some((item) => item.id === step.id)
      )
    );

    return orderedSteps;
  }

  const contentByAnchor = new Map<number, UnifiedTopicStep[]>();
  const activityByAnchor = new Map<number, UnifiedTopicStep[]>();
  const unanchored: UnifiedTopicStep[] = [];

  personalizedContentSteps.forEach((step) => {
    if (step.canonicalConteudoId == null) {
      unanchored.push(step);
      return;
    }
    const current = contentByAnchor.get(step.canonicalConteudoId) ?? [];
    current.push(step);
    contentByAnchor.set(step.canonicalConteudoId, current);
  });

  personalizedActivitySteps.forEach((step) => {
    if (step.linkedConteudoId == null) {
      unanchored.push(step);
      return;
    }
    const current = activityByAnchor.get(step.linkedConteudoId) ?? [];
    current.push(step);
    activityByAnchor.set(step.linkedConteudoId, current);
  });

  const inserted = new Set<string>();
  const unified: UnifiedTopicStep[] = [];
  let unanchoredInserted = false;

  const pushAnchoredSupport = (anchorId: number | null) => {
    if (anchorId == null) return;

    [...(contentByAnchor.get(anchorId) ?? []), ...(activityByAnchor.get(anchorId) ?? [])].forEach(
      (linkedStep) => {
        if (inserted.has(linkedStep.id)) return;
        inserted.add(linkedStep.id);
        unified.push(linkedStep);
      }
    );
  };

  teacherSteps.forEach((step, index) => {
    const nextTeacherStep = teacherSteps[index + 1];
    unified.push(step);

    const anchorId =
      step.kind === "content" ? step.conteudoId : step.linkedConteudoId ?? null;

    const hasImmediateAcademicFollowUp =
      step.kind === "content"
        ? nextTeacherStep?.source === "professor" &&
          nextTeacherStep.kind === "activity" &&
          nextTeacherStep.linkedConteudoId === step.conteudoId
        : step.linkedConteudoId != null &&
          nextTeacherStep?.source === "professor" &&
          nextTeacherStep.kind === "activity" &&
          nextTeacherStep.linkedConteudoId === step.linkedConteudoId;

    if (hasImmediateAcademicFollowUp) {
      return;
    }

    if (!unanchoredInserted && unanchored.length > 0) {
      unanchoredInserted = true;
      unanchored.forEach((supportStep) => {
        if (inserted.has(supportStep.id)) return;
        inserted.add(supportStep.id);
        unified.push(supportStep);
      });
    }

    pushAnchoredSupport(anchorId);
  });

  if (!unanchoredInserted && unanchored.length > 0) {
    unanchored.forEach((supportStep) => {
      if (inserted.has(supportStep.id)) return;
      inserted.add(supportStep.id);
      unified.push(supportStep);
    });
  }

  [...personalizedContentSteps, ...personalizedActivitySteps].forEach((step) => {
    if (inserted.has(step.id)) return;
    unified.push(step);
  });

  return unified;
}

function isTeacherContentConcluded(
  step: Extract<UnifiedTopicStep, { source: "professor"; kind: "content" }>
) {
  const status = String(step.conteudo?.status ?? "").toLowerCase();
  const percentual = Number(step.conteudo?.percentual_concluido ?? 0);
  return status.includes("concl") || percentual >= 100;
}

function isTeacherActivityConcluded(
  step: Extract<UnifiedTopicStep, { source: "professor"; kind: "activity" }>
) {
  const status = String(step.activity?.status ?? "").toLowerCase();
  const percentual = Number(step.activity?.percentual_concluido ?? 0);
  const tentativaAtividade =
    step.activity?.resposta_aluno != null || Number(step.activity?.ultima_tentativa ?? 0) > 0;
  const questoes = Array.isArray(step.activity?.questoes) ? step.activity.questoes : [];
  const tentativaQuestao = questoes.some(
    (questao: any) =>
      questao?.resposta_aluno != null || Number(questao?.ultima_tentativa ?? 0) > 0
  );
  return (
    status.includes("concl") ||
    percentual >= 100 ||
    tentativaAtividade ||
    tentativaQuestao
  );
}

function findFirstPendingAcademicStepIndex(steps: UnifiedTopicStep[]) {
  const pendingIndex = steps.findIndex((step) => {
    if (!step.academic) return false;
    if (step.kind === "content") return !isTeacherContentConcluded(step);
    return !isTeacherActivityConcluded(step);
  });

  return pendingIndex >= 0 ? pendingIndex : 0;
}

function findFirstPersonalizedStepIndex(steps: UnifiedTopicStep[]) {
  const personalizedIndex = steps.findIndex((step) => step.source === "personalizado");
  return personalizedIndex >= 0 ? personalizedIndex : 0;
}

function stepSourceLabel(step: UnifiedTopicStep) {
  return step.source === "professor" ? "Conteúdo da turma" : "Módulo personalizado";
}

function buildPersonalizationDecisionText(
  payload: PersonalizedTopicPayload,
  supportSteps: number
) {
  const justification = String(payload.planMeta.justification ?? "").trim();
  const summary = String(payload.nodeHint?.summary ?? "").trim();
  if (justification && summary && summary !== justification) {
    return `${justification} ${summary}`;
  }
  if (justification) {
    return justification;
  }
  if (summary) {
    return summary;
  }

  const formatos = (payload.planMeta.formatosGerados ?? [])
    .map((item) => String(item ?? "").trim())
    .filter(Boolean)
    .slice(0, 3);

  if (supportSteps <= 0) {
    return "Este módulo foi reorganizado para combinar melhor com seu ritmo, seu perfil de aprendizagem e os sinais mais recentes do seu percurso.";
  }

  if (formatos.length > 0) {
    return `Personalizamos este módulo em ${formatos.join(", ")} para apresentar o conteúdo no formato mais aderente ao seu momento de estudo nesta etapa.`;
  }

  return `Personalizamos a ordem e o formato deste módulo para que a apresentação fique mais aderente ao seu perfil e ao seu momento de estudo.`;
}

function resolvePersonalizedStepItemKind(
  step: Extract<UnifiedTopicStep, { source: "personalizado" }>
): "content" | "activity" | "cards" {
  if (step.kind === "activity") return "activity";
  return step.blocks.some((block) => block.tipo === "cards") ? "cards" : "content";
}

export default function PersonalizedTopicView({
  topico,
  payload,
  loading = false,
  WebView,
  topicoConcluido = false,
  onFinish,
  onPersonalizedActivityComplete,
  onAcademicActivityComplete,
  onAcademicContentComplete,
  isAcademicContentCompleted,
  isAcademicActivityCompleted,
  onTelemetryTouch,
  onTelemetryScroll,
  onStudyContextChange,
  onPersistContentTime,
  onPersistActivityTime,
  onSavePersonalizedStepProgress,
}: Props) {
  const insets = useSafeAreaInsets();
  const { emitSignal } = useIA();
  const { usuario } = useUsuario();
  const { showDialog } = useDialog();
  const profilePalette = useMemo(
    () => getProfileShellPalette(usuario?.perfis?.[0]?.nome ?? null),
    [usuario?.perfis]
  );
  const [started, setStarted] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [activityQuestionIndices, setActivityQuestionIndices] = useState<Record<number, number>>({});
  const [activityTimeoutMap, setActivityTimeoutMap] = useState<Record<number, boolean>>({});
  const [personalizedActivityResults, setPersonalizedActivityResults] = useState<
    Record<number, ActivityCompletePayload>
  >({});
  const [optimisticAcademicContentMap, setOptimisticAcademicContentMap] = useState<Record<number, true>>({});
  const [optimisticAcademicActivityMap, setOptimisticAcademicActivityMap] = useState<Record<number, true>>({});
  const openedStepRef = useRef<string | null>(null);
  const completedPersonalizedContentRef = useRef<Set<string>>(new Set());
  const checkpointHydratedRef = useRef(false);
  const hydratedScopeKeyRef = useRef<string | null>(null);
  const academicContentCompletedRef = useRef(isAcademicContentCompleted);
  const academicActivityCompletedRef = useRef(isAcademicActivityCompleted);
  const personalizedActivityResultsRef = useRef<Record<number, ActivityCompletePayload>>({});
  const activeStepTimingRef = useRef<{
    key: string;
    kind: "content" | "activity";
    resourceId: number | null;
    startedAtMs: number;
  } | null>(null);
  const moduleSessionStartedAtRef = useRef<number | null>(null);

  useEffect(() => {
    moduleSessionStartedAtRef.current = null;
  }, [payload.topicoId]);

  const uiConfig = payload.planMeta.uiConfig;
  const compact = uiConfig.complexidade_visual === "minima";
  const academicSteps = useMemo(
    () =>
      payload.steps.length > 0
        ? []
        : buildTeacherAcademicSteps(topico, payload.planMeta.presentationMode).filter((step) => step.academic),
    [payload.planMeta.presentationMode, payload.steps.length, topico]
  );
  const unifiedSteps = useMemo(() => buildUnifiedSteps(topico, payload), [payload, topico]);
  const supportStepCount =
    payload.steps.length > 0
      ? payload.steps.length
      : payload.primaryBlocks.length + payload.primaryActivities.length;
  const personalizationDecisionText = useMemo(
    () => buildPersonalizationDecisionText(payload, supportStepCount),
    [payload, supportStepCount]
  );
  const currentStep = started ? unifiedSteps[stepIndex] ?? null : null;
  const totalSteps = unifiedSteps.length;
  const isAcademicContentDone = React.useCallback(
    (
      conteudoId: number,
      step?: Extract<UnifiedTopicStep, { source: "professor"; kind: "content" }>
    ) => {
      if (optimisticAcademicContentMap[conteudoId]) return true;
      const propValue = isAcademicContentCompleted?.(conteudoId);
      if (propValue != null) return propValue;
      return step ? isTeacherContentConcluded(step) : false;
    },
    [isAcademicContentCompleted, optimisticAcademicContentMap]
  );
  const isAcademicActivityDone = React.useCallback(
    (
      atividadeId: number,
      step?: Extract<UnifiedTopicStep, { source: "professor"; kind: "activity" }>
    ) => {
      if (optimisticAcademicActivityMap[atividadeId]) return true;
      const propValue = isAcademicActivityCompleted?.(atividadeId);
      if (propValue != null) return propValue;
      return step ? isTeacherActivityConcluded(step) : false;
    },
    [isAcademicActivityCompleted, optimisticAcademicActivityMap]
  );
  const academicCompleted = useMemo(
    () =>
      academicSteps.reduce((sum, step) => {
        if (step.kind === "content") {
          return sum + (isAcademicContentDone(step.conteudoId, step) ? 1 : 0);
        }
        return sum + (isAcademicActivityDone(step.atividadeId, step) ? 1 : 0);
      }, 0),
    [academicSteps, isAcademicActivityDone, isAcademicContentDone]
  );
  const academicTotal = academicSteps.length;
  const isLastStep = currentStep ? stepIndex >= totalSteps - 1 : false;
  const checkpointParams = useMemo(
    () => ({
      userId: usuario?.id ?? null,
      classeId: topico?.classe_id ?? null,
      topicoId: payload.topicoId ?? topico?.id ?? null,
      scopeId: payload.planMeta.cycleId ?? "default",
    }),
    [payload.planMeta.cycleId, payload.topicoId, topico?.classe_id, topico?.id, usuario?.id]
  );
  const hydrationKey = useMemo(
    () =>
      [
        checkpointParams.userId ?? "anon",
        checkpointParams.classeId ?? "sem-classe",
        checkpointParams.topicoId ?? "sem-topico",
        checkpointParams.scopeId ?? "default",
        unifiedSteps.map((step) => step.id).join("|"),
      ].join("::"),
    [
      checkpointParams.classeId,
      checkpointParams.scopeId,
      checkpointParams.topicoId,
      checkpointParams.userId,
      unifiedSteps,
    ]
  );
  const currentQuestionIndex =
    currentStep?.kind === "activity" ? activityQuestionIndices[currentStep.atividadeId] ?? 0 : 0;
  const currentPersonalizedActivityResult =
    currentStep?.kind === "activity" && currentStep.source === "personalizado"
      ? personalizedActivityResults[currentStep.atividadeId] ?? null
      : null;
  const currentStepEligibleComplete =
    currentStep?.kind === "activity"
      ? currentStep.source === "professor"
        ? isAcademicActivityDone(currentStep.atividadeId, currentStep)
        : currentPersonalizedActivityResult != null &&
          currentPersonalizedActivityResult.completed !== false
      : currentStep?.source === "professor"
      ? isAcademicContentDone(currentStep.conteudoId, currentStep)
      : false;
  const canAdvance =
    !started || !currentStep
      ? false
      : currentStep.kind === "activity"
      ? currentStepEligibleComplete
      : true;
  const isCurrentStepActive =
    started &&
    Boolean(currentStep) &&
    !topicoConcluido &&
    !(
      currentStep?.kind === "activity" &&
      currentStepEligibleComplete
    ) &&
    !(
      currentStep?.kind === "content" &&
      currentStep.source === "professor" &&
      currentStepEligibleComplete
    );
  const isCurrentStepTrackable = started && Boolean(currentStep) && !topicoConcluido;
  const currentItemKey =
    !isCurrentStepActive || !currentStep
      ? null
      : currentStep.kind === "content"
      ? currentStep.itemKey
      : currentStep.source === "personalizado"
      ? currentStep.activity.personalizationKey ?? buildIAItemKey("activity", currentStep.atividadeId)
      : buildIAItemKey("activity", currentStep.atividadeId);
  const currentTimerFeature =
    !isCurrentStepActive || !currentStep
      ? null
      : currentStep.kind === "activity"
      ? "activity_timer"
      : "reading_timer";
  const currentTimedOutActivityId =
    currentStep?.kind === "activity" &&
    isCurrentStepActive &&
    activityTimeoutMap[currentStep.atividadeId]
      ? currentStep.atividadeId
      : null;
  const usesExclusivePersonalizedFlow = useMemo(
    () =>
      payload.steps.length > 0 ||
      payload.primaryBlocks.length > 0 ||
      payload.primaryActivities.length > 0,
    [payload.primaryActivities.length, payload.primaryBlocks.length, payload.steps.length]
  );
  const completedVisualSteps = useMemo(() => {
    if (topicoConcluido) return totalSteps;
    if (!started) return 0;
    return Math.min(totalSteps, stepIndex);
  }, [started, stepIndex, topicoConcluido, totalSteps]);
  const progressCompleted = usesExclusivePersonalizedFlow
    ? completedVisualSteps
    : academicCompleted;
  const progressTotal = usesExclusivePersonalizedFlow ? totalSteps : academicTotal;
  const progressPct =
    progressTotal > 0 ? (progressCompleted / progressTotal) * 100 : 0;
  const footerBottomPadding = useMemo(
    () => Math.max(insets.bottom, 12),
    [insets.bottom]
  );
  const activeStepSignature = useMemo(() => {
    if (!isCurrentStepTrackable || !currentStep) return null;

    if (currentStep.kind === "content") {
      return {
        key: currentStep.id,
        kind: "content" as const,
        resourceId: currentStep.conteudoId,
      };
    }

    return {
      key: currentStep.id,
      kind: "activity" as const,
      resourceId: currentStep.atividadeId,
    };
  }, [currentStep, isCurrentStepTrackable]);

  useEffect(() => {
    if (!started || !currentStep || topicoConcluido) {
      return;
    }

    if (moduleSessionStartedAtRef.current == null) {
      moduleSessionStartedAtRef.current = Date.now();
    }
  }, [currentStep, started, topicoConcluido]);

  const persistActiveStepTime = useMemo(
    () =>
      async (
        snapshot: {
          key: string;
          kind: "content" | "activity";
          resourceId: number | null;
          startedAtMs: number;
        } | null
      ) => {
        if (!snapshot) return;

        const elapsedMs = Date.now() - snapshot.startedAtMs;
        if (!Number.isFinite(elapsedMs) || elapsedMs < 1_000) return;

        const elapsedMin = Math.max(0.01, Number((elapsedMs / 60_000).toFixed(2)));
        if (!Number.isFinite(elapsedMin) || elapsedMin <= 0) return;

        const personalizedStep = unifiedSteps.find(
          (step): step is Extract<UnifiedTopicStep, { source: "personalizado" }> =>
            step.id === snapshot.key && step.source === "personalizado"
        );

        if (personalizedStep) {
          const result =
            personalizedStep.kind === "activity"
              ? personalizedActivityResultsRef.current[personalizedStep.atividadeId] ?? null
              : null;
          const completed =
            personalizedStep.kind === "activity"
              ? Boolean(result && result.completed !== false)
              : completedPersonalizedContentRef.current.has(personalizedStep.id);

          await onSavePersonalizedStepProgress?.({
            itemKey:
              personalizedStep.kind === "activity"
                ? personalizedStep.activity.personalizationKey ??
                  buildIAItemKey("activity", personalizedStep.atividadeId)
                : personalizedStep.itemKey ?? personalizedStep.id,
            itemKind: resolvePersonalizedStepItemKind(personalizedStep),
            itemTitle: personalizedStep.title,
            status: completed ? "concluido" : "em_andamento",
            percentualConcluido: completed ? 100 : 10,
            acertosPercentual: result?.acertosPercentual ?? null,
            tempoGastoMin: elapsedMin,
            pontuacaoObtida: result?.scoreAwarded ?? null,
            pontuacaoMaxima:
              personalizedStep.kind === "activity"
                ? personalizedStep.activity.pontuacao_maxima ?? null
                : resolvePersonalizedStepItemKind(personalizedStep) === "cards"
                ? 40
                : 20,
            metadata:
              personalizedStep.kind === "content"
                ? {
                    materialType: personalizedStep.materialType ?? null,
                    materialKey: personalizedStep.materialKey ?? null,
                  }
                : {
                    linkedConteudoId: personalizedStep.linkedConteudoId ?? null,
                  },
          });
          return;
        }

        if (snapshot.resourceId == null) return;

        if (snapshot.kind === "content") {
          await onPersistContentTime?.(snapshot.resourceId, elapsedMin);
          return;
        }

        await onPersistActivityTime?.(snapshot.resourceId, elapsedMin);
      },
    [onPersistActivityTime, onPersistContentTime, onSavePersonalizedStepProgress, unifiedSteps]
  );

  useEffect(() => {
    academicContentCompletedRef.current = isAcademicContentCompleted;
    academicActivityCompletedRef.current = isAcademicActivityCompleted;
  }, [isAcademicActivityCompleted, isAcademicContentCompleted]);

  useEffect(() => {
    personalizedActivityResultsRef.current = personalizedActivityResults;
  }, [personalizedActivityResults]);

  useEffect(() => {
    if (hydratedScopeKeyRef.current === hydrationKey) {
      return;
    }
    hydratedScopeKeyRef.current = hydrationKey;

    let active = true;

    async function hydrateCheckpoint() {
      checkpointHydratedRef.current = false;
      openedStepRef.current = null;
      completedPersonalizedContentRef.current.clear();
      setActivityQuestionIndices({});
      setActivityTimeoutMap({});
      setPersonalizedActivityResults({});
      setOptimisticAcademicContentMap({});
      setOptimisticAcademicActivityMap({});

      const checkpoint = await loadTrilhaCheckpoint(checkpointParams);
      if (!active) return;

      if (
        checkpoint &&
        checkpoint.mostrarResumo === false &&
        checkpoint.stepIndex != null &&
        checkpoint.stepIndex >= 0 &&
        checkpoint.stepIndex < unifiedSteps.length
      ) {
        setStarted(true);
        setStepIndex(checkpoint.stepIndex);
        if (
          checkpoint.blockKind === "atividade" &&
          checkpoint.blockId != null &&
          checkpoint.questionIndex != null
        ) {
          setActivityQuestionIndices({
            [Number(checkpoint.blockId)]: Math.max(0, checkpoint.questionIndex),
          });
        }
      } else {
        const touched =
          String(topico?.status ?? "").toLowerCase().includes("andamento") ||
          Number(topico?.percentual_concluido ?? 0) > 0;
        const initialIndex = usesExclusivePersonalizedFlow
          ? findFirstPersonalizedStepIndex(unifiedSteps)
          : unifiedSteps.findIndex((step) => {
              if (!step.academic) return false;
              if (step.kind === "content") {
                const academicDone =
                  optimisticAcademicContentMap[step.conteudoId] ||
                  (academicContentCompletedRef.current?.(step.conteudoId) ??
                    isTeacherContentConcluded(step));
                return !academicDone;
              }
              const academicDone =
                optimisticAcademicActivityMap[step.atividadeId] ||
                (academicActivityCompletedRef.current?.(step.atividadeId) ??
                  isTeacherActivityConcluded(step));
              return !academicDone;
            });
        setStarted(Boolean(touched && !topicoConcluido && unifiedSteps.length > 0));
        setStepIndex(
          initialIndex >= 0
            ? initialIndex
            : usesExclusivePersonalizedFlow
            ? findFirstPersonalizedStepIndex(unifiedSteps)
            : findFirstPendingAcademicStepIndex(unifiedSteps)
        );
      }

      checkpointHydratedRef.current = true;
    }

    void hydrateCheckpoint();

    return () => {
      active = false;
    };
  }, [
    checkpointParams,
    hydrationKey,
    optimisticAcademicActivityMap,
    optimisticAcademicContentMap,
    topico?.percentual_concluido,
    topico?.status,
    topicoConcluido,
    unifiedSteps,
    usesExclusivePersonalizedFlow,
  ]);

  useEffect(() => {
    const previous = activeStepTimingRef.current;

    if (previous && previous.key !== activeStepSignature?.key) {
      void persistActiveStepTime(previous);
      activeStepTimingRef.current = null;
    }

    if (activeStepSignature) {
      activeStepTimingRef.current = {
        ...activeStepSignature,
        startedAtMs:
          previous?.key === activeStepSignature.key ? previous.startedAtMs : Date.now(),
      };
      return;
    }

    activeStepTimingRef.current = null;
  }, [activeStepSignature, persistActiveStepTime]);

  useEffect(() => {
    return () => {
      if (activeStepTimingRef.current) {
        void persistActiveStepTime(activeStepTimingRef.current);
        activeStepTimingRef.current = null;
      }
    };
  }, [persistActiveStepTime]);

  useEffect(() => {
    if (!checkpointHydratedRef.current) return;

    if (topicoConcluido) {
      void clearTrilhaCheckpoint(checkpointParams);
      return;
    }

    if (!started || !currentStep) {
      void saveTrilhaCheckpoint(checkpointParams, {
        mostrarResumo: true,
        blockKind: null,
        blockId: null,
        questionIndex: null,
        stepIndex: null,
      });
      return;
    }

    const blockId =
      currentStep.kind === "content"
        ? currentStep.conteudoId
        : currentStep.atividadeId;

    void saveTrilhaCheckpoint(checkpointParams, {
      mostrarResumo: false,
      blockKind: currentStep.kind === "content" ? "conteudo" : "atividade",
      blockId: blockId ?? null,
      questionIndex: currentStep.kind === "activity" ? currentQuestionIndex : null,
      stepIndex,
    });
  }, [
    checkpointParams,
    currentQuestionIndex,
    currentStep,
    started,
    stepIndex,
    topicoConcluido,
  ]);

  useEffect(() => {
    if (!started || !topico?.id || !currentStep) return;
    if (openedStepRef.current === currentStep.id) return;
    openedStepRef.current = currentStep.id;

    const topicoId = Number(topico.id);

    if (currentStep.kind === "content") {
      onStudyContextChange?.({
        topicoId,
        conteudoId: currentStep.conteudoId,
        itemKey: currentStep.itemKey,
        materialKey: currentStep.materialKey,
        materialType: currentStep.materialType,
        target: "content",
        studyState: "active",
      });

      emitSignal({
        type: "content_open",
        topicoId,
        contentId: currentStep.conteudoId,
        itemKey: currentStep.itemKey ?? undefined,
      });

      if (currentStep.source === "professor" && currentStep.conteudoId != null && !topicoConcluido) {
        setOptimisticAcademicContentMap((prev) =>
          prev[currentStep.conteudoId]
            ? prev
            : { ...prev, [currentStep.conteudoId]: true }
        );
        void onAcademicContentComplete?.(currentStep.conteudoId, currentStep.itemKey);
      }
      return;
    }

    onStudyContextChange?.({
      topicoId,
      atividadeId: currentStep.atividadeId,
      conteudoId: currentStep.linkedConteudoId ?? null,
      itemKey:
        currentStep.source === "personalizado"
          ? currentStep.activity.personalizationKey ??
            buildIAItemKey("activity", currentStep.atividadeId)
          : buildIAItemKey("activity", currentStep.atividadeId),
      materialKey: null,
      materialType: null,
      target: "activity",
      studyState: "active",
    });

    emitSignal({
      type: "activity_start",
      topicoId,
      activityId: currentStep.atividadeId,
      itemKey:
        currentStep.source === "personalizado"
          ? currentStep.activity.personalizationKey ??
            buildIAItemKey("activity", currentStep.atividadeId)
          : buildIAItemKey("activity", currentStep.atividadeId),
      meta:
        currentStep.linkedConteudoId != null
          ? {
              contentId: currentStep.linkedConteudoId,
              contentItemKey: buildIAItemKey("content", currentStep.linkedConteudoId),
            }
          : undefined,
    });
  }, [
    currentStep,
    emitSignal,
    onAcademicContentComplete,
    onStudyContextChange,
    started,
    topico?.id,
    topicoConcluido,
  ]);

  useEffect(() => {
    if (!topico?.id || isCurrentStepTrackable) return;

    onStudyContextChange?.({
      topicoId: Number(topico.id),
      atividadeId: null,
      conteudoId: null,
      itemKey: null,
      materialKey: null,
      materialType: null,
      target: "screen",
      studyState: "idle",
    });
  }, [isCurrentStepTrackable, onStudyContextChange, topico?.id]);

  const handleTimerTimeout = (action: IATimerTimeoutAction | null) => {
    if (currentStep?.kind === "activity") {
      setActivityTimeoutMap((prev) => ({
        ...prev,
        [currentStep.atividadeId]: true,
      }));
    }

    const titulo =
      action === "pause"
        ? "Hora de pausar"
        : action === "suggest_break"
        ? "Pausa sugerida"
        : action === "end_local_attempt"
        ? "Tempo da tentativa"
        : "Tempo esgotado";
    const descricao =
      currentStep?.kind === "activity"
        ? "O tempo desta atividade terminou. Você ainda pode concluir a etapa, mas a pontuação final recebe penalidade de 20%."
        : "O tempo desta etapa terminou. Revise o material e avance quando estiver pronto.";

    showDialog({
      title: titulo,
      description: descricao,
      tone: action === "suggest_break" ? "warning" : "info",
    });
  };

  const handleUnifiedActivityComplete = async (result?: ActivityCompletePayload) => {
    if (!currentStep || currentStep.kind !== "activity") return;

    if (currentStep.source === "personalizado") {
      if (result?.completed !== false) {
        setPersonalizedActivityResults((prev) => ({
          ...prev,
          [currentStep.atividadeId]: result ?? { completed: true },
        }));
      }
      await onSavePersonalizedStepProgress?.({
        itemKey:
          currentStep.activity.personalizationKey ??
          buildIAItemKey("activity", currentStep.atividadeId),
        itemKind: "activity",
        itemTitle: currentStep.title,
        status: result?.completed === false ? "em_andamento" : "concluido",
        percentualConcluido: result?.completed === false ? 0 : 100,
        acertosPercentual: result?.acertosPercentual ?? null,
        pontuacaoObtida: result?.scoreAwarded ?? null,
        pontuacaoMaxima: currentStep.activity.pontuacao_maxima ?? null,
        metadata: {
          linkedConteudoId: currentStep.linkedConteudoId ?? null,
          timedOut: result?.timedOut ?? false,
          scorePenaltyPct: result?.scorePenaltyPct ?? null,
        },
      });
      await onPersonalizedActivityComplete?.(currentStep.activity, result);
      return;
    }

    if (result?.completed !== false) {
      setOptimisticAcademicActivityMap((prev) =>
        prev[currentStep.atividadeId]
          ? prev
          : { ...prev, [currentStep.atividadeId]: true }
      );
    }
    await onAcademicActivityComplete?.(currentStep.activity, currentStep.linkedConteudoId, result);
  };

  const handleAdvance = async () => {
    if (!currentStep) return;

    if (currentStep.kind === "content" && currentStep.source === "personalizado") {
      if (!completedPersonalizedContentRef.current.has(currentStep.id)) {
        completedPersonalizedContentRef.current.add(currentStep.id);
        await onSavePersonalizedStepProgress?.({
          itemKey: currentStep.itemKey ?? currentStep.id,
          itemKind: resolvePersonalizedStepItemKind(currentStep),
          itemTitle: currentStep.title,
          status: "concluido",
          percentualConcluido: 100,
          pontuacaoObtida: resolvePersonalizedStepItemKind(currentStep) === "cards" ? 40 : 20,
          pontuacaoMaxima: resolvePersonalizedStepItemKind(currentStep) === "cards" ? 40 : 20,
          metadata: {
            materialType: currentStep.materialType ?? null,
            materialKey: currentStep.materialKey ?? null,
          },
        });
        emitSignal({
          type: "content_complete",
          topicoId: topico?.id ? Number(topico.id) : null,
          contentId: currentStep.conteudoId,
          itemKey: currentStep.itemKey ?? undefined,
        });
      }
    } else if (!canAdvance) {
      return;
    }

    if (isLastStep) {
      await clearTrilhaCheckpoint(checkpointParams);
      await onFinish({
        completedAcademicContentId:
          currentStep.kind === "content" && currentStep.source === "professor"
            ? currentStep.conteudoId
            : null,
        completedAcademicActivityId:
          currentStep.kind === "activity" && currentStep.source === "professor"
            ? currentStep.atividadeId
            : null,
        academicContentIds: Object.keys(optimisticAcademicContentMap).map(Number),
        academicActivityIds: Object.keys(optimisticAcademicActivityMap).map(Number),
      });
      return;
    }

    setStepIndex((value) => Math.min(value + 1, totalSteps - 1));
  };

  const handleBack = () => {
    if (stepIndex === 0) {
      setStarted(false);
      return;
    }
    setStepIndex((value) => Math.max(0, value - 1));
  };

  const currentSourceLabel = currentStep ? stepSourceLabel(currentStep) : null;

  return (
    <SafeAreaView
      style={[styles.screen, { backgroundColor: profilePalette.background }]}
      edges={[]}
      onTouchStart={onTelemetryTouch}
    >
      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        onScroll={onTelemetryScroll}
        scrollEventThrottle={16}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: 140 }]}
      >
        {!started ? (
          <View
            style={[
              styles.heroCard,
              compact && styles.heroCardCompact,
              {
                backgroundColor: profilePalette.surface,
                borderColor: profilePalette.borderStrong,
              },
            ]}
          >
            <View style={styles.heroRow}>
              <View style={[styles.heroPill, { backgroundColor: profilePalette.accentSoft }]}>
                <MaterialCommunityIcons
                  name={heroIcon(payload.heroFormat) as never}
                  size={16}
                  color={profilePalette.accent}
                />
                <Text style={[styles.heroPillText, { color: profilePalette.accent }]}>
                  {heroLabel(payload.heroFormat)}
                </Text>
              </View>
            </View>

            <Text
              style={[
                styles.heroTitle,
                compact && styles.heroTitleCompact,
                { color: profilePalette.text },
              ]}
            >
              {topico?.nome ?? "Módulo personalizado"}
            </Text>

            <Text style={[styles.heroDescription, { color: profilePalette.textMuted }]}>
              {personalizationDecisionText}
            </Text>

            <Text style={[styles.helperText, { color: profilePalette.textSubtle }]}>
              Este módulo entra direto na sequência personalizada definida para você. Quando essa
              versão estiver ativa, ela substitui a exibição padrão da turma neste percurso.
            </Text>

            <View style={styles.metaRow}>
              <View
                style={[
                  styles.metaChip,
                  {
                    backgroundColor: profilePalette.accentMuted,
                    borderColor: profilePalette.border,
                  },
                ]}
              >
                <Text style={[styles.metaChipText, { color: profilePalette.text }]}>
                  {Math.max(1, totalSteps)} etapas personalizadas
                </Text>
              </View>
              <View
                style={[
                  styles.metaChip,
                  {
                    backgroundColor: profilePalette.accentMuted,
                    borderColor: profilePalette.border,
                  },
                ]}
              >
                <Text style={[styles.metaChipText, { color: profilePalette.text }]}>
                  checkpoint salvo na conta
                </Text>
              </View>
            </View>
          </View>
        ) : null}

        {!started ? (
          <TopicoIntroSummary
            topico={topico}
            totalBlocos={Math.max(totalSteps, academicTotal)}
            modo={payload.planMeta.presentationMode ?? "conteudo_primeiro"}
            theme={{
              accentColor: profilePalette.accent,
              softColor: profilePalette.surface,
              borderColor: profilePalette.border,
              mutedTextColor: profilePalette.textMuted,
            }}
          />
        ) : currentStep ? (
          <>
            <View style={styles.headerSection}>
              <View style={styles.activeHeaderTopRow}>
                <View style={styles.activeHeaderActions}>
                  <IABattleHeaderChip
                    topicoId={topico?.id ? Number(topico.id) : null}
                    itemKey={currentItemKey}
                  />
                </View>
              </View>
              <View style={styles.progressHeaderRow}>
                <Text style={[styles.progressLabel, { color: profilePalette.textMuted }]}>
                  Progresso do módulo
                </Text>
                <Text style={[styles.progressPercent, { color: profilePalette.accent }]}>
                  {Math.round(progressPct)}%
                </Text>
              </View>
              <View style={styles.progressBarContainer}>
                <View
                  style={[
                    styles.progressBarFill,
                    {
                      width: `${Math.min(100, progressPct <= 0 ? 0 : Math.max(6, progressPct))}%`,
                      backgroundColor: profilePalette.accent,
                    },
                  ]}
                />
              </View>
              <Text style={[styles.progressCounter, { color: profilePalette.textSubtle }]}>
                {progressCompleted} de {Math.max(1, progressTotal)} etapas concluídas
              </Text>
              <Text style={[styles.stepCounter, { color: profilePalette.textMuted }]}>
                Passo visual {stepIndex + 1} de {Math.max(1, totalSteps)}
              </Text>
            </View>

            <View
              style={[
                styles.section,
                {
                  backgroundColor: profilePalette.surfaceElevated,
                  borderColor: profilePalette.border,
                },
              ]}
            >
              <View style={styles.cardHeader}>
                <View style={styles.badgeRow}>
                  <View
                    style={[
                      styles.stepTypeBadge,
                      {
                        borderColor:
                          currentStep.source === "professor"
                            ? profilePalette.border
                            : profilePalette.borderStrong,
                        backgroundColor:
                          currentStep.source === "professor"
                            ? profilePalette.surface
                            : profilePalette.accentMuted,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.stepTypeBadgeText,
                        {
                          color:
                            currentStep.source === "professor"
                              ? profilePalette.textMuted
                              : profilePalette.accent,
                        },
                      ]}
                    >
                      {currentSourceLabel}
                    </Text>
                  </View>
                  <View
                    style={[
                      styles.stepTypeBadge,
                      {
                        borderColor: profilePalette.border,
                        backgroundColor: profilePalette.surface,
                      },
                    ]}
                  >
                    <Text style={[styles.stepTypeBadgeText, { color: profilePalette.text }]}>
                      {currentStep.kind === "activity" ? "Atividade" : "Conteudo"}
                    </Text>
                  </View>
                </View>
              </View>

              <Text style={[styles.sectionTitle, { color: profilePalette.text }]}>{currentStep.title}</Text>
              <Text style={[styles.sectionHint, { color: profilePalette.textSubtle }]}>
                {currentStep.kind === "activity"
                  ? currentStep.source === "professor"
                    ? "Resolva esta atividade da turma para avançar no módulo."
                    : "Resolva esta atividade personalizada para seguir no módulo adaptado ao seu perfil."
                  : currentStep.source === "professor"
                  ? "Este é o bloco acadêmico principal da turma."
                  : "Este é o bloco personalizado gerado para este módulo, seguindo a adaptação definida para você."}
              </Text>

              {currentStep.kind === "content" ? (
                <ContentRenderer
                  blocks={currentStep.blocks}
                  WebView={WebView}
                  topicoId={topico?.id ? Number(topico.id) : null}
                  enableItemIA
                />
              ) : (
                <View
                  style={[
                    styles.activityCard,
                    {
                      borderColor: profilePalette.border,
                      backgroundColor: profilePalette.surface,
                    },
                  ]}
                >
                  {currentStep.activity.descricao ? (
                    <Text style={[styles.activityDescription, { color: profilePalette.textMuted }]}>
                      {currentStep.activity.descricao}
                    </Text>
                  ) : null}
                  <ActivityRenderer
                    atividade={currentStep.activity}
                    topicoId={topico?.id}
                    onComplete={handleUnifiedActivityComplete}
                    initialQuestionIndex={currentQuestionIndex}
                    onQuestionIndexChange={(questionIndex) => {
                      setActivityQuestionIndices((prev) =>
                        prev[currentStep.atividadeId] === questionIndex
                          ? prev
                          : { ...prev, [currentStep.atividadeId]: questionIndex }
                      );
                    }}
                    timedOut={currentTimedOutActivityId === currentStep.atividadeId}
                  />
                </View>
              )}
            </View>
          </>
        ) : (
          <CardSemDados
            title="Sem etapas"
            description="Este módulo ainda não possui uma sequência personalizada disponível."
          />
        )}
      </ScrollView>

      <View
        style={[
          styles.footer,
          {
            backgroundColor: profilePalette.background,
            borderTopColor: profilePalette.border,
            paddingTop: 12,
            paddingBottom: footerBottomPadding,
          },
        ]}
      >
        {!started ? (
          <Pressable
            hitSlop={12}
            style={[
              styles.primaryButton,
              {
                backgroundColor: profilePalette.accent,
                borderColor: profilePalette.borderStrong,
              },
              (loading || !unifiedSteps.length) && styles.buttonDisabled,
            ]}
            disabled={loading || !unifiedSteps.length}
            onPress={() => {
              setStarted(true);
              setStepIndex(
                usesExclusivePersonalizedFlow
                  ? findFirstPersonalizedStepIndex(unifiedSteps)
                  : findFirstPendingAcademicStepIndex(unifiedSteps)
              );
            }}
          >
            <Text style={styles.primaryButtonText}>
              {topicoConcluido ? "Revisar módulo" : "Começar módulo"}
            </Text>
          </Pressable>
        ) : (
          <View style={styles.footerRow}>
            <Pressable
              hitSlop={12}
              style={[
                styles.secondaryButton,
                styles.backButton,
                {
                  backgroundColor: profilePalette.surfaceElevated,
                  borderColor: profilePalette.border,
                },
              ]}
              onPress={handleBack}
            >
              <Text style={styles.secondaryButtonText}>Voltar</Text>
            </Pressable>

            <Pressable
              hitSlop={12}
              style={[
                styles.primaryButton,
                {
                  backgroundColor: profilePalette.accent,
                  borderColor: profilePalette.borderStrong,
                },
                (!canAdvance || loading) && styles.buttonDisabled,
              ]}
              disabled={!canAdvance || loading}
              onPress={() => {
                void handleAdvance();
              }}
            >
              <Text style={styles.primaryButtonText}>
                {isLastStep ? "Concluir módulo" : "Continuar"}
              </Text>
            </Pressable>
          </View>
        )}
      </View>

      {started && currentStep ? (
        <View style={[styles.floatingTimerWrap, { top: Math.max(insets.top + 8, 14) }]} pointerEvents="none">
          <IAHeaderTimer
            topicoId={topico?.id ? Number(topico.id) : null}
            itemKey={currentItemKey}
            preferredTimerFeature={currentTimerFeature}
            elapsedStartAtMs={moduleSessionStartedAtRef.current}
            active={Boolean(currentTimerFeature)}
            onTimeoutAction={handleTimerTimeout}
          />
        </View>
      ) : null}

      {started && topico?.id ? (
        <IAMentorPanel
          classeId={Number(topico?.classe_id ?? 0) || null}
          topicoId={Number(topico.id)}
          scope="modulo"
          bottomOffset={Math.max(insets.bottom + 104, 114)}
        />
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Color.background,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  heroCard: {
    marginHorizontal: 16,
    marginTop: 12,
    padding: 18,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: "rgba(164, 141, 255, 0.3)",
    backgroundColor: "#141d39",
    gap: 10,
  },
  heroCardCompact: {
    paddingTop: 14,
    paddingBottom: 14,
    gap: 6,
  },
  heroRow: {
    flexDirection: "row",
    justifyContent: "flex-start",
    alignItems: "flex-start",
    gap: 12,
  },
  heroPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    backgroundColor: "rgba(106,95,253,0.14)",
  },
  heroPillText: {
    color: Color.colorAliceblue,
    fontFamily: FontFamily.interMedium,
    fontSize: 12,
  },
  heroTitle: {
    color: Color.colorAliceblue,
    fontFamily: FontFamily.inikaBold,
    fontSize: 22,
  },
  heroTitleCompact: {
    fontSize: 18,
  },
  heroDescription: {
    color: Color.colorAliceblue300,
    fontFamily: FontFamily.interMedium,
    fontSize: 14,
    lineHeight: 21,
  },
  metaRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  metaChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "#1d2748",
    borderWidth: 1,
    borderColor: Color.colorDarkslategray100,
  },
  metaChipText: {
    color: Color.colorAliceblue,
    fontFamily: FontFamily.interMedium,
    fontSize: 11,
  },
  headerSection: {
    marginHorizontal: 16,
    marginTop: 14,
    paddingHorizontal: 4,
    gap: 6,
  },
  activeHeaderTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
    marginBottom: 4,
  },
  activeHeaderActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexShrink: 0,
    alignSelf: "flex-end",
  },
  floatingTimerWrap: {
    position: "absolute",
    top: 14,
    alignSelf: "center",
    zIndex: 35,
    elevation: 8,
  },
  progressHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  progressLabel: {
    flex: 1,
    minWidth: 0,
    color: Color.colorAliceblue300,
    fontFamily: FontFamily.interMedium,
    fontSize: 12,
  },
  progressPercent: {
    flexShrink: 0,
    color: Color.colorAliceblue,
    fontFamily: FontFamily.interMedium,
    fontSize: 12,
  },
  progressBarContainer: {
    width: "100%",
    maxWidth: "100%",
    alignSelf: "stretch",
    height: 10,
    backgroundColor: Color.colorDarkslategray100,
    borderRadius: 999,
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    backgroundColor: Color.colorAliceblue,
  },
  progressCounter: {
    color: Color.colorSlategray,
    fontFamily: FontFamily.interMedium,
    fontSize: 12,
  },
  stepCounter: {
    color: Color.colorAliceblue300,
    fontFamily: FontFamily.interMedium,
    fontSize: 12,
  },
  section: {
    marginHorizontal: 16,
    marginTop: 14,
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Color.colorDarkslategray100,
    backgroundColor: "#11182f",
    gap: 12,
  },
  sectionHeader: {
    gap: 2,
  },
  sectionTitle: {
    color: Color.colorAliceblue,
    fontFamily: FontFamily.inikaBold,
    fontSize: 18,
  },
  sectionHint: {
    color: Color.colorSlategray,
    fontFamily: FontFamily.interMedium,
    fontSize: 12,
  },
  helperText: {
    color: Color.colorAliceblue300,
    fontFamily: FontFamily.interMedium,
    fontSize: 14,
    lineHeight: 20,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  badgeRow: {
    flexDirection: "row",
    gap: 8,
    flexWrap: "wrap",
  },
  stepTypeBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Color.colorDarkslategray100,
    backgroundColor: "rgba(255,255,255,0.04)",
  },
  badgeTeacher: {
    borderColor: "rgba(96, 165, 250, 0.6)",
    backgroundColor: "rgba(96, 165, 250, 0.12)",
  },
  badgePersonalized: {
    borderColor: "rgba(168, 85, 247, 0.6)",
    backgroundColor: "rgba(168, 85, 247, 0.14)",
  },
  stepTypeBadgeText: {
    color: Color.colorAliceblue,
    fontFamily: FontFamily.interMedium,
    fontSize: 11,
  },
  activityCard: {
    marginTop: 4,
    padding: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "rgba(164, 141, 255, 0.18)",
    backgroundColor: "#16203d",
    gap: 8,
  },
  activityDescription: {
    color: Color.colorAliceblue300,
    fontFamily: FontFamily.interMedium,
    fontSize: 13,
    lineHeight: 19,
  },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: Color.colorDarkslategray100,
    backgroundColor: Color.background,
    position: "relative",
    zIndex: 30,
    elevation: 18,
  },
  footerRow: {
    flexDirection: "row",
    gap: 12,
  },
  primaryButton: {
    flex: 1,
    minHeight: 56,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Color.colorDarkslategray100,
    paddingHorizontal: 18,
    borderWidth: 1,
    zIndex: 2,
  },
  backButton: {
    flex: 0.7,
  },
  primaryButtonText: {
    color: Color.colorWhite,
    fontFamily: FontFamily.inikaBold,
    fontSize: 15,
    textAlign: "center",
  },
  secondaryButton: {
    flex: 1,
    minHeight: 56,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Color.colorDarkslategray200,
    paddingHorizontal: 18,
    borderWidth: 1,
    zIndex: 2,
  },
  secondaryButtonText: {
    color: Color.colorAliceblue,
    fontFamily: FontFamily.inikaBold,
    fontSize: 15,
  },
  buttonDisabled: {
    opacity: 0.45,
  },
});
