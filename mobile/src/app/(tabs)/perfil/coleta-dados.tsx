import { HallBackground } from "@/components/HallTheme";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import React, { useMemo, useState } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { useMetricas } from "@/context/MetricasContext";
import { useUsuario } from "@/context/SessaoContext";
import { FontFamily } from "@/styles/GlobalStyle";
import { getProfileShellPalette } from "@/utils/profileShellTheme";
import { TelemetryConsentPreferences } from "@/utils/telemetryConsent";

type ToggleItem = {
  key: keyof TelemetryConsentPreferences;
  title: string;
  description: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
};

const TOGGLE_ITEMS: ToggleItem[] = [
  {
    key: "cameraEnabled",
    title: "Câmera",
    description: "Permite captura de frames para análise de atenção durante o estudo.",
    icon: "camera-outline",
  },
  {
    key: "usageEnabled",
    title: "Uso e navegação",
    description: "Coleta sessões, navegação e interações para métricas de engajamento.",
    icon: "gesture-tap",
  },
  {
    key: "performanceEnabled",
    title: "Desempenho",
    description: "Coleta tentativas, acertos e evolução em questões e atividades.",
    icon: "chart-line",
  },
  {
    key: "chatEnabled",
    title: "Chat",
    description: "Coleta abertura, mensagens e contexto de uso do mentor.",
    icon: "chat-processing-outline",
  },
];

export default function ColetaDadosScreen() {
  const { usuario } = useUsuario();
  const palette = useMemo(
    () => getProfileShellPalette(usuario?.perfis?.[0]?.nome ?? null),
    [usuario?.perfis]
  );
  const { telemetryPreferences, setTelemetryPreference, cameraPermission } = useMetricas();
  const [savingKey, setSavingKey] = useState<keyof TelemetryConsentPreferences | null>(null);

  const handleToggle = async (key: keyof TelemetryConsentPreferences) => {
    if (savingKey) return;
    setSavingKey(key);
    try {
      await setTelemetryPreference(key, !telemetryPreferences[key]);
    } finally {
      setSavingKey(null);
    }
  };

  return (
    <View style={[styles.outer, { backgroundColor: palette.background }]}>
      <View style={[StyleSheet.absoluteFill, { opacity: 0.35 }]} pointerEvents="none">
        <HallBackground palette={palette} />
      </View>
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
    >
      <Text style={[styles.title, { color: palette.text }]}>Coleta e acessos</Text>
      <Text style={[styles.subtitle, { color: palette.textMuted }]}>
        Você controla quais grupos de dados o app pode coletar. As alterações valem para este dispositivo.
      </Text>

      <View style={[styles.card, { backgroundColor: palette.surfaceElevated, borderColor: palette.border }]}>
        {TOGGLE_ITEMS.map((item) => {
          const enabled = telemetryPreferences[item.key];
          const isSaving = savingKey === item.key;
          return (
            <TouchableOpacity
              key={item.key}
              style={[styles.itemRow, { borderColor: palette.border }]}
              activeOpacity={0.85}
              onPress={() => {
                void handleToggle(item.key);
              }}
              disabled={Boolean(savingKey)}
            >
              <View style={styles.itemLeft}>
                <View
                  style={[
                    styles.iconWrap,
                    {
                      backgroundColor: enabled ? palette.accentMuted : palette.surface,
                      borderColor: palette.border,
                    },
                  ]}
                >
                  <MaterialCommunityIcons
                    name={item.icon}
                    size={18}
                    color={enabled ? palette.accent : palette.textSubtle}
                  />
                </View>
                <View style={styles.itemTextWrap}>
                  <Text style={[styles.itemTitle, { color: palette.text }]}>{item.title}</Text>
                  <Text style={[styles.itemDescription, { color: palette.textMuted }]}>
                    {item.description}
                  </Text>
                </View>
              </View>
              <View
                style={[
                  styles.stateChip,
                  {
                    backgroundColor: enabled ? palette.accent : palette.surface,
                    borderColor: palette.borderStrong,
                  },
                ]}
              >
                <Text style={[styles.stateChipText, { color: enabled ? "#fff" : palette.textMuted }]}>
                  {isSaving ? "..." : enabled ? "Ativo" : "Desativado"}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      <View style={[styles.infoBox, { backgroundColor: palette.surface, borderColor: palette.border }]}>
        <Text style={[styles.infoTitle, { color: palette.text }]}>Permissão de câmera</Text>
        <Text style={[styles.infoBody, { color: palette.textMuted }]}>
          Estado atual:{" "}
          <Text style={{ color: palette.text, fontFamily: FontFamily.inikaBold }}>
            {cameraPermission === "granted"
              ? "permitida"
              : cameraPermission === "denied"
              ? "negada"
              : cameraPermission === "unavailable"
              ? "indisponível"
              : "não definida"}
          </Text>
        </Text>
      </View>
    </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 28,
    gap: 16,
  },
  title: {
    fontSize: 24,
    fontFamily: FontFamily.inikaBold,
  },
  subtitle: {
    fontSize: 14,
    lineHeight: 21,
    fontFamily: FontFamily.interMedium,
  },
  card: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
  },
  itemRow: {
    borderBottomWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  itemLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    gap: 12,
  },
  iconWrap: {
    width: 38,
    height: 38,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  itemTextWrap: {
    flex: 1,
    gap: 2,
  },
  itemTitle: {
    fontSize: 16,
    fontFamily: FontFamily.inikaBold,
  },
  itemDescription: {
    fontSize: 12,
    lineHeight: 18,
    fontFamily: FontFamily.interMedium,
  },
  stateChip: {
    minWidth: 88,
    borderRadius: 999,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    alignItems: "center",
  },
  stateChipText: {
    fontSize: 12,
    fontFamily: FontFamily.inikaBold,
  },
  infoBox: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 14,
    gap: 6,
  },
  infoTitle: {
    fontSize: 14,
    fontFamily: FontFamily.inikaBold,
  },
  infoBody: {
    fontSize: 13,
    fontFamily: FontFamily.interMedium,
  },
});
