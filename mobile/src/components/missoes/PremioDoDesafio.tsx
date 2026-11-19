import { MaterialCommunityIcons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { rotuloDaRecompensa, type Recompensa } from "@/services/missoes/rastreadorDeMissoes.core";
import { FontFamily } from "@/styles/GlobalStyle";
import type { ProfileShellPalette } from "@/utils/profileShellTheme";

// Cor de estado fixa, como a do rastreador: não deriva do accent do perfil (AAA).
const SUCESSO = "#4ADE80";

type Props = {
  /** O prêmio do primeiro acerto. `null`: já estava resolvido, ou a missão não paga nada. */
  premio: Recompensa | null;
  palette: ProfileShellPalette;
};

/**
 * O fim do desafio: "Desafio resolvido" e, no primeiro acerto, o que o banco pagou. O prêmio é o
 * da missão (`recompensa_tipo` em `eventos_pontuacao`, com as moedas da turma por cima), o mesmo
 * selo do rastreador: só aparece quando o banco respondeu que acertou, nunca antes.
 */
export function PremioDoDesafio({ premio, palette }: Props) {
  const rotulo = rotuloDaRecompensa(premio);
  return (
    <View
      style={[s.caixa, { backgroundColor: palette.surfaceElevated, borderColor: SUCESSO }]}
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
    >
      <View style={s.linha}>
        <MaterialCommunityIcons name="check-circle" size={22} color={SUCESSO} />
        <Text style={[s.titulo, { color: palette.text }]} accessibilityRole="header">
          Desafio resolvido
        </Text>
      </View>
      {rotulo ? (
        <View style={s.linha} accessible accessibilityLabel={`Você ganhou ${rotulo.replace(" · ", " e ")}`}>
          <MaterialCommunityIcons name="gift-open-outline" size={18} color={palette.accent} />
          <Text style={[s.premio, { color: palette.text }]}>Você ganhou {rotulo}</Text>
        </View>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  caixa: { borderWidth: 1, borderRadius: 14, padding: 14, gap: 8 },
  linha: { flexDirection: "row", alignItems: "center", gap: 8 },
  titulo: { fontFamily: FontFamily.inikaBold, fontSize: 17 },
  premio: { fontFamily: FontFamily.interMedium, fontSize: 14, fontWeight: "700" },
});
