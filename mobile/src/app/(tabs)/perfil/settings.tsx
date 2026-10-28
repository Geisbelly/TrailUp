import { OrnamentDivider } from "@/components/HallTheme";
import {
  SectionGuideButton,
  SectionGuideStep,
} from "@/components/SectionGuideButton";
import { Feather } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { router } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { LinhaConfig } from "@/components/perfil/LinhaConfig";
import { ConfiguracoesDesktop } from "@/components/web/ConfiguracoesDesktop";
import { useUsuario } from "@/context/SessaoContext";
import { useAcoesConta } from "@/hooks/useAcoesConta";
import { useDesktopWeb } from "@/hooks/useDesktopWeb";
import { FontFamily } from "@/styles/GlobalStyle";
import {
  getMetricsThemeLabel,
  getMetricsThemePreference,
} from "@/utils/profileMetricThemes";
import { getProfileShellPalette } from "@/utils/profileShellTheme";
import { registrarAlvoTour } from "@/utils/tourTargets";
import { perfilVisualDoAluno } from "@/utils/brainHex";

const pkg = require("../../../../package.json");

type MenuItem = { label: string; render: React.ReactNode };
type MenuAction = { label: string; onPress: () => void };

export default function Settings() {
  const desktop = useDesktopWeb();
  return desktop ? <ConfiguracoesDesktop /> : <SettingsLista />;
}

