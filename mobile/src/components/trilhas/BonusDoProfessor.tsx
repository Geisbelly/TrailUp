import { MaterialCommunityIcons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { FontFamily } from "@/styles/GlobalStyle";
import type { BonusProfessor } from "@/utils/painelTopicoTrilha";
import type { ProfileShellPalette } from "@/utils/profileShellTheme";

/** O texto do selo: o conteúdo do professor é opcional, então nunca é cobrado, só celebrado. */
export function textoDoBonus(bonus: BonusProfessor): string {
  if (bonus.completo) return "Bônus conquistado: você fez todo o conteúdo do professor";
  return `Conteúdo do professor (opcional): ${bonus.feitos} de ${bonus.total}`;
}

/** Selo do bônus do conteúdo do professor (#45). O ícone `book-check` é só deste selo (ver CLAUDE.md, "um ícone, um significado"). */
export function BonusDoProfessor({ bonus, palette }: { bonus: BonusProfessor; palette: ProfileShellPalette }) {
  const cor = bonus.completo ? palette.accent : palette.textMuted;
  return (
    <View
      style={[s.selo, { borderColor: bonus.completo ? palette.accent : palette.border, backgroundColor: bonus.completo ? palette.accent + "1A" : palette.surfaceElevated }]}
      accessibilityRole="text"
      accessibilityLabel={textoDoBonus(bonus)}
    >
      <MaterialCommunityIcons name="book-check" size={16} color={cor} />
      <Text style={[s.texto, { color: bonus.completo ? palette.accent : palette.textMuted }]}>{textoDoBonus(bonus)}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  selo: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, borderRadius: 12, paddingVertical: 8, paddingHorizontal: 12 },
  texto: { flex: 1, fontFamily: FontFamily.interMedium, fontSize: 12, lineHeight: 16 },
});
