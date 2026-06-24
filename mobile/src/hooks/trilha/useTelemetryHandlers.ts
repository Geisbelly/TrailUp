import {
  Dimensions,
  GestureResponderEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
} from "react-native";
import { Dispatch, SetStateAction, useCallback } from "react";

import { IATimerTimeoutAction } from "@/interfaces/personalizacao/IAContracts";
import {
  ScrollTelemetryMetrics,
  TelemetryTouchTarget,
} from "@/interfaces/telemetria/TelemetryContracts";
import type { Block } from "@/utils/trilhaBlocks";

type ShowDialog = (opts: {
  title: string;
  description?: string;
  tone?: "info" | "success" | "warning" | "error";
  dismissible?: boolean;
}) => void;

export function useTelemetryHandlers(args: {
  atualBlock: Block | null;
  atividadeAtualResolvida: boolean;
  topicoConcluido: boolean;
  recordTouchSample: (sample: {
    x_pct: number;
    y_pct: number;
    target?: TelemetryTouchTarget;
  }) => void;
  recordScroll: (metrics: ScrollTelemetryMetrics) => void;
  setActivityTimeoutMap: Dispatch<SetStateAction<Record<number, boolean>>>;
  showDialog: ShowDialog;
}) {
  const {
    atualBlock,
    atividadeAtualResolvida,
    topicoConcluido,
    recordTouchSample,
    recordScroll,
    setActivityTimeoutMap,
    showDialog,
  } = args;

  const handleTelemetryTouch = useCallback(
    (event: GestureResponderEvent) => {
      const { width, height } = Dimensions.get("window");
      const target =
        atualBlock?.kind === "atividade"
          ? "activity"
          : atualBlock?.kind === "conteudo"
          ? "content"
          : "screen";

      recordTouchSample({
        x_pct: width > 0 ? event.nativeEvent.pageX / width : 0,
        y_pct: height > 0 ? event.nativeEvent.pageY / height : 0,
        target,
      });
    },
    [atualBlock?.kind, recordTouchSample]
  );

  const handleTelemetryScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      recordScroll({ y: event.nativeEvent.contentOffset.y });
    },
    [recordScroll]
  );

  const handleOverlayTimerTimeout = useCallback(
    (action: IATimerTimeoutAction | null) => {
      if (
        atualBlock?.kind === "atividade" &&
        !atividadeAtualResolvida &&
        !topicoConcluido
      ) {
        setActivityTimeoutMap((prev) => ({
          ...prev,
          [Number(atualBlock.atividade.id)]: true,
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
        action === "pause"
          ? "O temporizador sugeriu uma pausa curta antes de seguir."
          : action === "suggest_break"
          ? "Seu ritmo caiu. Vale fazer uma pausa breve e voltar com mais foco."
          : atualBlock?.kind === "atividade"
          ? "O tempo desta atividade terminou. Você ainda pode concluir a resposta, mas a pontuação final recebe penalidade de 20%."
          : "O tempo terminou. Revise com calma e siga para a proxima acao.";

      showDialog({
        title: titulo,
        description: descricao,
        tone: action === "suggest_break" ? "warning" : "info",
      });
    },
    [atividadeAtualResolvida, atualBlock, setActivityTimeoutMap, showDialog, topicoConcluido]
  );

  return { handleTelemetryTouch, handleTelemetryScroll, handleOverlayTimerTimeout };
}
