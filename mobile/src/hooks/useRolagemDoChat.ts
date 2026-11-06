import { useCallback, useEffect, useRef } from "react";
import type { NativeScrollEvent, NativeSyntheticEvent, ScrollView } from "react-native";

import { pertoDoFim } from "@/services/social/chatRolagemModel";

/**
 * As conversas vêm do banco da mais antiga para a mais nova, então a tela precisa descer sozinha:
 * ao abrir, ao chegar mensagem e quando o teclado encolhe a janela. Quem subiu para reler fica
 * onde está, até enviar uma mensagem.
 */
export function useRolagemDoChat(aberta: boolean) {
  const lista = useRef<ScrollView>(null);
  const noFim = useRef(true);

  useEffect(() => {
    if (aberta) noFim.current = true;
  }, [aberta]);

  const acompanhar = useCallback(() => {
    if (noFim.current) lista.current?.scrollToEnd({ animated: false });
  }, []);

  const onScroll = useCallback((evento: NativeSyntheticEvent<NativeScrollEvent>) => {
    const { contentOffset, contentSize, layoutMeasurement } = evento.nativeEvent;
    noFim.current = pertoDoFim({
      topo: contentOffset.y,
      alturaDoConteudo: contentSize.height,
      alturaDaJanela: layoutMeasurement.height,
    });
  }, []);

  /** A mensagem que a pessoa acabou de mandar sempre aparece. */
  const descerAoEnviar = useCallback(() => {
    noFim.current = true;
    lista.current?.scrollToEnd({ animated: false });
  }, []);

  return {
    descerAoEnviar,
    propsDaLista: { ref: lista, onScroll, onContentSizeChange: acompanhar, onLayout: acompanhar, scrollEventThrottle: 100 },
  };
}
