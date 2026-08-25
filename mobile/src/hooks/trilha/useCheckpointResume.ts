import {
  Dispatch,
  MutableRefObject,
  SetStateAction,
  useEffect,
  useRef,
  useState,
} from "react";

import {
  loadTrilhaCheckpoint,
  type TrilhaCheckpointKeyParams,
} from "@/utils/trilhaCheckpoint";
import {
  resolveCheckpointPosition,
  resolveLegacyStartPosition,
  type Block,
} from "@/utils/trilhaBlocks";

export function useCheckpointResume(args: {
  blocks: Block[];
  topicoId: number | null;
  topico: any;
  checkpointParams: TrilhaCheckpointKeyParams;
  topicoJaIniciado: boolean;
  topicoConcluido: boolean;
}): {
  index: number;
  mostrarResumo: boolean;
  primeiraVez: boolean;
  activityQuestionIndices: Record<number, number>;
  setIndex: Dispatch<SetStateAction<number>>;
  setMostrarResumo: Dispatch<SetStateAction<boolean>>;
  setPrimeiraVez: Dispatch<SetStateAction<boolean>>;
  setActivityQuestionIndices: Dispatch<SetStateAction<Record<number, number>>>;
  checkpointHydratedRef: MutableRefObject<boolean>;
} {
  const {
    blocks,
    topicoId,
    topico,
    checkpointParams,
    topicoJaIniciado,
    topicoConcluido,
  } = args;

  const [index, setIndex] = useState(-1);
  const [mostrarResumo, setMostrarResumo] = useState(true);
  const [primeiraVez, setPrimeiraVez] = useState(true);
  const [activityQuestionIndices, setActivityQuestionIndices] = useState<
    Record<number, number>
  >({});
  const checkpointHydratedRef = useRef(false);

  useEffect(() => {
    if (!primeiraVez || blocks.length === 0 || !topicoId) return;

    let active = true;

    async function hydrateCheckpoint() {
      checkpointHydratedRef.current = false;
      const checkpoint = await loadTrilhaCheckpoint(checkpointParams);
      if (!active) return;

      const checkpointPosition = resolveCheckpointPosition(
        blocks,
        checkpoint?.blockKind ?? null,
        checkpoint?.blockId ?? null
      );

      if (checkpoint?.mostrarResumo) {
        setIndex(-1);
        setMostrarResumo(true);
      } else if (checkpointPosition >= 0) {
        setIndex(checkpointPosition);
        setMostrarResumo(false);

        if (
          checkpoint?.blockKind === "atividade" &&
          checkpoint.blockId != null &&
          checkpoint.questionIndex != null
        ) {
          setActivityQuestionIndices((prev) => ({
            ...prev,
            [Number(checkpoint.blockId)]: Math.max(0, checkpoint.questionIndex ?? 0),
          }));
        }
      } else if (topicoJaIniciado || topicoConcluido) {
        const posicao = resolveLegacyStartPosition(blocks, topico?.ultima_atividade ?? null);
        setIndex(posicao);
        setMostrarResumo(false);
      } else {
        setIndex(-1);
        setMostrarResumo(true);
      }

      checkpointHydratedRef.current = true;
      setPrimeiraVez(false);
    }

    void hydrateCheckpoint();

    return () => {
      active = false;
    };
  }, [blocks, checkpointParams, primeiraVez, topico?.ultima_atividade, topicoConcluido, topicoId, topicoJaIniciado]);

  return {
    index,
    mostrarResumo,
    primeiraVez,
    activityQuestionIndices,
    setIndex,
    setMostrarResumo,
    setPrimeiraVez,
    setActivityQuestionIndices,
    checkpointHydratedRef,
  };
}
