import { MaterialCommunityIcons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { FontFamily } from "@/styles/GlobalStyle";
import type { ProfileShellPalette } from "@/utils/profileShellTheme";

/**
 * "Atualizado pelo professor": o item mudou depois que o aluno já o tinha visto ou feito
 * (`alteracao_aluno`). O resumo é o que a IA escreveu para o aluno, sem revelar resposta.
 * A cor é a do perfil: aqui ela é identidade, não significado.
 */
export function SeloAlteracaoProfessor({
  resumo,
  revisar = false,
  palette,
}: {
  resumo: string | null;
  revisar?: boolean;
  palette: ProfileShellPalette;
}) {
  return (
    <View
      style={[styles.selo, { borderColor: palette.accent, backgroundColor: palette.accent + "1A" }]}
      accessibilityRole="text"
      accessibilityLabel={`Atualizado pelo professor.${resumo ? ` ${resumo}` : ""}`}
    >
      <MaterialCommunityIcons name="update" size={16} color={palette.accent} />
      <View style={styles.textos}>
        <Text style={[styles.titulo, { color: palette.accent }]}>
          {revisar ? "Atualizado pelo professor — refaça quando puder" : "Atualizado pelo professor"}
        </Text>
        {resumo ? <Text style={[styles.resumo, { color: palette.text }]}>{resumo}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  selo: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginBottom: 12,
  },
  textos: { flex: 1, gap: 2 },
  titulo: { fontFamily: FontFamily.interMedium, fontSize: 13 },
  resumo: { fontFamily: FontFamily.interMedium, fontSize: 13, lineHeight: 18 },
});
