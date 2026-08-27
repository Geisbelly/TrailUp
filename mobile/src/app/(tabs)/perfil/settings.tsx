import { OrnamentDivider } from "@/components/HallTheme";
import {
  SectionGuideButton,
  SectionGuideStep,
} from "@/components/SectionGuideButton";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Feather } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { router } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Linking,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

import { useDialog } from "@/context/DialogContext";
import { useUsuario } from "@/context/SessaoContext";
import { supabase } from "@/database/supabase";
import { FontFamily } from "@/styles/GlobalStyle";
import {
  getMetricsThemeLabel,
  getMetricsThemePreference,
} from "@/utils/profileMetricThemes";
import { buildFirstAccessTourStorageKey } from "@/utils/firstAccessTour";
import { getProfileShellPalette } from "@/utils/profileShellTheme";
import { registrarAlvoTour } from "@/utils/tourTargets";

const pkg = require("../../../../package.json");

type MenuItem = { label: string; render: React.ReactNode };
type MenuAction = { label: string; onPress: () => void };

export default function Settings() {
  const [busca, setBusca] = useState("");
  const [metricsThemeLabel, setMetricsThemeLabel] = useState("Automático");
  const { showDialog } = useDialog();
  const { usuario } = useUsuario();
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
    () => getProfileShellPalette(usuario?.perfilAtivo ?? usuario?.perfis?.[0]?.nome ?? null),
    [usuario?.perfilAtivo, usuario?.perfis],
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

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
    } catch (error) {
      console.error("Erro ao sair:", error);
    } finally {
      router.replace("/(auth)/login");
    }
  };

  const openLink = useCallback(
    (url: string, fallbackMsg: string) => {
      Linking.openURL(url).catch(() =>
        showDialog({
          title: "Aviso",
          description: fallbackMsg,
          tone: "warning",
        }),
      );
    },
    [showDialog],
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
            <TouchableOpacity
              style={[
                styles.menuItem,
                {
                  backgroundColor: palette.surfaceElevated,
                  borderColor: "#ffffff20",
                },
              ]}
              onPress={() => router.push("/(tabs)/perfil/info")}
            >
              <Text style={[styles.menuItemText, { color: palette.text }]}>
                Informações
              </Text>
            </TouchableOpacity>
          ),
        },
        {
          label: "Estilo das métricas",
          render: (
            <TouchableOpacity
              style={[
                styles.menuItem,
                {
                  backgroundColor: palette.surfaceElevated,
                  borderColor: "#ffffff20",
                },
              ]}
              onPress={() => router.push("/(tabs)/perfil/metricas-estilo")}
            >
              <Text style={[styles.menuItemText, { color: palette.text }]}>
                Estilo das métricas: {metricsThemeLabel}
              </Text>
            </TouchableOpacity>
          ),
        },
        {
          label: "Coleta e acessos",
          render: (
            <TouchableOpacity
              style={[
                styles.menuItem,
                {
                  backgroundColor: palette.surfaceElevated,
                  borderColor: "#ffffff20",
                },
              ]}
              onPress={() => router.push("/(tabs)/perfil/coleta-dados")}
            >
              <Text style={[styles.menuItemText, { color: palette.text }]}>
                Coleta e acessos
              </Text>
            </TouchableOpacity>
          ),
        },
        {
          label: "Solicitar exclusão da conta",
          render: (
            <TouchableOpacity
              style={[
                styles.menuItem,
                {
                  backgroundColor: palette.surfaceElevated,
                  borderColor: "#ffffff20",
                },
              ]}
              onPress={() => router.push("/(tabs)/perfil/excluir")}
            >
              <Text style={[styles.menuItemText, { color: palette.text }]}>
                Solicitar exclusão da conta
              </Text>
            </TouchableOpacity>
          ),
        },
        {
          label: "Gerar relatório dos dados",
          render: (
            <TouchableOpacity
              style={[
                styles.menuItem,
                {
                  backgroundColor: palette.surfaceElevated,
                  borderColor: "#ffffff20",
                },
              ]}
              onPress={() => router.push("/(tabs)/perfil/relatorio")}
            >
              <Text style={[styles.menuItemText, { color: palette.text }]}>
                Gerar relatório dos dados
              </Text>
            </TouchableOpacity>
          ),
        },
      ].filter((item) => textoMatches(item.label)),
    [
      metricsThemeLabel,
      palette.surfaceElevated,
      palette.text,
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

  /**
   * Apaga a marca de "tutorial concluido" deste aluno.
   *
   * A conclusao vive numa chave do AsyncStorage que inclui a versao do
   * roteiro; a alternativa seria subir `FIRST_ACCESS_TOUR_VERSION` a cada
   * teste, o que reapresentaria o tutorial para TODOS os alunos e exigiria um
   * deploy por rodada de teste.
   */
  const reverTutorial = useCallback(async () => {
    if (!usuario?.id) return;
    try {
      await AsyncStorage.removeItem(buildFirstAccessTourStorageKey(usuario.id));
      showDialog({
        title: "Tutorial reiniciado",
        description:
          "Ele aparece de novo na proxima vez que voce abrir a Trilha.",
        tone: "success",
      });
    } catch {
      showDialog({
        title: "Aviso",
        description: "Nao foi possivel reiniciar o tutorial agora.",
        tone: "warning",
      });
    }
  }, [showDialog, usuario?.id]);

  const sobreLinks: MenuItem[] = useMemo(
    () =>
      [
        {
          label: "Rever tutorial inicial",
          render: (
            <TouchableOpacity
              style={[
                styles.menuItem,
                {
                  backgroundColor: palette.surfaceElevated,
                  borderColor: "#ffffff20",
                },
              ]}
              onPress={reverTutorial}
            >
              <Text style={[styles.menuItemText, { color: palette.text }]}>
                Rever tutorial inicial
              </Text>
            </TouchableOpacity>
          ),
        },
        {
          label: "Informações do app",
          render: (
            <TouchableOpacity
              style={[
                styles.menuItem,
                {
                  backgroundColor: palette.surfaceElevated,
                  borderColor: "#ffffff20",
                },
              ]}
              onPress={() => router.push("/(tabs)/perfil/info-app")}
            >
              <Text style={[styles.menuItemText, { color: palette.text }]}>
                Informações do app
              </Text>
            </TouchableOpacity>
          ),
        },
        {
          label: "Versão",
          render: (
            <TouchableOpacity
              style={[
                styles.menuItem,
                {
                  backgroundColor: palette.surfaceElevated,
                  borderColor: "#ffffff20",
                },
              ]}
              onPress={() => router.push("/(tabs)/perfil/info-versao")}
            >
              <Text style={[styles.menuItemText, { color: palette.text }]}>
                Versão: {appVersion}
              </Text>
            </TouchableOpacity>
          ),
        },
      ].filter((item) => textoMatches(item.label)),
    [
      appVersion,
      palette.surfaceElevated,
      palette.text,
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
            <TouchableOpacity
              style={[
                styles.menuItem,
                {
                  backgroundColor: palette.surfaceElevated,
                  borderColor: "#ffffff20",
                },
              ]}
              onPress={() => router.push("/(tabs)/perfil/resetar-senha")}
            >
              <Text style={[styles.menuItemText, { color: palette.text }]}>
                Resetar senha
              </Text>
            </TouchableOpacity>
          ),
        },
      ].filter((item) => textoMatches(item.label)),
    [palette.surfaceElevated, palette.text, textoMatches],
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
        profile={usuario?.perfilAtivo ?? usuario?.perfis?.[0]?.nome}
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
            <TouchableOpacity
              key={idx}
              style={[
                styles.menuItem,
                {
                  backgroundColor: palette.surfaceElevated,
                  borderColor: "#ffffff20",
                },
              ]}
              onPress={item.onPress}
            >
              <Text style={[styles.menuItemText, { color: palette.text }]}>
                {item.label}
              </Text>
            </TouchableOpacity>
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
          >
            <Feather
              name="log-out"
              size={20}
              color="#fff"
              style={styles.searchIcon}
            />
            <Text style={[styles.buttonText, { color: "#fff" }]}>Sair</Text>
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
