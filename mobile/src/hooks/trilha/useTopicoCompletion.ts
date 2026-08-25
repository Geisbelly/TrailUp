import { useCallback } from "react";
import type { Router } from "expo-router";

import {
  isAtividadeConcluida,
  isConteudoConcluido,
  type Atividade,
  type AtividadeResolvida,
  type Block,
  type Conteudo,
} from "@/utils/trilhaBlocks";
import {
  clearTrilhaCheckpoint,
  type TrilhaCheckpointKeyParams,
} from "@/utils/trilhaCheckpoint";
import type { TelemetryFlushReason, TelemetryAppEventGroup } from "@/interfaces/telemetria/TelemetryContracts";
import type { IAFeatureSelectorScope } from "@/interfaces/personalizacao/IAContracts";
import type { Topico } from "@/models/Topico";

type BattleScope = Extract<IAFeatureSelectorScope, { scope: "topic" | "item" }>;

type ShowDialog = (opts: {
  title: string;
  description?: string;
  tone?: "info" | "success" | "warning" | "error";
  dismissible?: boolean;
  actions?: { label: string; onPress?: () => void | Promise<void>; variant?: "primary" | "secondary" | "danger" }[];
}) => void;

type ShowConfirm = (opts: {
  title: string;
  description?: string;
  tone?: "info" | "warning" | "error";
  confirmLabel?: string;
  cancelLabel?: string;
  confirmVariant?: "primary" | "secondary" | "danger";
  onConfirm?: () => void | Promise<void>;
  onCancel?: () => void | Promise<void>;
}) => void;

