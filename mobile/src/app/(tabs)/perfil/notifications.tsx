import { HallBackground } from "@/components/HallTheme";
import { Ionicons } from "@expo/vector-icons";
import React, { useMemo } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { useUsuario } from "@/context/SessaoContext";
import { FontFamily } from "@/styles/GlobalStyle";
import { getProfileShellPalette } from "@/utils/profileShellTheme";

const ITEMS = [
  { label: "Tipo", value: "Todas" },
  { label: "Modo", value: "Padrão" },
  { label: "Hibernação", value: "Desativada" },
  { label: "Lembretes", value: "Ativados" },
];

export default function Notif() {
  const { usuario } = useUsuario();
  const palette = useMemo(
    () => getProfileShellPalette(usuario?.perfis?.[0]?.nome ?? null),
    [usuario?.perfis]
  );

  return (
    <View style={[styles.outer, { backgroundColor: palette.background }]}>
      <View style={[StyleSheet.absoluteFill, { opacity: 0.35 }]} pointerEvents="none">
        <HallBackground palette={palette} />
      </View>
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <Text style={[styles.title, { color: palette.text }]}>Notificações</Text>
        <Text style={[styles.subtitle, { color: palette.textMuted }]}>
          Configure como você recebe notificações.
        </Text>
        {ITEMS.map((item, index) => (
          <View
            key={index}
            style={[styles.card, { backgroundColor: palette.surfaceElevated, borderColor: palette.border }]}
          >
            <Text style={[styles.label, { color: palette.textMuted }]}>{item.label}</Text>
            <Text style={[styles.value, { color: palette.text }]}>{item.value}</Text>
          </View>
        ))}
        <View style={[styles.infoBox, { backgroundColor: palette.surface, borderColor: palette.border }]}>
          <Ionicons name="notifications-outline" size={16} color={palette.accent} />
          <Text style={[styles.infoText, { color: palette.textMuted }]}>
            Configurações avançadas de notificação em breve.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: { flex: 1 },
  container: { flex: 1 },
  content: { padding: 20, gap: 12 },
  title: { fontFamily: FontFamily.inikaBold, fontSize: 22 },
  subtitle: { fontFamily: FontFamily.interMedium, fontSize: 14 },
  card: { borderRadius: 12, padding: 14, borderWidth: 1, gap: 4 },
  label: { fontFamily: FontFamily.interMedium, fontSize: 12, textTransform: "uppercase" },
  value: { fontFamily: FontFamily.inikaBold, fontSize: 15 },
  infoBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
  },
  infoText: { fontFamily: FontFamily.interMedium, fontSize: 13, flex: 1 },
});
