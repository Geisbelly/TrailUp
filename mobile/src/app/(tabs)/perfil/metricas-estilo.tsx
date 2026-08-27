import { HallBackground } from "@/components/HallTheme";
import {
  SectionGuideButton,
  SectionGuideStep,
} from "@/components/SectionGuideButton";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";

import { useUsuario } from "@/context/SessaoContext";
import { FontFamily } from "@/styles/GlobalStyle";
import {
  METRICS_THEME_OPTIONS,
  MetricsThemeOverride,
  getMetricsThemeLabel,
  getMetricsThemePreference,
  setMetricsThemePreference,
} from "@/utils/profileMetricThemes";
import { getProfileShellPalette } from "@/utils/profileShellTheme";
import { registrarAlvoTour } from "@/utils/tourTargets";

export default function PerfilMetricasEstilo() {
  const { usuario } = useUsuario();
  const [selectedTheme, setSelectedTheme] = useState<MetricsThemeOverride>("auto");
  const headerGuideRef = useRef<View | null>(null);
  const optionsGuideRef = useRef<View | null>(null);
  const palette = useMemo(
    () => getProfileShellPalette(usuario?.perfilAtivo ?? usuario?.perfis?.[0]?.nome ?? null),
    [usuario?.perfilAtivo, usuario?.perfis]
  );
  const guideSteps = useMemo<SectionGuideStep[]>(
    () => [
      {
        id: "metrics-appearance-intro",
        target: "metrics_header",
        title: "Visualização das métricas",
        description:
          "Esta configuração altera apenas a aparência e a organização do painel. Seus valores, progresso e histórico permanecem iguais.",
        icon: "view-dashboard-outline",
      },
      {
        id: "metrics-appearance-options",
        target: "metrics_options",
        title: "Automático ou estilo fixo",
        description:
          "Automático acompanha o perfil BrainHex ativo. Escolher outro estilo fixa aquela visualização neste aparelho até você mudar novamente.",
        icon: "palette-outline",
      },
    ],
    [],
  );
  const guideTargets = useMemo(
    () => ({ metrics_header: headerGuideRef, metrics_options: optionsGuideRef }),
    [],
  );

  useEffect(
    () => registrarAlvoTour("config_metricas_visual", optionsGuideRef),
    [],
  );

  useEffect(() => {
    let mounted = true;

    const loadPreference = async () => {
      const preference = await getMetricsThemePreference(usuario?.id);
      if (mounted) {
        setSelectedTheme(preference);
      }
    };

    void loadPreference();

    return () => {
      mounted = false;
    };
  }, [usuario?.id]);

  const handleSelect = async (theme: MetricsThemeOverride) => {
    setSelectedTheme(theme);
    await setMetricsThemePreference(usuario?.id, theme);
    router.back();
  };

  return (
    <View style={[styles.outer, { backgroundColor: palette.background }]}>
      <View style={[StyleSheet.absoluteFill, { opacity: 0.35 }]} pointerEvents="none">
        <HallBackground palette={palette} />
      </View>
      <SectionGuideButton
        profile={usuario?.perfilAtivo ?? usuario?.perfis?.[0]?.nome}
        sectionTitle="Visualização das métricas"
        steps={guideSteps}
        targetRefs={guideTargets}
        style={styles.guideButton}
      />
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
    >
      <View
        ref={headerGuideRef}
        collapsable={false}
        style={[
          styles.headerCard,
          { backgroundColor: palette.surfaceElevated, borderColor: palette.border },
        ]}
      >
        <Text style={[styles.eyebrow, { color: palette.textSubtle }]}>PERSONALIZAÇÃO VISUAL</Text>
        <Text style={[styles.title, { color: palette.text }]}>
          Escolha como suas métricas aparecem
        </Text>
        <Text style={[styles.subtitle, { color: palette.textMuted }]}>
          O modo automático segue o perfil BrainHex dominante. Você pode fixar um estilo
          diferente neste aparelho.
        </Text>
        <Text style={[styles.currentLabel, { color: palette.accent }]}>
          Atual: {getMetricsThemeLabel(selectedTheme)}
        </Text>
      </View>

      <View style={styles.list}>
        {METRICS_THEME_OPTIONS.map((option, index) => {
          const active = option.key === selectedTheme;

          return (
            <View
              key={option.key}
              ref={index === 0 ? optionsGuideRef : undefined}
              collapsable={false}
            >
              <TouchableOpacity
                style={[
                  styles.optionCard,
                  {
                    backgroundColor: palette.surface,
                    borderColor: palette.border,
                  },
                  active && {
                    backgroundColor: palette.accentSoft,
                    borderColor: palette.borderStrong,
                  },
                ]}
                activeOpacity={0.86}
                onPress={() => {
                  void handleSelect(option.key);
                }}
              >
              <View
                style={[
                  styles.optionIcon,
                  { backgroundColor: palette.accentMuted },
                  active && { backgroundColor: palette.accentSoft },
                ]}
              >
                <MaterialCommunityIcons
                  name={option.icon}
                  size={20}
                  color={active ? palette.accent : palette.textMuted}
                />
              </View>

              <View style={styles.optionTextBlock}>
                <Text
                  style={[
                    styles.optionTitle,
                    { color: active ? palette.accent : palette.text },
                  ]}
                >
                  {option.label}
                </Text>
                <Text style={[styles.optionDescription, { color: palette.textMuted }]}>
                  {option.description}
                </Text>
              </View>

              <MaterialCommunityIcons
                name={active ? "check-circle" : "chevron-right"}
                size={22}
                color={active ? palette.accent : palette.textSubtle}
              />
              </TouchableOpacity>
            </View>
          );
        })}
      </View>
    </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: {
    flex: 1,
  },
  guideButton: {
    position: "absolute",
    top: 14,
    right: 18,
  },
  container: {
    flex: 1,
  },
  content: {
    padding: 20,
    paddingBottom: 32,
  },
  headerCard: {
    borderRadius: 24,
    padding: 20,
    borderWidth: 1,
    marginBottom: 18,
  },
  eyebrow: {
    fontFamily: FontFamily.interMedium,
    fontSize: 11,
    letterSpacing: 1.2,
    marginBottom: 8,
  },
  title: {
    fontFamily: FontFamily.inikaBold,
    fontSize: 22,
    marginBottom: 10,
  },
  subtitle: {
    fontFamily: FontFamily.interMedium,
    fontSize: 13,
    lineHeight: 20,
  },
  currentLabel: {
    marginTop: 12,
    fontFamily: FontFamily.inikaBold,
    fontSize: 13,
  },
  list: {
    gap: 12,
  },
  optionCard: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
  },
  optionIcon: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },
  optionTextBlock: {
    flex: 1,
    marginRight: 10,
  },
  optionTitle: {
    fontFamily: FontFamily.inikaBold,
    fontSize: 16,
    marginBottom: 4,
  },
  optionDescription: {
    fontFamily: FontFamily.interMedium,
    fontSize: 12,
    lineHeight: 18,
  },
});
