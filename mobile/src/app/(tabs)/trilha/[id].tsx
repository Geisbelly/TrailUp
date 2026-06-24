import { useLocalSearchParams, useRouter } from "expo-router";
import { useFocusEffect, useIsFocused } from "@react-navigation/native";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { ActivityCompletePayload, ActivityRenderer } from "@/components/ActivityRenderer";
import CardSemDados from "@/components/CardSemDados";
import { ContentRenderer } from "@/components/ContentRenderer";
import { HallBackground, OrnamentDivider } from "@/components/HallTheme";
import { IABattleHeaderChip } from "@/components/ia/IABattleHeaderChip";
import { IAHeaderTimer } from "@/components/ia/IAHeaderTimer";
import { IAMentorPanel } from "@/components/ia/IAMentorPanel";
import { LoadingState } from "@/components/LoadingState";
import { TopicoIntroSummary } from "@/components/TopicoIntroSummary";
import { PersonalizedTopicPayload } from "@/interfaces/personalizacao/IPersonalizedTopic";


import { useConquistaRank } from "@/context/ConquistaRankContext";
import { useDialog } from "@/context/DialogContext";
import { useIA } from "@/context/IAContext";
import { useLoading } from "@/context/LoadingContext";
import { useMetricas } from "@/context/MetricasContext";
import { useUsuario } from "@/context/SessaoContext";
import { useTrilha } from "@/context/TrilhaContext";

import {
  buildIAItemKey,
  resolveIAItemKey,
} from "@/interfaces/personalizacao/IAContracts";
import { styles } from "./[id].styles";
import { buildContentBlocks } from "@/utils/contentBlocks";
import { inferModoApresentacao } from "@/utils/presentationOrder";
import {
  clearTrilhaCheckpoint,
  saveTrilhaCheckpoint,
} from "@/utils/trilhaCheckpoint";
import { useCheckpointResume } from "@/hooks/trilha/useCheckpointResume";
import { usePersonalizedFlow } from "@/hooks/trilha/usePersonalizedFlow";
import { useStudyTimeTracking } from "@/hooks/trilha/useStudyTimeTracking";
import { useTelemetryHandlers } from "@/hooks/trilha/useTelemetryHandlers";
import { useTopicoCompletion } from "@/hooks/trilha/useTopicoCompletion";
import { usePersonalizationRefresh } from "@/hooks/trilha/usePersonalizationRefresh";
import { getProfileShellPalette } from "@/utils/profileShellTheme";
import {
  buildBlocksForTopico,
  calcularPosicaoInicial,
  isAtividadeConcluida,
  isConteudoConcluido,
  resolveConteudoMaterialContext,
  type Atividade,
  type AtividadeResolvida,
  type Conteudo,
} from "@/utils/trilhaBlocks";

/* --------------------------
   WebView loader (lazy, platform-aware)
   -------------------------- */

function loadWebView() {
  if (Platform.OS === "web") return null;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const RNWebView = require("react-native-webview");
  return RNWebView.default || RNWebView.WebView;
}

const WebView = loadWebView();

function normalizeModuleDifficulty(value: unknown): "facil" | "medio" | "dificil" {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/\s+/g, "_");

  if (["facil", "easy", "iniciante", "beginner"].includes(normalized)) {
    return "facil";
  }
  if (["dificil", "hard", "avancado", "advanced"].includes(normalized)) {
    return "dificil";
  }
  return "medio";
}

/* --------------------------
   TELA PRINCIPAL
   -------------------------- */

