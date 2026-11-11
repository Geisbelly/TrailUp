import { MaterialCommunityIcons } from "@expo/vector-icons";
import React from "react";
import { ScrollView, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { FontFamily } from "@/styles/GlobalStyle";
import type { ProfileShellPalette } from "@/utils/profileShellTheme";
import { rotuloDaAbertura, tituloDoAviso, type EmBreve } from "@/utils/topicosEmBreve";

/**
 * Aviso dos tópicos que o professor ainda não liberou (rascunho ou agendado). Só a contagem e
 * quando cada um abre: o banco não manda nome nem material, então não há o que vazar daqui.
 * O ícone `lock-clock` é só deste aviso ("um ícone, um significado").
 */
export function AvisoEmBreve({
  lista,
  palette,
  style,
}: {
  lista: EmBreve[];
  palette: ProfileShellPalette;
  style?: StyleProp<ViewStyle>;
}) {
  if (lista.length === 0) return null;
  const titulo = tituloDoAviso(lista.length);
  return (
    <View
      style={[s.caixa, { backgroundColor: palette.surface, borderColor: palette.border }, style]}
      accessible
      accessibilityLabel={`${titulo}. ${lista.map((item) => rotuloDaAbertura(item.abreEm)).join(". ")}.`}
    >
      <View style={s.cabeca}>
        <MaterialCommunityIcons name="lock-clock" size={16} color={palette.accent} />
        <Text style={[s.titulo, { color: palette.text }]}>{titulo}</Text>
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.cartoes}>
        {lista.map((item, i) => (
          <View
            key={i}
            style={[s.cartao, { backgroundColor: palette.surfaceElevated, borderColor: palette.border }]}
          >
            <View style={[s.miolo, { backgroundColor: palette.progressTrack }]} />
            <Text style={[s.quando, { color: palette.textMuted }]} numberOfLines={1}>
              {rotuloDaAbertura(item.abreEm)}
            </Text>
          </View>
        ))}
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  caixa: { marginHorizontal: 16, marginTop: 8, borderWidth: 1, borderRadius: 14, paddingVertical: 10, gap: 8 },
  cabeca: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12 },
  titulo: { fontFamily: FontFamily.interMedium, fontSize: 13 },
  cartoes: { gap: 8, paddingHorizontal: 12 },
  cartao: { width: 132, borderWidth: 1, borderStyle: "dashed", borderRadius: 10, padding: 8, gap: 6 },
  // Faixa vazia no lugar do nome: é um tópico, mas o aluno ainda não sabe qual.
  miolo: { height: 8, width: "70%", borderRadius: 4 },
  quando: { fontFamily: FontFamily.interMedium, fontSize: 11 },
});