function SettingsLista() {
  const [busca, setBusca] = useState("");
  const [metricsThemeLabel, setMetricsThemeLabel] = useState("Automático");
  const { usuario } = useUsuario();
  const { sairDoAparelho: handleLogout, abrirLink: openLink, reverTutorial } = useAcoesConta();
  const settingsListGuideRef = useRef<View | null>(null);
  const settingsScrollRef = useRef<ScrollView | null>(null);
  const settingsScrollOffsetRef = useRef(0);
  const legalGuideRef = useRef<View | null>(null);
  const aboutGuideRef = useRef<View | null>(null);
  const securityGuideRef = useRef<View | null>(null);
  useEffect(
    () =>
      registrarAlvoTour("config_lista", settingsListGuideRef, () => {
        settingsScrollRef.current?.scrollTo({ y: 0, animated: false });
      }),
    [],
  );
  const palette = useMemo(
    () => getProfileShellPalette(perfilVisualDoAluno(usuario)),
    [usuario],
  );

  useFocusEffect(
    useCallback(() => {
      let mounted = true;

      const loadTheme = async () => {
        const theme = await getMetricsThemePreference(usuario?.id);
        if (mounted) {
          setMetricsThemeLabel(getMetricsThemeLabel(theme));
        }
      };

      void loadTheme();

      return () => {
        mounted = false;
      };
    }, [usuario?.id]),
  );

  const appVersion = pkg?.version ?? "-";
  const textoMatches = useCallback(
    (label: string) => label.toLowerCase().includes(busca.trim().toLowerCase()),
    [busca],
  );

  const contaLinks: MenuItem[] = useMemo(
    () =>
      [
        {
          label: "Informações",
          render: (
            <LinhaConfig icone="user" onPress={() => router.push("/(tabs)/perfil/info")} palette={palette}>
              Informações
            </LinhaConfig>
          ),
        },
        {
          label: "Estilo das métricas",
          render: (
            <LinhaConfig icone="bar-chart-2" onPress={() => router.push("/(tabs)/perfil/metricas-estilo")} palette={palette}>
              Estilo das métricas: {metricsThemeLabel}
            </LinhaConfig>
          ),
        },
        {
          label: "Lembrete diário",
          render: (
            <LinhaConfig icone="bell" onPress={() => router.push("/(tabs)/perfil/lembrete-diario")} palette={palette}>
              Lembrete diário
            </LinhaConfig>
          ),
        },
        {
          label: "Coleta e acessos",
          render: (
            <LinhaConfig icone="camera" onPress={() => router.push("/(tabs)/perfil/coleta-dados")} palette={palette}>
              Coleta e acessos
            </LinhaConfig>
          ),
        },
        {
          label: "Solicitar exclusão da conta",
          render: (
            <LinhaConfig icone="trash-2" perigo onPress={() => router.push("/(tabs)/perfil/excluir")} palette={palette}>
              Solicitar exclusão da conta
            </LinhaConfig>
          ),
        },
        {
          label: "Gerar relatório dos dados",
          render: (
            <LinhaConfig icone="file-text" onPress={() => router.push("/(tabs)/perfil/relatorio")} palette={palette}>
              Gerar relatório dos dados
            </LinhaConfig>
          ),
        },
      ].filter((item) => textoMatches(item.label)),
    [
      metricsThemeLabel,
      palette,
      textoMatches,
    ],
  );

  const legalLinks: MenuAction[] = useMemo(
    () =>
      [
        {
          label: "Política de privacidade",
          onPress: () =>
            openLink(
              "https://trailup.vercel.app/privacidade",
              "Não foi possível abrir a política de privacidade.",
            ),
        },
        {
          label: "Termos de uso",
          onPress: () =>
            openLink(
              "https://trailup.vercel.app/termos",
              "Não foi possível abrir os termos de uso.",
            ),
        },
      ].filter((item) => textoMatches(item.label)),
    [openLink, textoMatches],
  );

  const sobreLinks: MenuItem[] = useMemo(
    () =>
      [
        {
          label: "Rever tutorial inicial",
          render: (
            <LinhaConfig icone="compass" onPress={reverTutorial} palette={palette}>
              Rever tutorial inicial
            </LinhaConfig>
          ),
        },
        {
          label: "Informações do app",
          render: (
            <LinhaConfig icone="info" onPress={() => router.push("/(tabs)/perfil/info-app")} palette={palette}>
              Informações do app
            </LinhaConfig>
          ),
        },
        {
          label: "Versão",
          render: (
            <LinhaConfig icone="tag" onPress={() => router.push("/(tabs)/perfil/info-versao")} palette={palette}>
              Versão: {appVersion}
            </LinhaConfig>
          ),
        },
      ].filter((item) => textoMatches(item.label)),
    [
      appVersion,
      palette,
      reverTutorial,
      textoMatches,
    ],
  );

  const segurancaLinks: MenuItem[] = useMemo(
    () =>
      [
        {
          label: "Resetar senha",
          render: (
            <LinhaConfig icone="lock" onPress={() => router.push("/(tabs)/perfil/resetar-senha")} palette={palette}>
              Resetar senha
            </LinhaConfig>
          ),
        },
      ].filter((item) => textoMatches(item.label)),
    [palette, textoMatches],
  );
  const settingsGuideSteps = useMemo<SectionGuideStep[]>(
    () => [
      {
        id: "settings-account",
        target: "settings_account",
        title: "Conta, métricas e coleta",
        description:
          "Sua conta reúne informações pessoais, a visualização das métricas, os controles de câmera, uso, desempenho e chat, além da exclusão e do relatório dos dados.",
        icon: "account-cog-outline",
      },
      {
        id: "settings-legal",
        target: "settings_legal",
        title: "Privacidade e termos",
        description:
          "Consulte aqui a política de privacidade e os termos que explicam o tratamento dos dados e as condições de uso da plataforma.",
        icon: "shield-account-outline",
      },
      {
        id: "settings-about",
        target: "settings_about",
        title: "Tutorial e informações do app",
        description:
          "Você pode reiniciar este tutorial, consultar informações do aplicativo e verificar a versão instalada.",
        icon: "information-outline",
      },
      {
        id: "settings-security",
        target: "settings_security",
        title: "Segurança",
        description:
          "A área de segurança permite redefinir sua senha. O botão Sair encerra somente a sessão atual.",
        icon: "lock-reset",
      },
    ],
    [],
  );
  const settingsGuideTargets = useMemo(
    () => ({
      settings_account: settingsListGuideRef,
      settings_legal: legalGuideRef,
      settings_about: aboutGuideRef,
      settings_security: securityGuideRef,
    }),
    [],
  );

  return (
    <View
      style={[styles.outerWrapper, { backgroundColor: palette.background }]}
    >
      <SectionGuideButton
        profile={perfilVisualDoAluno(usuario)}
        sectionTitle="Configurações"
        steps={settingsGuideSteps}
        targetRefs={settingsGuideTargets}
        scrollRef={settingsScrollRef}
        scrollOffsetRef={settingsScrollOffsetRef}
        style={styles.guideButton}
      />
      <ScrollView
        ref={settingsScrollRef}
        style={styles.container}
        contentContainerStyle={styles.content}
        onScroll={(event) => {
          settingsScrollOffsetRef.current = event.nativeEvent.contentOffset.y;
        }}
        scrollEventThrottle={16}
      >
        <View ref={settingsListGuideRef} collapsable={false}>
          <View
          style={[
            styles.searchContainer,
            {
              backgroundColor: palette.surfaceElevated,
              borderColor: "#ffffff25",
            },
          ]}
          >
          <Feather
            name="search"
            size={20}
            color={palette.textMuted}
            style={styles.searchIcon}
          />
          <TextInput
            placeholder="Pesquisar"
            placeholderTextColor={palette.textSubtle}
            style={[styles.searchInput, { color: palette.text }]}
            value={busca}
            onChangeText={setBusca}
          />
          </View>

          <View style={styles.sectionContainer}>
            <Text style={[styles.sectionTitle, { color: palette.textMuted }]}>
              Sua conta
            </Text>
            {contaLinks.map((item, idx) => (
              <View key={idx}>{item.render}</View>
            ))}
          </View>
        </View>

        <View style={styles.ornamentRow}>
          <OrnamentDivider color={"#fff"} />
        </View>

        <View ref={legalGuideRef} collapsable={false} style={styles.sectionContainer}>
          <Text style={[styles.sectionTitle, { color: palette.textMuted }]}>
            Legal
          </Text>
          {legalLinks.map((item, idx) => (
            <LinhaConfig key={idx} icone="shield" externo onPress={item.onPress} palette={palette}>
              {item.label}
            </LinhaConfig>
          ))}
        </View>

        <View style={styles.ornamentRow}>
          <OrnamentDivider color={"#fff"} />
        </View>

        <View ref={aboutGuideRef} collapsable={false} style={styles.sectionContainer}>
          <Text style={[styles.sectionTitle, { color: palette.textMuted }]}>
            Sobre
          </Text>
          {sobreLinks.map((item, idx) => (
            <View key={idx}>{item.render}</View>
          ))}
        </View>

        <View style={styles.ornamentRow}>
          <OrnamentDivider color={"#fff"} />
        </View>

        <View ref={securityGuideRef} collapsable={false} style={styles.sectionContainer}>
          <Text style={[styles.sectionTitle, { color: palette.textMuted }]}>
            Segurança
          </Text>
          {segurancaLinks.map((item, idx) => (
            <View key={idx}>{item.render}</View>
          ))}
        </View>

        <View style={styles.footer}>
          <TouchableOpacity
            style={[
              styles.button,
              {
                backgroundColor: palette.accent,
                borderColor: palette.borderStrong,
              },
            ]}
            onPress={handleLogout}
            accessibilityRole="button"
          >
            <Feather
              name="log-out"
              size={20}
              color={palette.background}
              style={styles.searchIcon}
            />
            <Text style={[styles.buttonText, { color: palette.background }]}>Sair</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  outerWrapper: {
    flex: 1,
  },
  guideButton: {
    position: "absolute",
    top: 14,
    right: 18,
  },
  container: {
    flex: 1,
    paddingHorizontal: 20,
  },
  ornamentRow: {
    opacity: 0.65,
    marginVertical: 4,
  },
  content: {
    // O botão de ajuda é absoluto (top 14 + 44 de altura); sem este respiro ele cobre a ponta do campo de busca.
    paddingTop: 44,
    paddingBottom: 32,
    gap: 16,
  },
  sectionContainer: {
    marginTop: 10,
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 15,
    marginTop: 20,
  },
  searchIcon: {
    marginRight: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    paddingVertical: 12,
    fontFamily: FontFamily.interMedium,
  },
  sectionTitle: {
    fontSize: 14,
    fontFamily: FontFamily.inikaBold,
    textTransform: "uppercase",
    marginBottom: 15,
  },
  menuItem: {
    minHeight: 56,
    justifyContent: "center",
    marginBottom: 10,
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 16,
  },
  menuItemText: {
    fontSize: 17,
    paddingVertical: 14,
    fontFamily: FontFamily.interMedium,
  },
  divider: {
    height: 1,
    marginVertical: 20,
  },
  footer: {
    marginTop: 16,
    paddingVertical: 12,
  },
  button: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  buttonText: {
    fontSize: 17,
    fontFamily: FontFamily.inikaBold,
  },
});
