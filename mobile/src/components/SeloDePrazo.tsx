import React from "react";
import { StyleSheet, Text, View } from "react-native";

import {
  estadoDoPrazo,
  rotuloDoPrazo,
  urgenciaDoPrazo,
} from "@/utils/estadoDoPrazo";

/**
 * Selo com o estado do prazo da atividade (issue #177, parte 3: "o aluno nunca
 * o vê" — o valor chegava ao modelo e parava ali).
 *
 * Sem prazo, não renderiza nada: um selo "sem prazo" ocuparia espaço para dizer
 * que não há o que dizer. Hoje 248 atividades estão cadastradas e nenhuma tem
 * prazo, então o caminho mais comum é justamente esse.
 *
 * Aviso, não bloqueio. A atividade atrasada continua aberta e continua pagando
 * — decisão registrada na issue, não omissão.
 */
export function SeloDePrazo({
  dataEntrega,
  agora,
}: {
  dataEntrega: string | null | undefined;
  /** Injetável para teste; em produção é o relógio do aparelho. */
  agora?: Date;
}) {
  const estado = estadoDoPrazo(dataEntrega, agora);
  const rotulo = rotuloDoPrazo(estado);
  if (!rotulo) return null;

  const urgencia = urgenciaDoPrazo(estado);
  return (
    <View
      style={[styles.selo, styles[urgencia]]}
      accessibilityRole="text"
      accessibilityLabel={`Prazo: ${rotulo}`}
    >
      <Text style={[styles.texto, urgencia === "nenhuma" && styles.textoNeutro]}>
        {rotulo}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  selo: {
    alignSelf: "flex-start",
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginHorizontal: 16,
    marginTop: 12,
  },
  texto: { fontSize: 12, fontWeight: "600", color: "#fff" },
  textoNeutro: { color: "#C9CED6" },
  // Cores literais porque o selo aparece acima do renderer, fora do provedor de
  // tema do tópico. Seguem a mesma semântica do resto do app: vermelho para o
  // que já passou, âmbar para o que vence agora, neutro para o resto.
  critica: { backgroundColor: "#7F1D1D", borderColor: "#B91C1C" },
  atencao: { backgroundColor: "#78350F", borderColor: "#B45309" },
  nenhuma: { backgroundColor: "transparent", borderColor: "#3A4150" },
});
