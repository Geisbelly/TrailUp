import React, { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";

import { useMovimentoReduzido } from "@/hooks/useMovimentoReduzido";

/**
 * "Respondendo...": três pontos que aparecem logo depois de o aluno enviar a pergunta e somem
 * quando a resposta chega ou falha. Sem eles, a conversa ficava parada enquanto o Guia pensava,
 * e parecia que a pergunta não tinha ido.
 *
 * Para o leitor de tela é um nó só, com região viva educada: ele anuncia "<nome> está
 * respondendo" uma vez, sem ler os pontos. Com "Reduzir movimento" ligado, os pontos ficam parados.
 */
export const DURACAO_DO_PULSO_MS = 360;

export function rotuloRespondendo(nome?: string | null): string {
  const quem = String(nome ?? "").trim() || "Guia";
  return `${quem} está respondendo`;
}

/** Liga o pulso dos pontos e devolve quem o desliga. Com movimento reduzido, só os acende. */
export function iniciarPulso(valores: Animated.Value[], reduzido: boolean): (() => void) | undefined {
  if (reduzido) {
    valores.forEach((v) => v.setValue(0.7));
    return undefined;
  }
  const pulso = (v: Animated.Value) =>
    Animated.sequence([
      Animated.timing(v, { toValue: 1, duration: DURACAO_DO_PULSO_MS, easing: Easing.ease, useNativeDriver: true }),
      Animated.timing(v, { toValue: 0.35, duration: DURACAO_DO_PULSO_MS, easing: Easing.ease, useNativeDriver: true }),
    ]);
  const animacao = Animated.loop(Animated.stagger(DURACAO_DO_PULSO_MS / 2, valores.map(pulso)));
  animacao.start();
  return () => animacao.stop();
}

export function IndicadorRespondendo({
  nome,
  cor,
  fundo,
  borda,
}: {
  nome?: string | null;
  cor: string;
  fundo: string;
  borda: string;
}) {
  const reduzido = useMovimentoReduzido();
  const valores = useRef([new Animated.Value(0.35), new Animated.Value(0.35), new Animated.Value(0.35)]).current;

  useEffect(() => iniciarPulso(valores, reduzido), [reduzido, valores]);

  return (
    <View
      accessible
      accessibilityRole="text"
      accessibilityLabel={rotuloRespondendo(nome)}
      accessibilityLiveRegion="polite"
      // Na web o react-native-web não traduz accessibilityLiveRegion em todas as versões.
      aria-live="polite"
      style={[styles.bolha, { backgroundColor: fundo, borderColor: borda }]}
    >
      {valores.map((valor, indice) => (
        <Animated.View
          key={indice}
          importantForAccessibility="no"
          style={[styles.ponto, { backgroundColor: cor, opacity: valor }]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  bolha: {
    alignSelf: "flex-start",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 18,
    borderWidth: 1,
  },
  ponto: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});
