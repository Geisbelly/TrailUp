import { MutableRefObject, useCallback, useEffect, useRef } from "react";
import { AppState } from "react-native";

import type { ProgressoItemPersonalizado, StudyBlockSnapshot } from "@/hooks/trilha/types";

const ACTIVE_STUDY_FLUSH_INTERVAL_MS = 60_000;

export function useStudyTimeTracking(args: {
  currentStudyBlockSignature: Omit<StudyBlockSnapshot, "startedAtMs"> | null;
  registrarTempoTopico: (topicoId: number, min: number) => Promise<void>;
  registrarTempoConteudo: (topicoId: number, conteudoId: number, min: number) => Promise<void>;
  registrarTempoAtividade: (topicoId: number, atividadeId: number, min: number) => Promise<void>;
  salvarProgressoItemPersonalizado: (payload: ProgressoItemPersonalizado) => Promise<void>;
  reloadRanking: () => void;
}): {
  activeStudyBlockRef: MutableRefObject<StudyBlockSnapshot | null>;
  persistElapsedStudyBlock: (snap: StudyBlockSnapshot | null) => Promise<void>;
} {
  const {
    currentStudyBlockSignature,
    registrarTempoTopico,
    registrarTempoConteudo,
    registrarTempoAtividade,
    salvarProgressoItemPersonalizado,
    reloadRanking,
  } = args;

  const activeStudyBlockRef = useRef<StudyBlockSnapshot | null>(null);

  const persistElapsedStudyBlock = useCallback(
    async (
      snapshot: StudyBlockSnapshot | null
    ) => {
      if (!snapshot) return;

      const elapsedMs = Date.now() - snapshot.startedAtMs;
      if (!Number.isFinite(elapsedMs) || elapsedMs < 1_000) {
        return;
      }

      const elapsedMin = Math.max(0.01, Number((elapsedMs / 60_000).toFixed(2)));
      if (!Number.isFinite(elapsedMin) || elapsedMin <= 0) return;

      await registrarTempoTopico(snapshot.topicoId, elapsedMin);

      if (snapshot.isPersonalizedLocal && snapshot.itemKey && snapshot.itemTitle) {
        await salvarProgressoItemPersonalizado({
          topicoId: snapshot.topicoId,
          itemKey: snapshot.itemKey,
          itemKind: snapshot.itemKind,
          itemTitle: snapshot.itemTitle,
          status: "em_andamento",
          percentualConcluido: 0,
          tempoGastoMin: elapsedMin,
          metadata: {
            source: "mobile_trilha_tempo",
            personalized: true,
          },
        });
        void reloadRanking();
        return;
      }

      if (snapshot.conteudoId != null && snapshot.conteudoId > 0) {
        await registrarTempoConteudo(snapshot.topicoId, snapshot.conteudoId, elapsedMin);
      }

      if (snapshot.atividadeId != null && snapshot.atividadeId > 0) {
        await registrarTempoAtividade(snapshot.topicoId, snapshot.atividadeId, elapsedMin);
      }

      void reloadRanking();
    },
    [
      registrarTempoTopico,
      registrarTempoAtividade,
      registrarTempoConteudo,
      reloadRanking,
      salvarProgressoItemPersonalizado,
    ]
  );

  const currentStudyBlockKey = currentStudyBlockSignature?.key ?? null;

  // Effect: manage ref based on signature changes
  useEffect(() => {
    const previous = activeStudyBlockRef.current;

    if (previous && previous.key !== currentStudyBlockKey) {
      void persistElapsedStudyBlock(previous);
      activeStudyBlockRef.current = null;
    }

    if (currentStudyBlockSignature) {
      activeStudyBlockRef.current = {
        ...currentStudyBlockSignature,
        startedAtMs:
          previous?.key === currentStudyBlockSignature.key
            ? previous.startedAtMs
            : Date.now(),
      };
      return;
    }

    activeStudyBlockRef.current = null;
  }, [currentStudyBlockKey, currentStudyBlockSignature, persistElapsedStudyBlock]);

  // Effect: periodic flush
  useEffect(() => {
    if (!currentStudyBlockKey) return;

    const intervalId = setInterval(() => {
      const snapshot = activeStudyBlockRef.current;
      if (!snapshot) return;

      const elapsedMs = Date.now() - snapshot.startedAtMs;
      if (!Number.isFinite(elapsedMs) || elapsedMs < 1_000) return;

      const flushSnapshot = { ...snapshot };
      activeStudyBlockRef.current = {
        ...snapshot,
        startedAtMs: Date.now(),
      };

      void persistElapsedStudyBlock(flushSnapshot);
    }, ACTIVE_STUDY_FLUSH_INTERVAL_MS);

    return () => {
      clearInterval(intervalId);
    };
  }, [currentStudyBlockKey, persistElapsedStudyBlock]);

  // Effect: flush on unmount
  useEffect(() => {
    return () => {
      if (activeStudyBlockRef.current) {
        void persistElapsedStudyBlock(activeStudyBlockRef.current);
        activeStudyBlockRef.current = null;
      }
    };
  }, [persistElapsedStudyBlock]);

  // Effect: flush when app goes to background/inactive
  useEffect(() => {
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "inactive" || nextState === "background") {
        const snapshot = activeStudyBlockRef.current;
        if (!snapshot) return;
        activeStudyBlockRef.current = {
          ...snapshot,
          startedAtMs: Date.now(),
        };
        void persistElapsedStudyBlock(snapshot);
      }
    });

    return () => {
      subscription.remove();
    };
  }, [persistElapsedStudyBlock]);

  return { activeStudyBlockRef, persistElapsedStudyBlock };
}
