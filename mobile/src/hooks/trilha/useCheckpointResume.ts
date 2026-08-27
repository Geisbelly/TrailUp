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
  /**
   * A lista de blocos ja esta completa?
   *
   * Enquanto a personalizacao carrega, `blocks` so tem o material do professor.
   * Resolver o checkpoint contra essa lista parcial nao acha o bloco
   * personalizado onde o aluno parou, cai no fallback de inicio e -- pior --
   * marca `primeiraVez = false`, entao a hidratacao nao tenta de novo quando o
   * resto chega. E a razao de a trilha "sempre voltar pro comeco".
   */
  blocosProntos: boolean;
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
    blocosProntos,
  } = args;

  const [index, setIndex] = useState(-1);
  const [mostrarResumo, setMostrarResumo] = useState(true);
  const [primeiraVez, setPrimeiraVez] = useState(true);
  const [activityQuestionIndices, setActivityQuestionIndices] = useState<
    Record<number, number>
  >({});
  const checkpointHydratedRef = useRef(false);

  useEffect(() => {
    if (!primeiraVez || !blocosProntos || blocks.length === 0 || !topicoId) {
      if (__DEV__ && primeiraVez && topicoId) {
        console.log(
          "[Checkpoint] hidratacao adiada",
          JSON.stringify({ blocosProntos, blocks: blocks.length, topicoId })
        );
      }
      return;
    }

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

      if (__DEV__) {
        console.log(
          "[Checkpoint] hidratando",
          JSON.stringify({
            topicoId,
            gravado: checkpoint
              ? {
                  mostrarResumo: checkpoint.mostrarResumo,
                  blockKind: checkpoint.blockKind,
                  blockId: checkpoint.blockId,
                }
              : null,
            posicaoResolvida: checkpointPosition,
            blocos: blocks.map((bloco) =>
              bloco.kind === "conteudo"
                ? `c:${Number(bloco.conteudo.id)}`
                : `a:${Number(bloco.atividade.id)}`
            ),
            topicoJaIniciado,
            topicoConcluido,
          })
        );
      }

      if (checkpoint?.mostrarResumo) {
        decisao("gravado pedia resumo -> tela inicial");
        setIndex(-1);
        setMostrarResumo(true);
      } else if (checkpointPosition >= 0) {
        decisao(`retomando no bloco ${checkpointPosition}`);
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
        decisao("sem checkpoint utilizavel -> posicao legada");
        const posicao = resolveLegacyStartPosition(blocks, topico?.ultima_atividade ?? null);
        setIndex(posicao);
        setMostrarResumo(false);
      } else {
        decisao("nada gravado e topico nao iniciado -> tela inicial");
        setIndex(-1);
        setMostrarResumo(true);
      }

      checkpointHydratedRef.current = true;
      setPrimeiraVez(false);
    }

    function decisao(qual: string) {
      if (__DEV__) console.log("[Checkpoint] decisao", qual);
    }

    void hydrateCheckpoint();

    return () => {
      active = false;
    };
  }, [
    blocks,
    blocosProntos,
    checkpointParams,
    primeiraVez,
    topico?.ultima_atividade,
    topicoConcluido,
    topicoId,
    topicoJaIniciado,
  ]);

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
