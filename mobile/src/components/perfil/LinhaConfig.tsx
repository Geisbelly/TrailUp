import { Feather } from "@expo/vector-icons";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { FontFamily } from "@/styles/GlobalStyle";
import type { ProfileShellPalette } from "@/utils/profileShellTheme";

/** Vermelho de ação destrutiva, o mesmo do "Sair" do Perfil (significado, não identidade). */
const PERIGO = "#f87171";

/**
 * Linha das Configurações no celular (mobile-v1, `11-configuracoes.html`, `.linha`):
 * 56px, ícone numa pílula no accent, título e seta. Sem cartão próprio: o grupo
 * (`GrupoConfig`, em settings.tsx) desenha o cartão e os filetes. `perigo` pinta de vermelho
 * (exclusão da conta); `externo` troca a seta pelo ícone de link de fora do app.
 */
export function LinhaConfig({
  icone,
  onPress,
  palette,
  children,
  perigo = false,
  externo = false,
}: {
  icone: keyof typeof Feather.glyphMap;
  onPress: () => void;
  palette: ProfileShellPalette;
  children: React.ReactNode;
  perigo?: boolean;
  externo?: boolean;
}) {
  const cor = perigo ? PERIGO : palette.accent;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole={externo ? "link" : "button"}
      style={({ pressed }) => [s.linha, { opacity: pressed ? 0.75 : 1 }]}
    >
      <View style={[s.icone, { backgroundColor: perigo ? "rgba(248,113,113,0.14)" : palette.accentMuted }]}>
        <Feather name={icone} size={17} color={cor} />
      </View>
      <Text style={[s.texto, { color: perigo ? PERIGO : palette.text }]}>{children}</Text>
      <Feather name={externo ? "external-link" : "chevron-right"} size={16} color={palette.textSubtle} />
    </Pressable>
  );
}

const s = StyleSheet.create({
  linha: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 14,
  },
  icone: { width: 32, height: 32, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  texto: { flex: 1, fontFamily: FontFamily.interMedium, fontSize: 15, fontWeight: "600", paddingVertical: 14 },
});
