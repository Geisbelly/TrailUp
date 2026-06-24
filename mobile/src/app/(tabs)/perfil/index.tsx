import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import {
  Dimensions,
  Image,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import tinycolor from "tinycolor2";

import CardSemDados from "@/components/CardSemDados";
import ConquistaModal from "@/components/ConquistaModal";
import { HallBackground, OrnamentDivider } from "@/components/HallTheme";
import { ProfileMetricsViews } from "@/components/perfil/ProfileMetricsViews";
import { buildProfileMetricsViewModel } from "@/components/perfil/profileMetricsViewModel";
import {
  BrainHexProfile,
  avatarImages,
  bannerImages,
  getBrainHexConfig,
  normalizeBrainHexProfile,
  pickBySeed,
} from "@/constants/profileImages";
import { useConquistaRank } from "@/context/ConquistaRankContext";
import { useIA } from "@/context/IAContext";
import { useMetricas, useMetricasBatch } from "@/context/MetricasContext";
import { useUsuario } from "@/context/SessaoContext";
import { useTrilha } from "@/context/TrilhaContext";
import { Conquista } from "@/models/Conquista";
import { Color, FontFamily } from "@/styles/GlobalStyle";
import {
  getMetricsThemePreference,
  resolveMetricsTheme,
} from "@/utils/profileMetricThemes";
import { getProfileShellPalette } from "@/utils/profileShellTheme";

const { width } = Dimensions.get("window");

export default function PerfilHome() {
  const { usuario } = useUsuario();
  const { classeAtual } = useTrilha();
  const { conquistas, carregando, eventos, posicoesDoAluno } =
    useConquistaRank();
  const { lastAnalysis, cameraOptIn, cameraPermission } = useMetricas();
  const { lastBatchTimeMetrics } = useMetricasBatch();
  const { getBattleState } = useIA();
  const router = useRouter();

  const [aba, setAba] = useState<"metricas" | "conquistas">("metricas");
  const [conquistaSelecionada, setConquistaSelecionada] =
    useState<Conquista | null>(null);
  const [themeOverride, setThemeOverride] = useState<
    "auto" | "arena" | "goals" | "mystery" | "analytics" | "squad"
  >("auto");

  useFocusEffect(
    useCallback(() => {
      let mounted = true;

      const loadTheme = async () => {
        const preference = await getMetricsThemePreference(usuario?.id);
        if (mounted) {
          setThemeOverride(preference);
        }
      };

      void loadTheme();

      return () => {
        mounted = false;
      };
    }, [usuario?.id]),
  );

  const battleState = useMemo(() => {
    for (const topico of classeAtual?.topicos ?? []) {
      const state = getBattleState({ scope: "topic", topicoId: topico.id });
      if (state) return state;
    }
    return null;
  }, [classeAtual, getBattleState]);

  const banner = useMemo(
    () => pickBySeed(usuario?.id, bannerImages),
    [usuario?.id],
  );
  const avatar = useMemo(
    () => pickBySeed(usuario?.id, avatarImages),
    [usuario?.id],
  );

  const perfil = (normalizeBrainHexProfile(usuario?.perfis?.[0]?.nome) ??
    "mastermind") as BrainHexProfile;
  const hexConfig = getBrainHexConfig(perfil);
  const shellPalette = useMemo(() => getProfileShellPalette(perfil), [perfil]);
  const accent = tinycolor(hexConfig.color).lighten(3).toString();
  const accentSoft = tinycolor(hexConfig.color)
    .lighten(18)
    .setAlpha(0.18)
    .toRgbString();
  const resolvedTheme = resolveMetricsTheme(perfil, themeOverride);

  const metricsViewModel = useMemo(
    () =>
      buildProfileMetricsViewModel({
        classeAtual,
        conquistas,
        eventos,
        posicoesDoAluno,
        perfis: usuario?.perfis ?? [],
        lastAnalysis,
        lastBatchTimeMetrics,
        cameraOptIn,
        cameraPermission,
        battleState,
      }),
    [
      battleState,
      cameraOptIn,
      cameraPermission,
      classeAtual,
      conquistas,
      eventos,
      lastAnalysis,
      lastBatchTimeMetrics,
      posicoesDoAluno,
      usuario?.perfis,
    ],
  );

  const username = usuario?.apelido
    ? `@${usuario.apelido.toUpperCase()}`
    : "@USUARIO";

  return (
    <>
      <StatusBar
        barStyle="light-content"
        translucent
        backgroundColor="transparent"
      />
      <View
        style={[styles.screen, { backgroundColor: shellPalette.background }]}
      >
        {/* ── Fundo do salão (sutil) ── */}
        <View
          style={[StyleSheet.absoluteFill, { opacity: 0.45 }]}
          pointerEvents="none"
        >
          <HallBackground palette={shellPalette} />
        </View>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
        >
          <View style={styles.headerContainer}>
            <View style={styles.bannerWrapper}>
              {usuario?.banner_url ? (
                <Image
                  source={{ uri: usuario.banner_url }}
                  style={styles.banner}
                  resizeMode="cover"
                />
              ) : (
                <Image
                  source={banner}
                  style={styles.banner}
                  resizeMode="cover"
                />
              )}
              <LinearGradient
                colors={["rgba(0,0,0,0.34)", "transparent"]}
                style={StyleSheet.absoluteFill}
              />
            </View>

            <TouchableOpacity
              style={[
                styles.btnSettings,
                {
                  backgroundColor: shellPalette.surfaceElevated,
                  borderColor: shellPalette.border,
                },
              ]}
              onPress={() => router.push("/(tabs)/perfil/settings")}
            >
              <MaterialCommunityIcons
                name="cog-outline"
                size={22}
                color={shellPalette.text}
              />
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.btnLibrary,
                {
                  backgroundColor: shellPalette.surfaceElevated,
                  borderColor: shellPalette.border,
                },
              ]}
              onPress={() => router.push("/(tabs)/perfil/biblioteca-conquistas")}
            >
              <MaterialCommunityIcons
                name="trophy-variant-outline"
                size={20}
                color={shellPalette.text}
              />
            </TouchableOpacity>

            <View
              style={[
                styles.profileCard,
                {
                  backgroundColor: shellPalette.surfaceElevated,
                  borderColor: shellPalette.border,
                },
              ]}
            >
              <View style={styles.avatarContainer}>
                {usuario?.foto_url ? (
                  <Image
                    source={{ uri: usuario.foto_url }}
                    style={[styles.avatar, { borderColor: accent }]}
                  />
                ) : (
                  <Image
                    source={avatar}
                    style={[styles.avatar, { borderColor: accent }]}
                  />
                )}
                <View style={styles.hexBadgeContainer}>
                  <View
                    style={[
                      styles.hexBadgeShape,
                      { backgroundColor: hexConfig.color },
                    ]}
                  />
                  <MaterialCommunityIcons
                    name={hexConfig.icon}
                    size={14}
                    color="#FFF"
                    style={{ zIndex: 2 }}
                  />
                </View>
              </View>

              <View style={styles.infoContainer}>
                <Text style={[styles.username, { color: accent }]}>
                  {username}
                </Text>
                <Text style={[styles.name, { color: shellPalette.text }]}>
                  {usuario?.nome ?? "Aluno"}
                </Text>
                <View
                  style={[
                    styles.tagProfile,
                    {
                      borderColor: hexConfig.color,
                      backgroundColor: accentSoft,
                    },
                  ]}
                >
                  <Text
                    style={[styles.tagProfileText, { color: hexConfig.color }]}
                  >
                    {hexConfig.label.toUpperCase()}
                  </Text>
                </View>
                {usuario?.descricao ? (
                  <Text
                    style={[styles.desc, { color: shellPalette.textMuted }]}
                  >
                    {usuario.descricao}
                  </Text>
                ) : null}
              </View>
            </View>
          </View>

          <View
            style={[
              styles.tabsContainer,
              { borderBottomColor: shellPalette.border },
            ]}
          >
            <TouchableOpacity
              onPress={() => setAba("metricas")}
              style={styles.tabButton}
            >
              <Text
                style={[
                  styles.tabText,
                  {
                    color:
                      aba === "metricas"
                        ? shellPalette.text
                        : shellPalette.textSubtle,
                  },
                ]}
              >
                Métricas
              </Text>
              {aba === "metricas" ? (
                <View
                  style={[
                    styles.tabIndicator,
                    { backgroundColor: shellPalette.accent },
                  ]}
                />
              ) : null}
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setAba("conquistas")}
              style={styles.tabButton}
            >
              <Text
                style={[
                  styles.tabText,
                  {
                    color:
                      aba === "conquistas"
                        ? shellPalette.text
                        : shellPalette.textSubtle,
                  },
                ]}
              >
                Conquistas
              </Text>
              {aba === "conquistas" ? (
                <View
                  style={[
                    styles.tabIndicator,
                    { backgroundColor: shellPalette.accent },
                  ]}
                />
              ) : null}
            </TouchableOpacity>
          </View>

          {/* Ornamento divisor entre abas e conteúdo */}
          <View style={[styles.ornamentRow, { paddingHorizontal: 20 }]}>
            <OrnamentDivider color={Color.colorWhite} />
          </View>

          <View style={styles.listContainer}>
            {aba === "conquistas" ? (
              <>
                {carregando ? (
                  <Text
                    style={[
                      styles.helperText,
                      { color: shellPalette.textMuted },
                    ]}
                  >
                    Carregando conquistas...
                  </Text>
                ) : conquistas.length === 0 ? (
                  <View style={styles.emptyWrap}>
                    <CardSemDados
                      title="Sem conquistas"
                      description="Você ainda não ganhou emblemas."
                    />
                  </View>
                ) : (
                  conquistas.map((conquista, idx) => (
                    <TouchableOpacity
                      key={`${conquista.conquista_id ?? idx}`}
                      style={[
                        styles.conquistaItem,
                        { borderBottomColor: shellPalette.border },
                      ]}
                      activeOpacity={0.7}
                      onPress={() => setConquistaSelecionada(conquista)}
                    >
                      <View
                        style={[
                          styles.conquistaIconContainer,
                          { borderColor: shellPalette.borderStrong },
                        ]}
                      >
                        <LinearGradient
                          colors={[accent, hexConfig.color]}
                          style={styles.iconGradient}
                        >
                          <MaterialCommunityIcons
                            name={hexConfig.icon}
                            size={24}
                            color={shellPalette.text}
                          />
                        </LinearGradient>
                      </View>
                      <View style={styles.conquistaTextBlock}>
                        <View style={styles.conquistaHeaderRow}>
                          <Text
                            style={[
                              styles.conquistaTitulo,
                              { color: shellPalette.text },
                            ]}
                            numberOfLines={1}
                          >
                            {conquista.nome ?? "Conquista"}
                          </Text>
                          {conquista.data_conquista ? (
                            <Text
                              style={[
                                styles.conquistaData,
                                { color: shellPalette.textSubtle },
                              ]}
                            >
                              {new Date(
                                conquista.data_conquista,
                              ).toLocaleDateString("pt-BR", {
                                day: "2-digit",
                                month: "2-digit",
                              })}
                            </Text>
                          ) : null}
                        </View>
                        <Text
                          style={[
                            styles.conquistaDesc,
                            { color: shellPalette.textMuted },
                          ]}
                          numberOfLines={1}
                        >
                          {conquista.descricao ?? "Toque para ver detalhes."}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  ))
                )}
              </>
            ) : (
              <ProfileMetricsViews
                profile={perfil}
                theme={resolvedTheme}
                vm={metricsViewModel}
              />
            )}
          </View>
        </ScrollView>

        <ConquistaModal
          visible={!!conquistaSelecionada}
          onClose={() => setConquistaSelecionada(null)}
          title={conquistaSelecionada?.nome ?? "Conquista desbloqueada"}
          category={conquistaSelecionada?.categoria ?? ""}
          description={
            conquistaSelecionada?.descricao ??
            "Você realizou um feito incrível."
          }
          date={conquistaSelecionada?.data_conquista}
          color={hexConfig.color}
          imageSource={hexConfig.image}
        />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  ornamentRow: { marginTop: 4, opacity: 0.7 },
  scrollContent: { paddingBottom: 40 },
  headerContainer: { marginBottom: 10, alignItems: "center" },
  bannerWrapper: { width: "100%", height: 180, position: "relative" },
  banner: { width: "100%", height: "100%" },
  btnSettings: {
    position: "absolute",
    top: 50,
    right: 20,
    padding: 8,
    borderRadius: 20,
    borderWidth: 1,
    zIndex: 10,
  },
  btnLibrary: {
    position: "absolute",
    top: 96,
    right: 20,
    padding: 8,
    borderRadius: 20,
    borderWidth: 1,
    zIndex: 10,
  },
  profileCard: {
    marginTop: -50,
    width: width * 0.9,
    borderRadius: 24,
    alignItems: "center",
    paddingTop: 55,
    paddingBottom: 24,
    paddingHorizontal: 20,
    borderWidth: 1,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.14,
    shadowRadius: 15,
    elevation: 6,
  },
  avatarContainer: {
    position: "absolute",
    top: -50,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2,
  },
  avatar: { width: 100, height: 100, borderRadius: 50, borderWidth: 4 },
  hexBadgeContainer: {
    position: "absolute",
    top: 0,
    right: 0,
    marginTop: -5,
    marginRight: -5,
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 3,
  },
  hexBadgeShape: {
    position: "absolute",
    width: 26,
    height: 26,
    borderRadius: 4,
    transform: [{ rotate: "45deg" }],
    borderWidth: 2,
    borderColor: "#F4F7FC",
  },
  infoContainer: { alignItems: "center", gap: 4 },
  username: {
    fontFamily: FontFamily.inikaBold,
    fontSize: 13,
    letterSpacing: 1,
    fontWeight: "700",
  },
  name: { fontFamily: FontFamily.inikaBold, fontSize: 18, textAlign: "center" },
  tagProfile: {
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    marginVertical: 4,
  },
  tagProfileText: {
    fontFamily: FontFamily.inikaBold,
    fontSize: 10,
    letterSpacing: 0.5,
  },
  desc: {
    fontFamily: FontFamily.interMedium,
    fontSize: 12,
    textAlign: "center",
    marginTop: 4,
    paddingHorizontal: 10,
  },
  tabsContainer: {
    flexDirection: "row",
    marginHorizontal: 20,
    marginTop: 15,
    borderBottomWidth: 1,
  },
  tabButton: { flex: 1, alignItems: "center", paddingVertical: 12 },
  tabText: { fontFamily: FontFamily.inikaBold, fontSize: 15 },
  tabIndicator: {
    position: "absolute",
    bottom: -1,
    width: "100%",
    height: 3,
    borderTopLeftRadius: 3,
    borderTopRightRadius: 3,
  },
  listContainer: { paddingHorizontal: 20, marginTop: 10 },
  helperText: { textAlign: "center", marginTop: 30 },
  emptyWrap: { marginTop: 20 },
  conquistaItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  conquistaIconContainer: {
    marginRight: 15,
    borderWidth: 1,
    borderRadius: 26,
  },
  iconGradient: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
  },
  conquistaTextBlock: { flex: 1, justifyContent: "center" },
  conquistaHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 2,
  },
  conquistaTitulo: {
    fontFamily: FontFamily.inikaBold,
    fontSize: 14,
    flex: 1,
    marginRight: 10,
  },
  conquistaData: { fontFamily: FontFamily.interMedium, fontSize: 10 },
  conquistaDesc: { fontFamily: FontFamily.interMedium, fontSize: 12 },
});