export function useTopicoCompletion(args: {
  // Data
  topicoId: number | null;
  topico: Topico | null;
  blocks: Block[];
  academicConteudos: Conteudo[];
  academicAtividades: Atividade[];
  atividadesResolvidasLocal: Map<number, AtividadeResolvida>;
  conteudosVistosLocal: Set<number>;
  topicoConcluido: boolean;
  todosBlocosConcluidos: boolean;
  bloqueiaAvanco: boolean;
  atualBlock: Block | null;
  conteudoAtualConcluido: boolean;
  atividadeAtualResolvida: boolean;
  currentContentItemKey: string | null;
  checkpointParams: TrilhaCheckpointKeyParams;
  classeAtual: { topicos: any[] } | null;
  // Setters
  setMostrarResumo: (value: boolean) => void;
  setPulouConteudos: (value: boolean) => void;
  setIndex: (value: number) => void;
  setModalProximos: (value: { visivel: boolean; opcoes: any[] }) => void;
  // Async actions
  marcarTopicoConcluido: (topicoId: number) => Promise<void>;
  handleMarcarConteudoVisto: (conteudoId: number, itemKeyOverride?: string | null) => Promise<void>;
  flushStudyBatch: (reason: TelemetryFlushReason) => Promise<any>;
  resetBattleState: (scope: BattleScope) => Promise<void>;
  reloadRanking: () => Promise<void>;
  reloadConquistas: () => Promise<void>;
  registrarEvento: (tipo: string, referencia?: string | null, valor?: number | null) => Promise<void>;
  getProximosTopicos: (topicoId?: number | null) => any[];
  recordAppEvent: (event: {
    eventGroup: TelemetryAppEventGroup;
    eventName: string;
    topicoId?: number | null;
    conteudoId?: number | null;
    atividadeId?: number | null;
    questaoId?: number | null;
    itemKey?: string | null;
    payload?: Record<string, unknown>;
  }) => void;
  // Dialog
  showConfirm: ShowConfirm;
  showDialog: ShowDialog;
  // Router
  router: Router;
}) {
  const {
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
  } = args;

  const areAcademicBlocksComplete = useCallback(
    (optimistic?: {
      conteudoId?: number | null;
      atividadeId?: number | null;
      conteudoIds?: number[];
      atividadeIds?: number[];
    }) => {
      if (!topico) return false;
      if (topicoConcluido) return true;

      const optimisticConteudoId =
        optimistic?.conteudoId != null ? Number(optimistic.conteudoId) : null;
      const optimisticAtividadeId =
        optimistic?.atividadeId != null ? Number(optimistic.atividadeId) : null;
      const optimisticConteudoIds = new Set<number>(
        [
          ...(optimistic?.conteudoIds ?? []).map(Number),
          optimisticConteudoId,
        ].filter((value): value is number => Number.isFinite(value as number))
      );
      const optimisticAtividadeIds = new Set<number>(
        [
          ...(optimistic?.atividadeIds ?? []).map(Number),
          optimisticAtividadeId,
        ].filter((value): value is number => Number.isFinite(value as number))
      );

      return (
        academicConteudos.every((conteudo) => {
          const conteudoId = Number(conteudo?.id);
          return (
            isConteudoConcluido(conteudo, conteudosVistosLocal) ||
            optimisticConteudoIds.has(conteudoId)
          );
        }) &&
        academicAtividades.every((atividade) => {
          const atividadeId = Number(atividade?.id);
          return (
            isAtividadeConcluida(atividade, atividadesResolvidasLocal) ||
            optimisticAtividadeIds.has(atividadeId)
          );
        })
      );
    },
    [
      academicAtividades,
      academicConteudos,
      atividadesResolvidasLocal,
      conteudosVistosLocal,
      topico,
      topicoConcluido,
    ]
  );

  const handlePularTrilha = useCallback(async () => {
    if (!blocks.length) return;

    const primeiraAtividadeIndex = blocks.findIndex(
      (b) => b.kind === "atividade"
    );

    if (primeiraAtividadeIndex === -1) {
      showDialog({
        title: "Sem questões",
        description: "Este módulo ainda não possui atividades para pular.",
        tone: "info",
      });
      return;
    }

    showConfirm({
      title: "Pular módulo",
      description: "Deseja pular o conteúdo e ir direto para as questões deste módulo?",
      confirmLabel: "Ir para as questões",
      cancelLabel: "Cancelar",
      onConfirm: async () => {
        setMostrarResumo(false);
        setPulouConteudos(true);
        setIndex(0);
        if (topicoId) {
          await registrarEvento(
            "topico_pular_conteudo",
            `topico:${topicoId}`
          );
        }
      },
    });
  }, [blocks, registrarEvento, setIndex, setMostrarResumo, setPulouConteudos, showConfirm, showDialog, topicoId]);

  const navegarAposConclusao = useCallback(async () => {
    if (!topicoId || !topico) return;

    const proximosDoAtual = Array.isArray(topico?.next)
      ? (topico.next as number[])
          .map(Number)
          .filter(Boolean)
          .map((id) => classeAtual?.topicos.find((t: any) => t.id === id))
          .filter((t): t is any => !!t)
      : [];

    const proximos = getProximosTopicos(topicoId);

    if (proximosDoAtual.length >= 2) {
      setModalProximos({ visivel: true, opcoes: proximosDoAtual });
      return;
    }

    if (!proximos.length) {
      showDialog({
        title: "Parabéns!",
        description: "Você concluiu este módulo.",
        tone: "success",
        actions: [{ label: "OK", onPress: () => router.back() }],
      });
      return;
    }

    if (proximos.length === 1) {
      const proximo = proximos[0];
      showConfirm({
        title: "Módulo concluído!",
        description: `Deseja ir para o próximo módulo "${proximo.nome}"?`,
        confirmLabel: "Ir para o próximo módulo",
        cancelLabel: "Ficar aqui",
        onConfirm: () => router.replace(`/trilha/${proximo.id}`),
      });
      return;
    }

    setModalProximos({ visivel: true, opcoes: proximos });
  }, [classeAtual?.topicos, getProximosTopicos, router, setModalProximos, showConfirm, showDialog, topico, topicoId]);

  const handleConcluirTopico = useCallback(async () => {
    if (!topicoId || !topico) return;

    if (bloqueiaAvanco) {
      showDialog({
        title: "Responda a atividade",
        description: "Confirme a resposta antes de avançar.",
        tone: "warning",
      });
      return;
    }

    const optimisticConteudoId =
      atualBlock?.kind === "conteudo" && !conteudoAtualConcluido
        ? Number(atualBlock.conteudo.id)
        : null;
    const optimisticAtividadeId =
      atualBlock?.kind === "atividade" && atividadeAtualResolvida
        ? Number(atualBlock.atividade.id)
        : null;

    if (optimisticConteudoId != null) {
      await handleMarcarConteudoVisto(optimisticConteudoId, currentContentItemKey);
    }

    const canFinalizeAcademic =
      topicoConcluido ||
      todosBlocosConcluidos ||
      areAcademicBlocksComplete({
        conteudoId: optimisticConteudoId,
        atividadeId: optimisticAtividadeId,
      });

    if (!canFinalizeAcademic) {
      showDialog({
        title: "Conclua os blocos",
        description: "Finalize todos os conteúdos e atividades deste módulo para avançar.",
        tone: "warning",
      });
      return;
    }

    const jaConcluido =
      String(topico.status ?? "").toLowerCase().includes("concl") ||
      Number(topico.percentual_concluido ?? 0) >= 100;

    try {
      if (!jaConcluido) {
        await marcarTopicoConcluido(topicoId);
        void reloadRanking();
        void reloadConquistas();
      }

      await clearTrilhaCheckpoint(checkpointParams);
      recordAppEvent({
        eventGroup: "navigation",
        eventName: "topic_complete",
        topicoId,
      });
      await flushStudyBatch("topic_complete");
      await resetBattleState({ scope: "topic", topicoId });
      await navegarAposConclusao();
    } catch (err) {
      console.error("[TrilhaConteudo] Erro ao concluir topico:", err);
      router.back();
    }
  }, [
    topicoId,
    topico,
    bloqueiaAvanco,
    atualBlock,
    conteudoAtualConcluido,
    atividadeAtualResolvida,
    currentContentItemKey,
    handleMarcarConteudoVisto,
    topicoConcluido,
    todosBlocosConcluidos,
    areAcademicBlocksComplete,
    marcarTopicoConcluido,
    flushStudyBatch,
    recordAppEvent,
    resetBattleState,
    reloadRanking,
    reloadConquistas,
    navegarAposConclusao,
    router,
    showDialog,
    checkpointParams,
  ]);

  return {
    areAcademicBlocksComplete,
    handlePularTrilha,
    handleConcluirTopico,
  };
}
