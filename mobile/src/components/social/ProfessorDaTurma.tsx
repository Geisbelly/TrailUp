import { MaterialCommunityIcons } from "@expo/vector-icons";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { FontFamily } from "@/styles/GlobalStyle";

type Props = {
  professor: string;
  accent: string;
  textColor: string;
  mutedColor: string;
  onPress: () => void;
  /** Cartão com rótulo, para a aba Social; sem ele, a linha que entra no card da turma. */
  cartao?: { surface: string; border: string };
};

/** Nome do professor que abre o perfil dele. No card da turma é a linha "Prof. X". */
export function ProfessorDaTurma({ professor, accent, textColor, mutedColor, onPress, cartao }: Props) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Ver perfil de ${professor}, professor da turma`}
      onPress={onPress}
      style={[s.linha, cartao ? [s.cartao, { backgroundColor: cartao.surface, borderColor: cartao.border }] : null]}
    >
      <MaterialCommunityIcons name="school-outline" size={cartao ? 24 : 16} color={accent} />
      {cartao ? (
        <View style={s.textos}>
          <Text style={[s.rotulo, { color: mutedColor }]}>Professor da turma</Text>
          <Text numberOfLines={1} style={[s.nomeNoCartao, { color: textColor }]}>{professor}</Text>
        </View>
      ) : (
        <Text numberOfLines={1} style={[s.nome, { color: accent }]}>Prof. {professor}</Text>
      )}
      <MaterialCommunityIcons name="chevron-right" size={cartao ? 22 : 16} color={mutedColor} />
    </Pressable>
  );
}

const s = StyleSheet.create({
  linha: { flexDirection: "row", alignItems: "center", gap: 6, minHeight: 44, alignSelf: "flex-start", maxWidth: "100%" },
  cartao: { alignSelf: "stretch", gap: 12, borderWidth: 1, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10 },
  textos: { flex: 1, minWidth: 0 },
  rotulo: { fontFamily: FontFamily.interMedium, fontSize: 12 },
  nomeNoCartao: { fontFamily: FontFamily.interMedium, fontSize: 15, fontWeight: "700" },
  nome: { flexShrink: 1, fontFamily: FontFamily.interMedium, fontSize: 13, fontWeight: "700" },
});
