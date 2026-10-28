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

/** Um grupo da lista: título em maiúsculas e as linhas num cartão só, separadas por filete. Some se não sobrar linha. */
function GrupoConfig({ titulo, itens, palette }: { titulo: string; itens: React.ReactNode[]; palette: ReturnType<typeof getProfileShellPalette> }) {
  const linhas = itens.filter(Boolean);
  if (linhas.length === 0) return null;
  return (
    <View>
      <Text accessibilityRole="header" style={[styles.grupoTitulo, { color: palette.textSubtle }]}>
        {titulo.toUpperCase()}
      </Text>
      <View style={[styles.grupoCartao, { backgroundColor: palette.surface, borderColor: palette.border }]}>
        {linhas.map((linha, i) => (
          <View key={i} style={i > 0 ? { borderTopWidth: 1, borderTopColor: palette.border } : null}>
            {linha}
          </View>
        ))}
      </View>
    </View>
  );
}

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
  const ligacao = (rotulo: string): React.ReactNode =>
    [...contaLinks, ...sobreLinks, ...segurancaLinks].find((item) => item.label === rotulo)?.render ?? null;

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
              { backgroundColor: palette.surface, borderColor: palette.border },
            ]}
          >
            <Feather name="search" size={17} color={palette.textSubtle} style={styles.searchIcon} />
            <TextInput
              placeholder="Pesquisar"
              placeholderTextColor={palette.textSubtle}
              style={[styles.searchInput, { color: palette.text }]}
              value={busca}
              onChangeText={setBusca}
              accessibilityLabel="Pesquisar nas configurações"
            />
          </View>
        </View>

        {/* Quatro grupos, um cartão cada (mobile-v1, 11-configuracoes.html, GRUPOS). */}
        <GrupoConfig titulo="Conta" palette={palette} itens={[ligacao("Informações"), <View key="senha" ref={securityGuideRef} collapsable={false}>{ligacao("Resetar senha")}</View>]} />
        <View ref={legalGuideRef} collapsable={false}>
          <GrupoConfig
            titulo="Privacidade e termos"
            palette={palette}
            itens={[
              ligacao("Coleta e acessos"),
              ligacao("Gerar relatório dos dados"),
              ...legalLinks.map((item) => (
                <LinhaConfig key={item.label} icone="shield" externo onPress={item.onPress} palette={palette}>
                  {item.label}
                </LinhaConfig>
              )),
              ligacao("Solicitar exclusão da conta"),
            ]}
          />
        </View>
        <GrupoConfig titulo="Preferências" palette={palette} itens={[ligacao("Lembrete diário"), ligacao("Estilo das métricas")]} />
        <View ref={aboutGuideRef} collapsable={false}>
          <GrupoConfig
            titulo="Tutorial e informações do app"
            palette={palette}
            itens={[ligacao("Rever tutorial inicial"), ligacao("Informações do app"), ligacao("Versão")]}
          />
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
  grupoTitulo: { fontFamily: FontFamily.interMedium, fontSize: 11.5, fontWeight: "800", letterSpacing: 1.2, marginTop: 18, marginBottom: 6, marginHorizontal: 6 },
  grupoCartao: { borderRadius: 14, borderWidth: 1, overflow: "hidden" },
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
  content: {
    // O botão de ajuda é absoluto (top 14 + 44 de altura); sem este respiro ele cobre a ponta do campo de busca.
    paddingTop: 44,
    paddingBottom: 32,
    gap: 16,
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    height: 46,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 4,
    marginBottom: 6,
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
