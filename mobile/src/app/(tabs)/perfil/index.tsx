import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
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
  SectionGuideButton,
  type SectionGuideStep,
} from "@/components/SectionGuideButton";
import {
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
import { registrarAlvoTour } from "@/utils/tourTargets";
import { resolveRepresentativeBrainHexProfiles } from "@/utils/brainHex";
import { buildProfileGuideSteps } from "@/utils/profileSectionGuide";

const { width } = Dimensions.get("window");

export default function PerfilHome() {
  const { usuario, selecionarPerfilAtivo } = useUsuario();
  const { classeAtual, perfil, progressoPersonalizado } = useTrilha();
  const { conquistas, carregando, eventos, posicoesDoAluno } =
    useConquistaRank();
  const { lastAnalysis, cameraOptIn, cameraPermission } = useMetricas();
  const { lastBatchTimeMetrics } = useMetricasBatch();
  const { getBattleState } = useIA();
  const router = useRouter();

  const [aba, setAba] = useState<"metricas" | "conquistas">("metricas");
  const [conquistaSelecionada, setConquistaSelecionada] =
    useState<Conquista | null>(null);
  const [perfilSalvando, setPerfilSalvando] = useState<string | null>(null);
  const profileSummaryGuideRef = useRef<View | null>(null);
  const profileSwitcherGuideRef = useRef<View | null>(null);
  const profileTabsGuideRef = useRef<View | null>(null);
  const profileLibraryGuideRef = useRef<View | null>(null);
  const profileSettingsGuideRef = useRef<View | null>(null);
  const profileAchievementsGuideRef = useRef<View | null>(null);
  const profileScrollRef = useRef<ScrollView | null>(null);
  const profileScrollYRef = useRef(0);
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

  const perfisRepresentativos = useMemo(
    () => resolveRepresentativeBrainHexProfiles(usuario?.perfis),
    [usuario?.perfis],
  );
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
        progressoPersonalizado,
      }),
    [
      battleState,
      cameraOptIn,
      cameraPermission,
      classeAtual,
      conquistas,
      eventos,
      progressoPersonalizado,
      lastAnalysis,
      lastBatchTimeMetrics,
      posicoesDoAluno,
      usuario?.perfis,
    ],
  );
  const profileGuideSteps = useMemo(
    () =>
      buildProfileGuideSteps({
        hasProfileSwitcher: perfisRepresentativos.length > 1,
        theme: resolvedTheme,
        vm: metricsViewModel,
      }),
    [metricsViewModel, perfisRepresentativos.length, resolvedTheme],
  );
  const metricGuideRefs = useMemo<Record<string, React.RefObject<View | null>>>(
    () =>
      Object.fromEntries(
        profileGuideSteps
          .filter((step) => step.target.startsWith("profile_metric_"))
          .map((step) => [step.target, React.createRef<View>()]),
      ),
    [profileGuideSteps],
  );
  // Alvos do tutorial inicial: as refs ja existiam para o guia de pagina.
  useEffect(
    () =>
      registrarAlvoTour("perfil_resumo", profileSummaryGuideRef, () => {
        profileScrollRef.current?.scrollTo({ y: 0, animated: false });
      }),
    [],
  );
  useEffect(
    () => {
      const visibleMetricTargets = profileGuideSteps
        .filter((step) => step.target.startsWith("profile_metric_"))
        .map((step) => step.target);
      // O segundo cartao, quando existe, fica livre da personagem posicionada
      // no lado esquerdo e continua sendo uma metrica real deste perfil.
      const visibleMetricTarget = visibleMetricTargets[1] ?? visibleMetricTargets[0];
      const visibleMetricRef = visibleMetricTarget
        ? metricGuideRefs[visibleMetricTarget]
        : undefined;
      const targetRef = visibleMetricRef ?? profileTabsGuideRef;
      return registrarAlvoTour("perfil_metricas", targetRef, () => {
        targetRef.current?.measureInWindow((_x, y) => {
          const targetY = Math.max(0, profileScrollYRef.current + y - 118);
          profileScrollRef.current?.scrollTo({ y: targetY, animated: false });
        });
      });
    },
    [metricGuideRefs, profileGuideSteps],
  );

  const profileGuideTargets = useMemo(
    () => ({
      profile_summary: profileSummaryGuideRef,
      profile_switcher: profileSwitcherGuideRef,
      profile_tabs: profileTabsGuideRef,
      profile_achievements: profileAchievementsGuideRef,
      profile_library: profileLibraryGuideRef,
      profile_settings: profileSettingsGuideRef,
      ...metricGuideRefs,
    }),
    [metricGuideRefs],
  );
  const prepareProfileGuideStep = useCallback(
    async (step: SectionGuideStep) => {
      const metricStep = step.target.startsWith("profile_metric_");
      const achievementsStep = step.target === "profile_achievements";

      if (metricStep && aba !== "metricas") {
        setAba("metricas");
        await new Promise((resolve) => setTimeout(resolve, 180));
      } else if (achievementsStep && aba !== "conquistas") {
        setAba("conquistas");
        await new Promise((resolve) => setTimeout(resolve, 180));
      }

      const targetRef = profileGuideTargets[step.target];
      if (!targetRef?.current) return;

      await new Promise<void>((resolve) => {
        const fallback = setTimeout(resolve, 550);
        targetRef.current?.measureInWindow((_x, y) => {
          const targetY = Math.max(0, profileScrollYRef.current + y - 120);
          profileScrollRef.current?.scrollTo({ y: targetY, animated: true });
          setTimeout(() => {
            clearTimeout(fallback);
            resolve();
          }, 420);
        });
      });
    },
    [aba, profileGuideTargets],
  );

  const username = usuario?.apelido
    ? `@${usuario.apelido.toUpperCase()}`
    : "@USUARIO";

  const handleSelecionarPerfil = useCallback(
    async (profile: (typeof perfisRepresentativos)[number]) => {
      if (profile === perfil || perfilSalvando) return;
      setPerfilSalvando(profile);
      try {
        await selecionarPerfilAtivo(profile);
      } catch (error) {
        Alert.alert(
          "Não foi possível trocar o perfil",
          error instanceof Error ? error.message : "Tente novamente em instantes.",
        );
      } finally {
        setPerfilSalvando(null);
      }
    },
    [perfil, perfilSalvando, selecionarPerfilAtivo],
  );

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
          ref={profileScrollRef}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          scrollEventThrottle={16}
          onScroll={(event) => {
            profileScrollYRef.current = event.nativeEvent.contentOffset.y;
          }}
        >
          <View style={styles.headerContainer}>
            <SectionGuideButton
              profile={perfil}
              sectionTitle="Perfil"
              steps={profileGuideSteps}
              targetRefs={profileGuideTargets}
              onStepFocus={prepareProfileGuideStep}
              style={styles.guideButton}
            />
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

            <View ref={profileSettingsGuideRef} collapsable={false} style={styles.btnSettingsWrap}>
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
            </View>
            <View ref={profileLibraryGuideRef} collapsable={false} style={styles.btnLibraryWrap}>
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
            </View>

            <View
              ref={profileSummaryGuideRef}
              collapsable={false}
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

            {perfisRepresentativos.length > 1 ? (
              <View ref={profileSwitcherGuideRef} collapsable={false} style={styles.profileSwitcherWrap}>
                <Text style={[styles.profileSwitcherTitle, { color: shellPalette.textMuted }]}>
                  Alternar perfil ativo
                </Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.profileSwitcherContent}
                >
                  {perfisRepresentativos.map((profileKey) => {
                    const config = getBrainHexConfig(profileKey);
                    const afinidade = usuario?.perfis.find(
                      (item) => normalizeBrainHexProfile(item.nome) === profileKey,
                    )?.afinidade;
                    const selected = profileKey === perfil;
                    const saving = profileKey === perfilSalvando;

                    return (
                      <TouchableOpacity
                        key={profileKey}
                        accessibilityRole="button"
                        accessibilityState={{ selected, busy: saving }}
                        disabled={Boolean(perfilSalvando)}
                        onPress={() => void handleSelecionarPerfil(profileKey)}
                        style={[
                          styles.profileOption,
                          {
                            borderColor: selected ? config.color : shellPalette.border,
                            backgroundColor: selected
                              ? tinycolor(config.color).setAlpha(0.2).toRgbString()
                              : shellPalette.surface,
                            opacity: perfilSalvando && !saving ? 0.55 : 1,
                          },
                        ]}
                      >
                        <MaterialCommunityIcons
                          name={config.icon}
                          size={17}
                          color={selected ? config.color : shellPalette.textMuted}
                        />
                        <View>
                          <Text
                            style={[
                              styles.profileOptionLabel,
                              { color: selected ? config.color : shellPalette.text },
                            ]}
                          >
                            {config.label}
                          </Text>
                          <Text
                            style={[
                              styles.profileOptionAffinity,
                              { color: shellPalette.textSubtle },
                            ]}
                          >
                            {saving ? "Salvando..." : `${Math.round(afinidade ?? 0)}% de afinidade`}
                          </Text>
                        </View>
                        {selected ? (
                          <MaterialCommunityIcons
                            name="check-circle"
                            size={16}
                            color={config.color}
                          />
                        ) : null}
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            ) : null}
          </View>

          <View
            ref={profileTabsGuideRef}
            collapsable={false}
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

          <View ref={profileAchievementsGuideRef} collapsable={false} style={styles.listContainer}>
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
                      accentColor={shellPalette.accent}
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
                guideRefs={profileGuideTargets}
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
    padding: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  btnSettingsWrap: {
    position: "absolute",
    top: 50,
    right: 20,
    zIndex: 10,
  },
  guideButton: {
    position: "absolute",
    top: 50,
    left: 20,
  },
  btnLibraryWrap: {
    position: "absolute",
    top: 96,
    right: 20,
    zIndex: 10,
  },
  btnLibrary: {
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
  profileSwitcherWrap: {
    width: "100%",
    marginTop: 14,
  },
  profileSwitcherTitle: {
    fontFamily: FontFamily.interMedium,
    fontSize: 11,
    marginBottom: 8,
    marginLeft: 20,
  },
  profileSwitcherContent: {
    gap: 8,
    paddingHorizontal: 20,
  },
  profileOption: {
    minWidth: 154,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  profileOptionLabel: {
    fontFamily: FontFamily.inikaBold,
    fontSize: 12,
  },
  profileOptionAffinity: {
    fontFamily: FontFamily.interMedium,
    fontSize: 9,
    marginTop: 1,
  },
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