export default function TrilhaConteudoScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string | string[] }>();

  const {
    carregando,
    erro,
    classeAtual,
    refreshTopico,
    marcarTopicoIniciado,
    marcarTopicoConcluido,
    marcarConteudoVisto,
    registrarAtividadeConcluida,
    registrarTempoTopico,
    registrarTempoConteudo,
    registrarTempoAtividade,
    salvarProgressoItemPersonalizado,
    getProximosTopicos,
    personalizedTopics,
    ensureTopicoPersonalizado,
  } = useTrilha();

  const { setLoading } = useLoading();
  const { usuario } = useUsuario();
  const { showConfirm, showDialog } = useDialog();
  const { registrarEvento, reloadRanking, reloadConquistas } = useConquistaRank();
  const {
    registerTopicPayload,
    setActiveTopic,
    emitSignal,
    resetBattleState,
  } = useIA();
  const {
    beginStudySession,
    updateStudyContext,
    endStudySession,
    flushStudyBatch,
    recordTouchSample,
    recordScroll,
    recordAppEvent,
    lastAnalysis,
  } = useMetricas();

  const rawId = Array.isArray(params.id) ? params.id[0] : params.id ?? "";

  const topicoId = useMemo(() => {
    const m = String(rawId).match(/(\d+)(?!.*\d)/);
    return m ? Number(m[1]) : null;
  }, [rawId]);

  const topico =
    topicoId == null || !classeAtual
      ? null
      : classeAtual.topicos.find((t: any) => t.id === topicoId) ?? null;
  const moduleDifficulty = useMemo(
    () =>
      normalizeModuleDifficulty(
        (topico as any)?.dificuldade ??
          (topico as any)?.metadata?.dificuldade ??
          (topico as any)?.metadata?.difficulty ??
          "medio"
      ),
    [topico]
  );
  const resolvedClasseId = useMemo(() => {
    const parsed = Number(classeAtual?.classe_id ?? topico?.classe_id ?? 0);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }, [classeAtual?.classe_id, topico?.classe_id]);

  const academicConteudos: Conteudo[] = useMemo(() => topico?.conteudos ?? [], [topico]);
  const academicAtividades: Atividade[] = useMemo(() => topico?.atividades ?? [], [topico]);
  const personalizedTopic: PersonalizedTopicPayload | null =
    topicoId != null ? personalizedTopics[topicoId] ?? null : null;
  const personalizedFlow = usePersonalizedFlow({ personalizedTopic, topicoId });
  const conteudos: Conteudo[] = useMemo(
    () => {
      const base = [...academicConteudos, ...personalizedFlow.conteudos];
      if (!topico || typeof (topico as any)?.ordenarConteudosParaTrilha !== "function") {
        return base;
      }
      return (topico as any).ordenarConteudosParaTrilha(base);
    },
    [academicConteudos, personalizedFlow.conteudos, topico]
  );
  const atividades: Atividade[] = useMemo(
    () => [...academicAtividades, ...personalizedFlow.atividades],
    [academicAtividades, personalizedFlow.atividades]
  );
  const [personalizacaoCarregando, setPersonalizacaoCarregando] = useState(false);
  const concluirTopicoRef = useRef<(() => Promise<void>) | null>(null);
  const lastOpenedSignalRef = useRef<string | null>(null);
  const emitSignalRef = useRef(emitSignal);
  const autoViewedContentRef = useRef<string | null>(null);
  const moduleSessionStartedAtRef = useRef<number | null>(null);

  const modo = useMemo(
    () =>
      inferModoApresentacao({
        alunoNome: usuario?.modoOperacao_nome ?? null,
        alunoDescricao: usuario?.modoOperacao_descricao ?? null,
        ordem: usuario?.modoOperacao_ordem,
        classeResumo: classeAtual?.resumo?.modoOperacao ?? null,
      }),
    [
      usuario?.modoOperacao_nome,
      usuario?.modoOperacao_descricao,
      usuario?.modoOperacao_ordem,
      classeAtual?.resumo?.modoOperacao,
    ]
  );
  const studySessionParams = useMemo(
    () =>
      topicoId != null && resolvedClasseId != null
        ? {
            classeId: resolvedClasseId,
            topicoId,
            topicoInicialId: topicoId,
            screenName: "trilha_topico",
            routeName: "/(tabs)/trilha/[id]",
          }
        : null,
    [resolvedClasseId, topicoId]
  );

  useEffect(() => {
    if (topicoId == null || !classeAtual || resolvedClasseId != null) return;
    console.warn(
      "[TrilhaConteudo] classe_id invalido; sessao de telemetria nao iniciada."
    );
  }, [classeAtual, resolvedClasseId, topicoId]);
  const profilePalette = useMemo(
    () => getProfileShellPalette(usuario?.perfis?.[0]?.nome ?? null),
    [usuario?.perfis]
  );

  useEffect(() => {
    moduleSessionStartedAtRef.current = null;
  }, [topicoId]);

  useEffect(() => {
    if (!topicoId || !topico || personalizedTopic) return;

    let ativo = true;
    setPersonalizacaoCarregando(true);

    ensureTopicoPersonalizado(topicoId)
      .catch((err) => {
        console.warn("[TrilhaConteudo] Falha ao carregar personalização:", err);
      })
      .finally(() => {
        if (ativo) setPersonalizacaoCarregando(false);
      });

    return () => {
      ativo = false;
    };
  }, [ensureTopicoPersonalizado, personalizedTopic, topico, topicoId]);

  usePersonalizationRefresh({
    topicoId,
    topico,
    personalizedTopic,
    lastAnalysis,
    ensureTopicoPersonalizado,
    setPersonalizacaoCarregando,
  });

  const blocks = useMemo(() => {
    return buildBlocksForTopico(conteudos, atividades, modo);
  }, [atividades, conteudos, modo]);

  const [conteudosVistosLocal, setConteudosVistosLocal] = useState<Set<number>>(new Set());
  const [atividadesResolvidasLocal, setAtividadesResolvidasLocal] = useState<
    Map<number, AtividadeResolvida>
  >(new Map());
  const [resultadosAtividades, setResultadosAtividades] = useState<
    Record<number, AtividadeResolvida>
  >({});
  const [pulouConteudos, setPulouConteudos] = useState(false);
  const [activityTimeoutMap, setActivityTimeoutMap] = useState<Record<number, boolean>>({});
  const [modalProximos, setModalProximos] = useState<{ visivel: boolean; opcoes: any[] }>({
    visivel: false,
    opcoes: [],
  });

  const checkpointParams = useMemo(
    () => ({
      userId: usuario?.id ?? null,
      classeId: classeAtual?.classe_id ?? null,
      topicoId,
      scopeId: "default",
    }),
    [classeAtual?.classe_id, topicoId, usuario?.id]
  );

  useEffect(() => {
    emitSignalRef.current = emitSignal;
  }, [emitSignal]);

  const displayedBlocks = useMemo(
    () => (pulouConteudos ? blocks.filter((b) => b.kind === "atividade") : blocks),
    [blocks, pulouConteudos]
  );

  const progressoTopico = useMemo(() => {
    const acadConteudos = conteudos.filter((c) => !(c as any).isPersonalizedLocal);
    const acadAtividades = atividades.filter((a) => !(a as any).isPersonalizedLocal);
    const total = acadConteudos.length + acadAtividades.length;

    const concluidosConteudo = acadConteudos.reduce((sum, c) => {
      return sum + (isConteudoConcluido(c, conteudosVistosLocal) ? 1 : 0);
    }, 0);

    const concluidosAtividades = acadAtividades.reduce((sum, a) => {
      return sum + (isAtividadeConcluida(a, atividadesResolvidasLocal) ? 1 : 0);
    }, 0);

    const concluidos = concluidosConteudo + concluidosAtividades;
    const pct = total > 0 ? (concluidos / total) * 100 : 0;

    return {
      total,
      concluidos,
      pct: Math.max(0, Math.min(100, pct)),
    };
  }, [conteudos, atividades, conteudosVistosLocal, atividadesResolvidasLocal]);

  const topicoConcluido = useMemo(() => {
    if (!topico) return false;
    const status = String(topico.status ?? "").toLowerCase();
    const pct = Number(topico.percentual_concluido ?? 0);
    if (status.includes("concl") || pct >= 100) return true;
    return progressoTopico.total > 0 && progressoTopico.concluidos >= progressoTopico.total;
  }, [progressoTopico.concluidos, progressoTopico.total, topico]);

  const topicoJaIniciado = useMemo(() => {
    if (!topico) return false;
    const status = String(topico.status ?? "").toLowerCase();
    const pct = Number(topico.percentual_concluido ?? 0);
    return status === "em andamento" || pct > 0;
  }, [topico]);

  const {
    index,
    mostrarResumo,
    activityQuestionIndices,
    setIndex,
    setMostrarResumo,
    setActivityQuestionIndices,
    checkpointHydratedRef,
  } = useCheckpointResume({
    blocks,
    topicoId,
    topico,
    checkpointParams,
    topicoJaIniciado,
    topicoConcluido,
  });

  useEffect(() => {
    const vistos = new Set<number>();
    conteudos.forEach((c) => {
      const st = String(c?.status ?? "").toLowerCase();
      const pct = Number(c?.percentual_concluido ?? 0);
      if (st.includes("concl") || pct >= 100) vistos.add(Number(c.id));
    });
    setConteudosVistosLocal(vistos);

    const novasAtividades = new Map<number, AtividadeResolvida>();
    const novosResultados: Record<number, AtividadeResolvida> = {};

    atividades.forEach((a) => {
      const st = String(a?.status ?? "").toLowerCase();
      const questoes = Array.isArray((a as any)?.questoes) ? (a as any).questoes : [];
      const temRespostaQuestao = questoes.some(
        (q: any) => q?.resposta_aluno != null || Number(q?.ultima_tentativa ?? 0) > 0
      );
      const temRespostaAtividade =
        (a as any)?.resposta_aluno != null || Number((a as any)?.ultima_tentativa ?? 0) > 0;
      const revisao = st.includes("concl");
      const considerar = revisao || temRespostaAtividade || temRespostaQuestao;

      if (!considerar) return;

      const respondidas = questoes.filter((q: any) => q?.resposta_aluno != null);
      const corretas = respondidas.filter((q: any) => q?.correta_aluno === true);
      const correto = revisao
        ? true
        : respondidas.length > 0
        ? corretas.length === respondidas.length
        : Boolean((a as any)?.correta_aluno);

      const acertoMedio = respondidas.length
        ? respondidas.reduce(
            (sum: number, q: any) =>
              sum + Number((q as any).acertos_percentual ?? ((q as any).correta_aluno ? 100 : 0)),
            0
          ) / respondidas.length
        : Number((a as any)?.acertos_percentual ?? (correto ? 100 : 0));

      const acertosPercentual = Math.max(0, Math.round(acertoMedio));
      const payload = { correto, acertosPercentual, revisao };
      const key = Number(a.id);
      novasAtividades.set(key, payload);
      novosResultados[key] = payload;
    });

    setAtividadesResolvidasLocal(novasAtividades);
    setResultadosAtividades(novosResultados);
    setActivityTimeoutMap((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((key) => {
        if (novasAtividades.has(Number(key))) {
          delete next[Number(key)];
        }
      });
      return next;
    });

    setPulouConteudos(false);
  }, [conteudos, atividades, topicoId]);

  useEffect(() => {
    setActivityQuestionIndices({});
    setActivityTimeoutMap({});
  }, [topicoId, setActivityQuestionIndices]);

  const total = displayedBlocks.length;
  const atualBlock =
    index >= 0 && total > 0 ? displayedBlocks[Math.min(index, total - 1)] : null;
  const currentActivityQuestionIndex =
    atualBlock?.kind === "atividade"
      ? activityQuestionIndices[Number(atualBlock.atividade.id)] ?? 0
      : 0;

  useEffect(() => {
    if (index >= total && total > 0) {
      setIndex(total - 1);
    }
  }, [index, total, setIndex]);

  useEffect(() => {
    if (!checkpointHydratedRef.current || !topicoId) return;

    if (topicoConcluido) {
      void clearTrilhaCheckpoint(checkpointParams);
      return;
    }

    if (mostrarResumo || index < 0 || !atualBlock) {
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
      atualBlock.kind === "conteudo"
        ? Number(atualBlock.conteudo.id)
        : Number(atualBlock.atividade.id);

    void saveTrilhaCheckpoint(checkpointParams, {
      mostrarResumo: false,
      blockKind: atualBlock.kind,
      blockId,
      questionIndex: atualBlock.kind === "atividade" ? currentActivityQuestionIndex : null,
      stepIndex: null,
    });
  }, [
    atualBlock,
    checkpointHydratedRef,
    checkpointParams,
    currentActivityQuestionIndex,
    index,
    mostrarResumo,
    topicoConcluido,
    topicoId,
  ]);

  const canBack = index > -1;
  const canContinue = index < total - 1;
  const atividadeAtualResolvida = useMemo(() => {
    if (!atualBlock || atualBlock.kind !== "atividade") return true;
    return isAtividadeConcluida(atualBlock.atividade, atividadesResolvidasLocal);
  }, [atualBlock, atividadesResolvidasLocal]);
  const conteudoAtualConcluido = useMemo(() => {
    if (!atualBlock || atualBlock.kind !== "conteudo") return false;
    return isConteudoConcluido(atualBlock.conteudo, conteudosVistosLocal);
  }, [atualBlock, conteudosVistosLocal]);

  const bloqueiaAvanco =
    topicoConcluido ? false : atualBlock?.kind === "atividade" && !atividadeAtualResolvida;

  const todosBlocosConcluidos = useMemo(() => {
    if (displayedBlocks.length === 0) return true;
    if (topicoConcluido) return true;
    return displayedBlocks.every((b, idx) => {
      if (b.kind === "conteudo") {
        return isConteudoConcluido(b.conteudo, conteudosVistosLocal) || idx < index;
      }
      if (b.kind === "atividade") {
        return isAtividadeConcluida(b.atividade, atividadesResolvidasLocal) || idx < index;
      }
      return idx < index;
    });
  }, [displayedBlocks, conteudosVistosLocal, atividadesResolvidasLocal, index, topicoConcluido]);

  const progressoVisual = useMemo(() => {
    return progressoTopico.pct;
  }, [progressoTopico.pct]);

  const conteudoBlocks = useMemo(
    () => (atualBlock?.kind === "conteudo" ? buildContentBlocks(atualBlock.conteudo) : []),
    [atualBlock]
  );
  const currentContentItemKey = useMemo(() => {
    if (!atualBlock || atualBlock.kind !== "conteudo") return null;
    const explicitItemKey = conteudoBlocks
      .map((block) =>
        typeof block.payload === "object" && block.payload
          ? resolveIAItemKey(block.payload.metadata ?? null)
          : null
      )
      .find(Boolean);

    return explicitItemKey ?? buildIAItemKey("content", Number(atualBlock.conteudo.id));
  }, [atualBlock, conteudoBlocks]);
  const currentMaterialContext = useMemo(() => {
    if (!atualBlock || atualBlock.kind !== "conteudo") {
      return {
        materialKey: null,
        materialType: null,
      };
    }

    return resolveConteudoMaterialContext(
      conteudoBlocks,
      Number(atualBlock.conteudo.id),
      currentContentItemKey
    );
  }, [atualBlock, conteudoBlocks, currentContentItemKey]);
  const isCurrentStudyBlockTrackable = useMemo(() => {
    if (mostrarResumo || index < 0 || !atualBlock || topicoConcluido) return false;
    return true;
  }, [atualBlock, index, mostrarResumo, topicoConcluido]);
  const currentOverlayItemKey = useMemo(() => {
    if (!isCurrentStudyBlockTrackable || !atualBlock) return null;
    if (atualBlock.kind === "conteudo") {
      return currentContentItemKey;
    }
    return buildIAItemKey("activity", Number(atualBlock.atividade.id));
  }, [atualBlock, currentContentItemKey, isCurrentStudyBlockTrackable]);
  const currentOverlayTimerFeature = useMemo(() => {
    if (!isCurrentStudyBlockTrackable || !atualBlock) return null;
    return atualBlock.kind === "atividade" ? "activity_timer" : "reading_timer";
  }, [atualBlock, isCurrentStudyBlockTrackable]);
  useEffect(() => {
    if (!mostrarResumo && isCurrentStudyBlockTrackable && moduleSessionStartedAtRef.current == null) {
      moduleSessionStartedAtRef.current = Date.now();
    }
  }, [isCurrentStudyBlockTrackable, mostrarResumo]);
  useEffect(() => {
    if (isCurrentStudyBlockTrackable) return;
    moduleSessionStartedAtRef.current = null;
  }, [isCurrentStudyBlockTrackable]);
  const currentTimedOutActivityId = useMemo(() => {
    if (!atualBlock || atualBlock.kind !== "atividade" || atividadeAtualResolvida) return null;
    return activityTimeoutMap[Number(atualBlock.atividade.id)] ? Number(atualBlock.atividade.id) : null;
  }, [activityTimeoutMap, atividadeAtualResolvida, atualBlock]);
  const isOverlayTimerActive = useMemo(() => {
    if (!currentOverlayTimerFeature || !isCurrentStudyBlockTrackable) return false;
    if (atualBlock?.kind === "atividade" && currentTimedOutActivityId != null) return false;
    return true;
  }, [atualBlock?.kind, currentOverlayTimerFeature, currentTimedOutActivityId, isCurrentStudyBlockTrackable]);
  const isScreenFocused = useIsFocused();
  const currentStudyBlockSignature = useMemo(() => {
    // Ao perder o foco (sair do modulo), zera a assinatura. Isso faz o
    // setInterval de tempo ser limpo e impede que o ref seja recriado no
    // proximo render, parando o registro de tempo enquanto o aluno esta fora.
    if (!isScreenFocused || !isCurrentStudyBlockTrackable || !topicoId || !atualBlock) return null;
    if (atualBlock.kind === "conteudo") {
      const isPersonalizedLocal = Boolean(
        (atualBlock.conteudo as any)?.isPersonalizedLocal
      );
      const itemKey = String(
        (atualBlock.conteudo as any)?.personalizationKey ??
          currentContentItemKey ??
          buildIAItemKey("content", Number(atualBlock.conteudo.id))
      );
      const itemTitle = String(
        (atualBlock.conteudo as any)?.personalizationTitle ??
          atualBlock.conteudo?.titulo ??
          "Conteúdo personalizado"
      );
      const itemKind =
        String((atualBlock.conteudo as any)?.personalizationKind ?? "content") ===
        "cards"
          ? "cards"
          : "content";

      return {
        key: `content:${atualBlock.conteudo.id}:${currentContentItemKey ?? "content"}`,
        topicoId,
        conteudoId: Number(atualBlock.conteudo.id),
        atividadeId: null,
        isPersonalizedLocal,
        itemKey,
        itemTitle,
        itemKind: itemKind as "content" | "cards",
      };
    }

    const isPersonalizedLocal = Boolean(
      (atualBlock.atividade as any)?.isPersonalizedLocal
    );
    const itemKey = String(
      (atualBlock.atividade as any)?.personalizationKey ??
        buildIAItemKey("activity", Number(atualBlock.atividade.id))
    );
    const itemTitle = String(
      (atualBlock.atividade as any)?.personalizationTitle ??
        atualBlock.atividade?.titulo ??
        "Atividade personalizada"
    );

    return {
      key: `activity:${atualBlock.atividade.id}`,
      topicoId,
      conteudoId:
        atualBlock.vinculadoConteudoId != null ? Number(atualBlock.vinculadoConteudoId) : null,
      atividadeId: Number(atualBlock.atividade.id),
      isPersonalizedLocal,
      itemKey,
      itemTitle,
      itemKind: "activity" as const,
    };
  }, [atualBlock, currentContentItemKey, isCurrentStudyBlockTrackable, isScreenFocused, topicoId]);
  const conteudoComFocoEmArquivo = useMemo(
    () =>
      conteudoBlocks.some((block) =>
        ["pdf", "documento", "apresentacao"].includes(block.tipo)
      ),
    [conteudoBlocks]
  );
  const {
    handleTelemetryTouch,
    handleTelemetryScroll,
    handleOverlayTimerTimeout,
  } = useTelemetryHandlers({
    atualBlock,
    atividadeAtualResolvida,
    topicoConcluido,
    recordTouchSample,
    recordScroll,
    setActivityTimeoutMap,
    showDialog,
  });

  const blocoLabel = atualBlock
    ? atualBlock.kind === "conteudo"
      ? "Conteudo"
      : "Atividade"
    : null;

  const blocoTagColor =
    atualBlock?.kind === "atividade" ? "#2ecc71" : profilePalette.accent;

  const { activeStudyBlockRef, persistElapsedStudyBlock } = useStudyTimeTracking({
    currentStudyBlockSignature,
    registrarTempoTopico,
    registrarTempoConteudo,
    registrarTempoAtividade,
    salvarProgressoItemPersonalizado,
    reloadRanking,
  });

  useFocusEffect(
    useCallback(() => {
      if (!studySessionParams) return undefined;

      void beginStudySession(studySessionParams);
      updateStudyContext({
        topicoId: studySessionParams.topicoId,
        atividadeId: null,
        conteudoId: null,
        itemKey: null,
        materialKey: null,
        materialType: null,
        target: "screen",
        studyState: "idle",
      });

      return () => {
        if (activeStudyBlockRef.current) {
          void persistElapsedStudyBlock(activeStudyBlockRef.current);
          activeStudyBlockRef.current = null;
        }
        void endStudySession("screen_blur");
      };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- activeStudyBlockRef is a stable ref object
    }, [
      beginStudySession,
      endStudySession,
      persistElapsedStudyBlock,
      studySessionParams,
      updateStudyContext,
    ])
  );

  useEffect(() => {
    setLoading(false);
  }, [carregando, setLoading]);

  useEffect(() => {
    if (personalizedTopic) {
      registerTopicPayload(personalizedTopic);
    }
  }, [personalizedTopic, registerTopicPayload]);

  useEffect(() => {
    setActiveTopic(topicoId, personalizedTopic?.planMeta.cycleId ?? null);
  }, [personalizedTopic?.planMeta.cycleId, setActiveTopic, topicoId]);

  useEffect(() => {
    if (!topicoId) return;
    updateStudyContext({
      topicoId,
      atividadeId: null,
      conteudoId: null,
      itemKey: null,
      materialKey: null,
      materialType: null,
      target: "screen",
      studyState: "idle",
    });
    emitSignalRef.current({ type: "topic_open", topicoId });
    lastOpenedSignalRef.current = null;
  }, [topicoId, updateStudyContext]);

  useEffect(() => {
    if (!topicoId || isCurrentStudyBlockTrackable) return;
    updateStudyContext({
      topicoId,
      atividadeId: null,
      conteudoId: null,
      itemKey: null,
      materialKey: null,
      materialType: null,
      target: "screen",
      studyState: "idle",
    });
  }, [isCurrentStudyBlockTrackable, topicoId, updateStudyContext]);

  useEffect(() => {
    if (!isCurrentStudyBlockTrackable || !atualBlock || !topicoId) return;

    const signalKey =
      atualBlock.kind === "conteudo"
        ? `content:${atualBlock.conteudo.id}`
        : `activity:${atualBlock.atividade.id}`;

    if (lastOpenedSignalRef.current === signalKey) return;
    lastOpenedSignalRef.current = signalKey;

    if (atualBlock.kind === "conteudo") {
      updateStudyContext({
        topicoId,
        conteudoId: Number(atualBlock.conteudo.id),
        atividadeId: null,
        itemKey:
          currentContentItemKey ?? buildIAItemKey("content", Number(atualBlock.conteudo.id)),
        materialKey: currentMaterialContext.materialKey,
        materialType: currentMaterialContext.materialType,
        target: "content",
        studyState: "active",
      });
      emitSignalRef.current({
        type: "content_open",
        topicoId,
        contentId: Number(atualBlock.conteudo.id),
        itemKey: currentContentItemKey ?? buildIAItemKey("content", Number(atualBlock.conteudo.id)),
        meta: {
          moduleDifficulty,
        },
      });
      return;
    }

    updateStudyContext({
      topicoId,
      atividadeId: Number(atualBlock.atividade.id),
      conteudoId:
        atualBlock.vinculadoConteudoId != null ? Number(atualBlock.vinculadoConteudoId) : null,
      itemKey: buildIAItemKey("activity", Number(atualBlock.atividade.id)),
      materialKey: null,
      materialType: null,
      target: "activity",
      studyState: "active",
    });
    emitSignalRef.current({
      type: "activity_start",
      topicoId,
      activityId: Number(atualBlock.atividade.id),
      itemKey: buildIAItemKey("activity", Number(atualBlock.atividade.id)),
      meta:
        atualBlock.vinculadoConteudoId != null
          ? {
              contentId: Number(atualBlock.vinculadoConteudoId),
              contentItemKey: buildIAItemKey("content", Number(atualBlock.vinculadoConteudoId)),
              moduleDifficulty,
            }
          : {
              moduleDifficulty,
            },
    });
  }, [
    atualBlock,
    currentContentItemKey,
    currentMaterialContext.materialKey,
    currentMaterialContext.materialType,
    isCurrentStudyBlockTrackable,
    moduleDifficulty,
    topicoId,
    updateStudyContext,
  ]);

  const handleMarcarConteudoVisto = useCallback(
    async (conteudoId: number, itemKeyOverride?: string | null) => {
      if (!topicoId) return;

      const conteudoData = conteudos.find((c) => Number(c?.id) === Number(conteudoId));
      const isPersonalizedContentLocal = Boolean(
        (conteudoData as any)?.isPersonalizedLocal
      );
      const jaConcluido = conteudoData
        ? isConteudoConcluido(conteudoData, conteudosVistosLocal)
        : false;
      const resolvedContentItemKey =
        itemKeyOverride ??
        (currentContentItemKey &&
        Number(atualBlock?.kind === "conteudo" ? atualBlock.conteudo.id : NaN) ===
          Number(conteudoId)
          ? currentContentItemKey
          : buildIAItemKey("content", Number(conteudoId)));

      try {
        if (jaConcluido || topicoConcluido) {
          return;
        }

        if (!isPersonalizedContentLocal) {
          await marcarConteudoVisto(topicoId, conteudoId);
        } else {
          const personalizedKey =
            String(
              (conteudoData as any)?.personalizationKey ??
                (conteudoData as any)?.metadata?.itemKey ??
                resolvedContentItemKey
            ).trim() || resolvedContentItemKey;
          const personalizedTitle =
            String(
              (conteudoData as any)?.personalizationTitle ??
                conteudoData?.titulo ??
                "Conteudo personalizado"
            ).trim() || "Conteudo personalizado";
          const personalizedKind =
            String((conteudoData as any)?.personalizationKind ?? "content") ===
            "cards"
              ? "cards"
              : "content";

          await salvarProgressoItemPersonalizado({
            topicoId,
            itemKey: personalizedKey,
            itemKind: personalizedKind,
            itemTitle: personalizedTitle,
            status: "concluido",
            percentualConcluido: 100,
            metadata: {
              source: "mobile_trilha",
            },
          });
        }
        setConteudosVistosLocal((prev) => {
          const next = new Set(prev);
          next.add(Number(conteudoId));
          return next;
        });
        emitSignalRef.current({
          type: "content_complete",
          topicoId,
          contentId: Number(conteudoId),
          itemKey: resolvedContentItemKey,
          meta: {
            moduleDifficulty,
            personalized: isPersonalizedContentLocal || undefined,
          },
        });
        recordAppEvent({
          eventGroup: "navigation",
          eventName: "content_complete",
          topicoId,
          conteudoId: Number(conteudoId),
          itemKey: resolvedContentItemKey,
          payload: isPersonalizedContentLocal
            ? {
                personalized: true,
              }
            : undefined,
        });
        void reloadRanking();
      } catch (err) {
        console.warn("[TrilhaConteudo] Erro ao marcar conteudo:", err);
      }
    },
    [
      topicoId,
      marcarConteudoVisto,
      conteudos,
      currentContentItemKey,
      atualBlock,
      conteudosVistosLocal,
      recordAppEvent,
      reloadRanking,
      salvarProgressoItemPersonalizado,
      moduleDifficulty,
      topicoConcluido,
    ]
  );

  useEffect(() => {
    if (!atualBlock || index < 0 || mostrarResumo) return;
    if (atualBlock.kind !== "conteudo") return;

    const conteudoId = Number(atualBlock.conteudo.id);
    const autoViewKey = `${topicoId ?? "sem-topico"}:${conteudoId}:${index}`;
    if (autoViewedContentRef.current === autoViewKey) return;
    autoViewedContentRef.current = autoViewKey;
    handleMarcarConteudoVisto(conteudoId);
  }, [atualBlock, index, mostrarResumo, handleMarcarConteudoVisto, topicoId]);

  useEffect(() => {
    autoViewedContentRef.current = null;
  }, [topicoId]);

  const avaliarPulo = useCallback(
    async (mapa: Record<number, AtividadeResolvida>) => {
      if (!pulouConteudos || !topicoId) return;
      if (!academicAtividades.length) return;

      const todasRespondidas = academicAtividades.every((a) => mapa[Number(a.id)]);
      if (!todasRespondidas) return;

      const todasCorretas = academicAtividades.every((a) => mapa[Number(a.id)]?.correto);
      if (!todasCorretas) return;

      try {
        for (const conteudo of academicConteudos) {
          const cid = Number(conteudo.id);
          if (conteudosVistosLocal.has(cid)) continue;
          await marcarConteudoVisto(topicoId, cid);
          setConteudosVistosLocal((prev) => {
            const next = new Set(prev);
            next.add(cid);
            return next;
          });
        }
        await refreshTopico(topicoId);
      } catch (err) {
        console.warn("[TrilhaConteudo] Erro ao aplicar pulo de conteudo:", err);
      }
    },
    [
      pulouConteudos,
      topicoId,
      academicAtividades,
      academicConteudos,
      conteudosVistosLocal,
      marcarConteudoVisto,
      refreshTopico,
    ]
  );

  const handleAtividadeAcademicaComplete = useCallback(
    async (
      atividade: any,
      linkedContentId: number | null,
      resultado?: ActivityCompletePayload
    ) => {
      if (!atividade || !topicoId) return;

      const atividadeId = Number(atividade.id);
      const isPersonalizedLocal = Boolean((atividade as any)?.isPersonalizedLocal);
      const statusAtual = String(atividade.status ?? "").toLowerCase();
      const jaConcluida = statusAtual.includes("concl");
      const revisao = jaConcluida || topicoConcluido;
      const acertou = resultado?.correto ?? false;
      const percentual = resultado?.acertosPercentual ?? (acertou ? 100 : 0);
      const atividadeCompleta = resultado?.completed ?? true;
      const scoreAwarded =
        typeof (resultado as any)?.scoreAwarded === "number" &&
        Number.isFinite((resultado as any)?.scoreAwarded)
          ? Number((resultado as any)?.scoreAwarded)
          : null;
      const scoreMaximo =
        typeof (resultado as any)?.pontuacaoMaxima === "number" &&
        Number.isFinite((resultado as any)?.pontuacaoMaxima)
          ? Number((resultado as any)?.pontuacaoMaxima)
          : Number(atividade?.pontuacao_maxima ?? 0) || null;
      const avaliacaoMetadata =
        resultado && typeof (resultado as any)?.avaliacaoMetadata === "object"
          ? ((resultado as any).avaliacaoMetadata as Record<string, unknown>)
          : null;

      const novoResultado = { correto: acertou, acertosPercentual: percentual, revisao };
      const proximosResultados = atividadeCompleta
        ? { ...resultadosAtividades, [atividadeId]: novoResultado }
        : resultadosAtividades;

      setAtividadesResolvidasLocal((prev) => {
        if (!atividadeCompleta) return prev;
        const next = new Map(prev);
        next.set(atividadeId, novoResultado);
        return next;
      });
      if (atividadeCompleta) {
        setResultadosAtividades(proximosResultados);
      }
      if (!revisao && atividadeCompleta) {
        atividade.status = "concluido";
      }

      try {
        if (!atividadeCompleta) {
          return;
        }

        const activityItemKey = String(
          (atividade as any)?.personalizationKey ??
            buildIAItemKey("activity", atividadeId)
        );
        const activityItemTitle = String(
          (atividade as any)?.personalizationTitle ??
            atividade?.titulo ??
            "Atividade personalizada"
        );
        const linkedContentItemKey =
          linkedContentId != null ? buildIAItemKey("content", linkedContentId) : null;

        if (!revisao && !isPersonalizedLocal) {
          try {
            await registrarAtividadeConcluida(topicoId, atividadeId, percentual, {
              pontuacaoObtida: scoreAwarded,
              pontuacaoMaxima: scoreMaximo,
              avaliacaoMetadata,
            });
          } catch (error) {
            console.warn(
              "[TrilhaConteudo] Falha ao persistir atividade concluída. Evento será enviado mesmo assim:",
              error
            );
          }
        }

        const baseValor = Number(atividade.pontuacao_maxima ?? 100) || 100;
        const valorEventoRaw = revisao
          ? 0
          : scoreAwarded != null
          ? scoreAwarded
          : acertou
          ? // proporcional ao acerto: 60% de acerto => 60% dos pontos (antes
            // dava sempre a pontuacao maxima, inflando XP em acertos parciais)
            Math.max(1, Math.round(baseValor * (Math.max(0, Math.min(100, percentual)) / 100)))
          : Math.max(1, Math.round(baseValor * 0.1));
        const valorEvento = Math.max(
          0,
          Number.isFinite(valorEventoRaw) ? Number(valorEventoRaw) : 0
        );

        const eventoTipoBase = revisao
          ? "atividade_revisada"
          : acertou
          ? "atividade_acertada"
          : "atividade_errada";

        const temReferenciaAtividadeValida =
          !isPersonalizedLocal &&
          Number.isInteger(atividadeId) &&
          Number(atividadeId) > 0;
        const eventoReferencia = temReferenciaAtividadeValida
          ? `atividade:${atividadeId}`
          : `topico:${topicoId}`;
        const eventoTipo = temReferenciaAtividadeValida
          ? eventoTipoBase
          : `topico_${eventoTipoBase}`;

        try {
          await registrarEvento(eventoTipo, eventoReferencia, valorEvento);
          void reloadRanking();
        } catch (error) {
          console.warn("[TrilhaConteudo] Falha ao registrar evento da atividade:", error);
          recordAppEvent({
            eventGroup: "performance",
            eventName: "activity_event_register_failed",
            topicoId,
            conteudoId: linkedContentId,
            atividadeId: atividadeId,
            itemKey: activityItemKey,
            payload: {
              eventoTipo,
              eventoReferencia,
              valorEvento,
            },
          });
          showDialog({
            title: "Pontuacao pendente",
            description:
              "A atividade foi salva, mas nao foi possivel registrar a pontuacao agora. Tente sincronizar novamente em instantes.",
            tone: "warning",
          });
        }

        if (isPersonalizedLocal) {
          await salvarProgressoItemPersonalizado({
            topicoId,
            itemKey: activityItemKey,
            itemKind: "activity",
            itemTitle: activityItemTitle,
            status: atividadeCompleta ? "concluido" : "em_andamento",
            percentualConcluido: atividadeCompleta ? 100 : Math.max(0, percentual),
            acertosPercentual: percentual,
            pontuacaoObtida: scoreAwarded,
            pontuacaoMaxima: scoreMaximo,
            metadata: {
              source: "mobile_trilha",
              personalized: true,
            },
          });
        }

        emitSignalRef.current({
          type: acertou ? "activity_correct" : "activity_wrong",
          topicoId,
          activityId: atividadeId,
          itemKey: activityItemKey,
          meta: {
            moduleDifficulty,
            acertosPercentual: percentual,
            scoreAwarded: scoreAwarded,
            scoreMax: scoreMaximo,
            contentId: linkedContentId,
            contentItemKey: linkedContentItemKey,
            personalized: isPersonalizedLocal || undefined,
          },
        });
        if (atividadeCompleta) {
          emitSignalRef.current({
            type: "activity_complete",
            topicoId,
            activityId: atividadeId,
            itemKey: activityItemKey,
            meta: {
              moduleDifficulty,
              acertosPercentual: percentual,
              scoreAwarded: scoreAwarded,
              scoreMax: scoreMaximo,
              contentId: linkedContentId,
              contentItemKey: linkedContentItemKey,
              isCorrect: acertou,
              personalized: isPersonalizedLocal || undefined,
            },
          });
          recordAppEvent({
            eventGroup: "navigation",
            eventName: "activity_complete",
            topicoId,
            conteudoId: linkedContentId,
            atividadeId: atividadeId,
            itemKey: activityItemKey,
            isCorrect: acertou,
            payload: {
              acertos_percentual: percentual,
              score_awarded: scoreAwarded,
              score_max: scoreMaximo,
              personalized: isPersonalizedLocal,
            },
          });
        }
        await flushStudyBatch("activity_complete");
        if (!isPersonalizedLocal) {
          await avaliarPulo(proximosResultados);
          await refreshTopico(topicoId);
        }
        setActivityTimeoutMap((prev) => {
          if (!prev[atividadeId]) return prev;
          const next = { ...prev };
          delete next[atividadeId];
          return next;
        });
      } catch (err) {
        console.error("[TrilhaConteudo] Erro ao processar atividade:", err);
      }
    },
    [
      topicoId,
      registrarAtividadeConcluida,
      registrarEvento,
      flushStudyBatch,
      avaliarPulo,
      recordAppEvent,
      showDialog,
      refreshTopico,
      reloadRanking,
      resultadosAtividades,
      salvarProgressoItemPersonalizado,
      moduleDifficulty,
      topicoConcluido,
    ]
  );

  const handleAtividadeComplete = useCallback(
    async (resultado?: ActivityCompletePayload) => {
      if (!atualBlock || atualBlock.kind !== "atividade") return;

      await handleAtividadeAcademicaComplete(
        atualBlock.atividade,
        atualBlock.vinculadoConteudoId != null ? Number(atualBlock.vinculadoConteudoId) : null,
        resultado
      );
    },
    [atualBlock, handleAtividadeAcademicaComplete]
  );

  const {
    handlePularTrilha,
    handleConcluirTopico,
  } = useTopicoCompletion({
    topicoId,
    topico,
    blocks,
    academicConteudos,
    academicAtividades,
    atividadesResolvidasLocal,
    conteudosVistosLocal,
    topicoConcluido,
    todosBlocosConcluidos,
    bloqueiaAvanco,
    atualBlock,
    conteudoAtualConcluido,
    atividadeAtualResolvida,
    currentContentItemKey,
    checkpointParams,
    classeAtual,
    setMostrarResumo,
    setPulouConteudos,
    setIndex,
    setModalProximos,
    marcarTopicoConcluido,
    handleMarcarConteudoVisto,
    flushStudyBatch,
    resetBattleState,
    reloadRanking,
    reloadConquistas,
    registrarEvento,
    getProximosTopicos,
    recordAppEvent,
    showConfirm,
    showDialog,
    router,
  });

  useEffect(() => {
    concluirTopicoRef.current = handleConcluirTopico;
  }, [handleConcluirTopico]);

  const handleVoltar = useCallback(() => {
    if (index === 0) {
      setIndex(-1);
      setMostrarResumo(true);
    } else {
      setIndex((p) => Math.max(-1, p - 1));
    }
  }, [index, setIndex, setMostrarResumo]);
  if (carregando && !classeAtual) {
    return (
      <SafeAreaView style={styles.screen}>
        <LoadingState
          title="Carregando trilha"
          message="Organizando conteúdos e atividades para você."
          palette={profilePalette}
        />
      </SafeAreaView>
    );
  }

  if (erro) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.center}>
          <Text style={styles.errorTitle}>Erro ao carregar trilha</Text>
          <Text style={styles.helperText}>{erro.message}</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!topico) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.center}>
          <Text style={styles.errorTitle}>Trilha não encontrada</Text>
          <Text style={styles.helperText}>
            Não foi possível localizar os conteúdos desta trilha.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={[styles.screen, { backgroundColor: profilePalette.background }]}
      edges={["top", "bottom"]}
      onTouchStart={handleTelemetryTouch}
    >
      {/* ── Textura medieval de fundo ── */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <HallBackground palette={profilePalette} />
      </View>

      <ScrollView
        style={styles.scrollView}
        showsVerticalScrollIndicator={false}
        onScroll={handleTelemetryScroll}
        scrollEventThrottle={16}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingBottom: 200 },
        ]}
      >
        <View style={styles.header}>
          <View style={styles.headerTopMeta}>
            {total > 0 ? (
              <>
                <View style={styles.progressHeaderRow}>
                  <Text style={[styles.progressLabel, { color: profilePalette.textMuted }]}>Progresso do módulo</Text>
                  <Text style={[styles.progressPercent, { color: profilePalette.accent }]}>
                    {Math.round(progressoVisual)}%
                  </Text>
                </View>

                <View style={[styles.progressBarContainer, { backgroundColor: profilePalette.progressTrack }]}>
                  <View
                    style={[
                      styles.progressBarFill,
                      {
                        width: `${Math.max(0, Math.min(100, progressoVisual))}%`,
                        backgroundColor: profilePalette.accent,
                      },
                    ]}
                  />
                </View>
                <Text style={[styles.progressCounter, { color: profilePalette.textSubtle }]}>
                  {progressoTopico.concluidos} de {progressoTopico.total} blocos concluídos
                </Text>
              </>
            ) : null}
            {personalizacaoCarregando ? (
              <Text style={[styles.progressSyncText, { color: profilePalette.textSubtle }]}>
                Atualizando conteúdo personalizado...
              </Text>
            ) : null}
          </View>
        </View>

        {mostrarResumo && index === -1 && (
          <>
            <View style={[styles.ornamentWrap, { opacity: 0.6 }]}>
              <OrnamentDivider color={profilePalette.accent} />
            </View>
            <TopicoIntroSummary
              topico={topico}
              totalBlocos={total}
              modo={modo}
              theme={{
                accentColor: profilePalette.accent,
                softColor: profilePalette.surface,
                borderColor: profilePalette.border,
                mutedTextColor: profilePalette.textMuted,
              }}
            />

            <View style={styles.skipContainer}>
              <Pressable
                style={[
                  styles.skipButton,
                  {
                    backgroundColor: profilePalette.accentMuted,
                    borderColor: profilePalette.accent,
                  },
                ]}
                onPress={handlePularTrilha}
              >
                <Text style={[styles.skipButtonText, { color: profilePalette.accent }]}>
                  Fazer teste e pular módulo
                </Text>
              </Pressable>
            </View>
          </>
        )}

        {!mostrarResumo && (total === 0 || !atualBlock) ? (
          <CardSemDados
            title="Sem conteúdos"
            description="Esta trilha ainda não possui conteúdos cadastrados."
          />
        ) : !mostrarResumo && atualBlock ? (
          <View
            style={[
              styles.card,
              conteudoComFocoEmArquivo && styles.cardFileFocus,
              {
                backgroundColor: profilePalette.surfaceElevated,
                borderColor: profilePalette.border,
              },
            ]}
          >
            <View
              style={[
                styles.cardHeader,
                conteudoComFocoEmArquivo && styles.cardHeaderFileFocus,
              ]}
            >
              {blocoLabel ? (
                <View
                  style={[
                    styles.tag,
                    conteudoComFocoEmArquivo && styles.tagFileFocus,
                    {
                      backgroundColor: blocoTagColor + "22",
                      borderColor: blocoTagColor,
                    },
                  ]}
                >
                  <Text
                    style={[styles.tagText, { color: blocoTagColor }]}
                  >
                    {blocoLabel}
                  </Text>
                </View>
              ) : null}

              <Text style={[styles.progressChip, { color: profilePalette.textSubtle }]}>
                Bloco {index + 1} / {total}
              </Text>
            </View>

            <Text
              style={[
                styles.cardTitle,
                conteudoComFocoEmArquivo && styles.cardTitleFileFocus,
                { color: profilePalette.text },
              ]}
            >
              {atualBlock.kind === "conteudo"
                ? atualBlock.conteudo.titulo ?? topico.nome
                : atualBlock.atividade.titulo ?? "Atividade"}
            </Text>

            {atualBlock.kind === "conteudo" && atualBlock.conteudo.tipo ? (
              <Text
                style={[
                  styles.cardType,
                  conteudoComFocoEmArquivo && styles.cardTypeFileFocus,
                  { color: profilePalette.textMuted },
                ]}
              >
                {atualBlock.conteudo.tipo}
              </Text>
            ) : null}

            {atualBlock.kind === "conteudo" ? (
              <>
                <ContentRenderer
                  blocks={conteudoBlocks}
                  WebView={WebView}
                  topicoId={topicoId}
                />
              </>
            ) : (
              <ActivityRenderer
                atividade={atualBlock.atividade}
                topicoId={topicoId ?? topico?.id ?? null}
                onComplete={handleAtividadeComplete}
                initialQuestionIndex={currentActivityQuestionIndex}
                onQuestionIndexChange={(questionIndex) => {
                  const atividadeId = Number(atualBlock.atividade.id);
                  setActivityQuestionIndices((prev) =>
                    prev[atividadeId] === questionIndex
                      ? prev
                      : { ...prev, [atividadeId]: questionIndex }
                  );
                }}
                timedOut={currentTimedOutActivityId === Number(atualBlock.atividade.id)}
                reviewMode={isAtividadeConcluida(atualBlock.atividade, atividadesResolvidasLocal)}
              />
            )}
          </View>
        ) : null}
      </ScrollView>

      <View
        style={[
          styles.footer,
          {
            backgroundColor: profilePalette.background,
            borderTopColor: profilePalette.border,
            paddingTop: 12,
            paddingBottom: 8,
          },
        ]}
      >
        <View style={styles.footerRow}>
          {index === -1 ? (
            <>
              <Pressable
                hitSlop={12}
                style={[
                  styles.button,
                  {
                    backgroundColor: profilePalette.accent,
                    borderColor: profilePalette.borderStrong,
                  },
                ]}
                onPress={async () => {
                  setMostrarResumo(false);
                  const posicao = topicoJaIniciado
                    ? calcularPosicaoInicial(displayedBlocks)
                    : 0;
                  setIndex(Math.max(0, posicao));
                  if (topicoId) {
                    await marcarTopicoIniciado(topicoId);
                    if (!topicoConcluido) {
                      try {
                        await registrarEvento("topico_iniciado", `topico:${topicoId}`, null);
                      } catch (error) {
                        console.warn("[TrilhaConteudo] Falha ao registrar evento de topico iniciado:", error);
                      }
                    }
                  }
                }}
              >
                <Text style={styles.buttonText}>
                  {topicoJaIniciado
                    ? "Continuar"
                    : "Iniciar tópico"}
                </Text>
              </Pressable>

              {topicoConcluido && (
                <Pressable
                  hitSlop={12}
                  style={[
                    styles.secondaryButton,
                    {
                      backgroundColor: profilePalette.surfaceElevated,
                      borderColor: profilePalette.border,
                    },
                  ]}
                  onPress={() => {
                    setMostrarResumo(false);
                    setPulouConteudos(false);
                    setIndex(0);
                  }}
                >
                  <Text style={styles.secondaryButtonText}>
                    Revisar tópico
                  </Text>
                </Pressable>
              )}
            </>
          ) : (
            <>
              <Pressable
                hitSlop={12}
                style={[
                  styles.secondaryButton,
                  {
                    backgroundColor: profilePalette.surfaceElevated,
                    borderColor: profilePalette.border,
                  },
                  !canBack && styles.buttonDisabled,
                ]}
                disabled={!canBack}
                onPress={handleVoltar}
              >
                <Text style={styles.secondaryButtonText}>Voltar</Text>
              </Pressable>

              <Pressable
                hitSlop={12}
                style={[
                  styles.button,
                  {
                    backgroundColor: profilePalette.accent,
                    borderColor: profilePalette.borderStrong,
                  },
                  bloqueiaAvanco && styles.buttonDisabled,
                ]}
                disabled={bloqueiaAvanco}
                onPress={async () => {
                  if (bloqueiaAvanco) {
                    showDialog({
                      title: "Responda a atividade",
                      description: "Confirme a resposta para liberar o avanço.",
                      tone: "warning",
                    });
                    return;
                  }
                  if (canContinue) {
                    setIndex((p) => p + 1);
                  } else {
                    await handleConcluirTopico();
                  }
                }}
                >
                  <Text style={styles.buttonText}>
                  {canContinue ? "Continuar" : "Concluir módulo"}
                  </Text>
                </Pressable>
            </>
          )}
        </View>
      </View>

      {!mostrarResumo && topicoId ? (
        <IAMentorPanel
          classeId={classeAtual?.classe_id ?? null}
          topicoId={topicoId}
          scope="modulo"
          bottomOffset={148}
        />
      ) : null}

      {/* ── Timer flutuante — fora do ScrollView, não rola com o conteúdo ── */}
      <View style={styles.floatingTimerWrap} pointerEvents="none">
        <IAHeaderTimer
          topicoId={topicoId}
          itemKey={currentOverlayItemKey}
          preferredTimerFeature={currentOverlayTimerFeature}
          elapsedStartAtMs={moduleSessionStartedAtRef.current}
          active={isOverlayTimerActive}
          onTimeoutAction={handleOverlayTimerTimeout}
        />
      </View>

      {/* ── Chip de batalha flutuante ── */}
      {!mostrarResumo && isCurrentStudyBlockTrackable && topicoId ? (
        <View style={styles.floatingBattleWrap} pointerEvents="box-none">
          <IABattleHeaderChip
            topicoId={topicoId}
            itemKey={currentOverlayItemKey}
          />
        </View>
      ) : null}

      <Modal
        visible={modalProximos.visivel}
        transparent
        animationType="fade"
        onRequestClose={() => setModalProximos({ visivel: false, opcoes: [] })}
      >
        <View style={styles.modalBackdrop}>
          <View
            style={[
              styles.modalCard,
              {
                backgroundColor: profilePalette.surfaceElevated,
                borderColor: profilePalette.borderStrong,
              },
            ]}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Text style={styles.modalTitle}>Módulo desbloqueado!</Text>
            </View>
            <Text style={styles.modalSubtitle}>
              Estes módulos foram desbloqueados após a conclusão. Selecione para onde deseja seguir.
            </Text>

            {modalProximos.opcoes.map((opt) => (
              <Pressable
                key={opt.id}
                style={[
                  styles.modalOption,
                  {
                    backgroundColor: profilePalette.surface,
                    borderColor: profilePalette.border,
                  },
                ]}
                onPress={() => {
                  setModalProximos({ visivel: false, opcoes: [] });
                  router.replace(`/trilha/${opt.id}`);
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.modalOptionTitle}>
                    {opt.nome ?? `Módulo ${opt.id}`}
                  </Text>
                  <Text style={styles.modalOptionDesc}>
                    {Math.round(Number(opt.percentual_concluido ?? 0))}% concluído
                  </Text>
                </View>
                <Text style={styles.modalOptionLink}>Ir</Text>
              </Pressable>
            ))}

            <Pressable
              style={[
                styles.modalClose,
                {
                  backgroundColor: profilePalette.background,
                  borderColor: profilePalette.border,
                },
              ]}
              onPress={() => setModalProximos({ visivel: false, opcoes: [] })}
            >
              <Text style={styles.modalCloseText}>Ficar neste módulo</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
