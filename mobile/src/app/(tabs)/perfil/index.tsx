import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useFocusEffect } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Image,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import tinycolor from "tinycolor2";

import CardSemDados from "@/components/CardSemDados";
import { BagModal } from "@/components/bag/BagModal";
import { StoreModal } from "@/components/loja/StoreModal";
import ConquistaModal from "@/components/ConquistaModal";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getProfileArtwork, profileEmblems } from "@/constants/designAssets";
import { getAchievementArtwork } from "@/constants/achievementImages";
import { ProfileArtwork } from "@/components/ProfileArtwork";
import { UtilityIcon } from "@/components/UtilityIcon";
import { FramedProfileImage } from "@/components/FramedProfileImage";
import { ProfileMetricsViews } from "@/components/perfil/ProfileMetricsViews";
import { AcoesBannerPerfil } from "@/components/web/AcoesBannerPerfil";
import { ConquistasDestaque } from "@/components/web/ConquistasDestaque";
import { AfinidadesPerfilDesktop } from "@/components/web/AfinidadesPerfilDesktop";
import { IdentidadePerfilDesktop } from "@/components/web/IdentidadePerfilDesktop";
import { UltimaAtividadeDesktop } from "@/components/web/UltimaAtividadeDesktop";
import { sequenciaDeDias } from "@/utils/sequenciaDias";
import { useDesktopWeb } from "@/hooks/useDesktopWeb";
import { useAviso } from "@/hooks/useAviso";
import { buildProfileMetricsViewModel } from "@/components/perfil/profileMetricsViewModel";
import {
  SectionGuideButton,
  type SectionGuideStep,
} from "@/components/SectionGuideButton";
import {
  getGuardianFaceImage,
  getBrainHexConfig,
  normalizeBrainHexProfile,
} from "@/constants/profileImages";
import { useConquistaRank } from "@/context/ConquistaRankContext";
import { useIA } from "@/context/IAContext";
import { useMetricas, useMetricasBatch } from "@/context/MetricasContext";
import { useUsuario } from "@/context/SessaoContext";
import { useTrilha } from "@/context/TrilhaContext";
import { Conquista } from "@/models/Conquista";
import { FontFamily } from "@/styles/GlobalStyle";
import {
  getMetricsThemePreference,
  resolveMetricsTheme,
} from "@/utils/profileMetricThemes";
import { getProfileShellPalette } from "@/utils/profileShellTheme";
import { registrarAlvoTour } from "@/utils/tourTargets";
import { resolveRepresentativeBrainHexProfiles } from "@/utils/brainHex";
import { buildProfileGuideSteps } from "@/utils/profileSectionGuide";
import { selectClassBattles } from '@/utils/battleRuntime';
import { ImagemDoStorage } from "@/components/ImagemDoStorage";

export default function PerfilHome() {
  const insets = useSafeAreaInsets();
  const { usuario, selecionarPerfilAtivo } = useUsuario();
  const { classeAtual, classes, trocarTurma, perfil, progressoPersonalizado, reload: reloadTrilha } = useTrilha();
  const { conquistas, carregando, eventos, posicoesDoAluno, presenca, reloadAll } =
    useConquistaRank();
  const { lastAnalysis, cameraOptIn, cameraPermission } = useMetricas();
  const { lastBatchTimeMetrics } = useMetricasBatch();
  const { runtimeStates } = useIA();
  const router = useRouter();
  // Na web em tela larga (#346): informações do aluno e conquistas em destaque.
  const desktop = useDesktopWeb();
  const { avisar } = useAviso();
  const [bagOpen, setBagOpen] = useState(false);
  const [lojaAberta, setLojaAberta] = useState(false);

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
  const refreshProfileRef = useRef({ reloadAll, reloadTrilha });
  refreshProfileRef.current = { reloadAll, reloadTrilha };
  useFocusEffect(useCallback(() => {
    void Promise.all([refreshProfileRef.current.reloadAll(), refreshProfileRef.current.reloadTrilha()])
      .catch((error) => console.warn('[Perfil] Falha ao atualizar métricas:', error));
  }, []));

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

  const battleStates = useMemo(() => selectClassBattles(runtimeStates.battleStates, usuario?.id ?? null,
    (classeAtual?.topicos ?? []).map((topic) => topic.id)), [classeAtual, runtimeStates.battleStates, usuario?.id]);

  const banner = useMemo(
    () => getProfileArtwork(perfil, 'banner'),
    [perfil],
  );
  const avatar = useMemo(
    () => getGuardianFaceImage(perfil),
    [perfil],
  );

  const perfisRepresentativos = useMemo(
    () => resolveRepresentativeBrainHexProfiles(usuario?.perfis),
    [usuario?.perfis],
  );
  const hexConfig = getBrainHexConfig(perfil);
  const shellPalette = useMemo(() => getProfileShellPalette(perfil), [perfil]);
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
        battleStates,
        presenca,
        progressoPersonalizado,
      }),
    [
      battleStates,
      presenca,
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
        targetRef.current?.measureInWindow((_x: number, y: number) => {
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
      // No celular a biblioteca saiu do topo do Perfil e fica nas Configurações: o passo do
      // guia aponta para a engrenagem, que é por onde se chega a ela.
      profile_library: desktop ? profileLibraryGuideRef : profileSettingsGuideRef,
      profile_settings: profileSettingsGuideRef,
      ...metricGuideRefs,
    }),
    [desktop, metricGuideRefs],
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

      const targetRef: React.RefObject<View | null> | undefined = (
        profileGuideTargets as Record<string, React.RefObject<View | null>>
      )[step.target];
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
        avisar(
          "Não foi possível trocar o perfil",
          error instanceof Error ? error.message : "Tente novamente em instantes.",
          "error",
        );
      } finally {
        setPerfilSalvando(null);
      }
    },
    [avisar, perfil, perfilSalvando, selecionarPerfilAtivo],
  );

  const afinidadeDe = (profileKey: string) =>
    Number(usuario?.perfis.find((item) => normalizeBrainHexProfile(item.nome) === profileKey)?.afinidade ?? 0);

  // Foto, nome, informações e troca de perfil. Na tela larga (#346) vão para a coluna da esquerda.
  const dominante = perfisRepresentativos[0] ?? perfil;
  const identidade = (
    <>
        {desktop ? (
          // Tela larga (#346, protótipo v4): o retrato vai para cima do banner e aqui ficam nome, @, bio e informações.
          <View ref={profileSummaryGuideRef} collapsable={false}>
            <IdentidadePerfilDesktop
              nome={usuario?.nome ?? "Aluno"}
              apelido={username}
              descricao={usuario?.descricao}
              perfilAtivo={perfil}
              ehDominante={perfil === dominante}
              afinidadeAtivo={
                usuario?.perfis.find((item) => normalizeBrainHexProfile(item.nome) === perfil)?.afinidade ?? null
              }
              turma={classeAtual?.resumo?.materia_nome}
              professor={classeAtual?.resumo?.professor_nome}
              email={usuario?.email}
              classeId={classeAtual?.classe_id}
              palette={shellPalette}
            />
          </View>
        ) : (
        <View
          ref={profileSummaryGuideRef}
          collapsable={false}
          // Sem fundo: o retrato sobe sobre o banner e não pode cobrir a câmera nem o degradê.
          style={[styles.profileCard, { pointerEvents: "box-none" }]}
        >
          {/* O próprio retrato edita foto e banner: a câmera era um botão solto na lateral do
              banner, longe do que ela muda. O selo fica no canto oposto ao emblema do perfil. */}
          <Pressable
            onPress={() => router.push("/(tabs)/perfil/info")}
            accessibilityRole="button"
            accessibilityLabel="Editar foto e banner"
            style={({ pressed }) => [styles.avatarContainer, { opacity: pressed ? 0.85 : 1 }]}
          >
            <FramedProfileImage profile={perfil} source={usuario?.foto_url ? { uri: usuario.foto_url } : avatar} size={104} label={`Foto de ${usuario?.nome ?? 'Aluno'}`} />
            <View style={styles.hexBadgeContainer}>
              <ProfileArtwork source={profileEmblems[perfil]} profile={perfil} width={30} />
            </View>
            <View style={[styles.seloEditarFoto, { backgroundColor: shellPalette.accent, borderColor: shellPalette.background }]}>
              <MaterialCommunityIcons name="camera" size={15} color={shellPalette.background} />
            </View>
          </Pressable>

          <View style={styles.infoContainer}>
            <Text style={[styles.name, { color: shellPalette.text }]}>
              {usuario?.nome ?? "Aluno"}
            </Text>
            <Text style={[styles.username, { color: shellPalette.textSubtle }]}>
              {username}
            </Text>
            {usuario?.descricao ? (
              <Text
                style={[styles.desc, { color: shellPalette.textMuted }]}
              >
                {usuario.descricao}
              </Text>
            ) : null}
          </View>

          {/* Editar e trocar de turma como botões com ícone. Turma, e-mail e "na jornada desde"
              saíram do Perfil no celular: turma, sequência e rank já estão nas Métricas, e os
              dados da conta ficam em Informações. */}
          <View style={styles.acoesPerfil}>
            <Pressable
              onPress={() => router.push("/(tabs)/perfil/info")}
              accessibilityRole="button"
              style={({ pressed }) => [
                styles.acaoPerfil,
                { backgroundColor: shellPalette.surface, borderColor: shellPalette.border, opacity: pressed ? 0.75 : 1 },
              ]}
            >
              <View style={[styles.acaoPerfilIcone, { backgroundColor: shellPalette.accentMuted }]}>
                <MaterialCommunityIcons name="account-edit-outline" size={18} color={shellPalette.accent} />
              </View>
              <Text style={[styles.acaoPerfilTexto, { color: shellPalette.text }]}>Editar perfil</Text>
            </Pressable>
            {classes.length > 1 ? (
              <Pressable
                onPress={trocarTurma}
                accessibilityRole="button"
                style={({ pressed }) => [
                  styles.acaoPerfil,
                  { backgroundColor: shellPalette.surface, borderColor: shellPalette.border, opacity: pressed ? 0.75 : 1 },
                ]}
              >
                <View style={[styles.acaoPerfilIcone, { backgroundColor: shellPalette.accentMuted }]}>
                  <MaterialCommunityIcons name="swap-horizontal" size={18} color={shellPalette.accent} />
                </View>
                <Text style={[styles.acaoPerfilTexto, { color: shellPalette.text }]}>Trocar turma</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
        )}

        {desktop ? (
          // Tela larga (#346, protótipo v4): troca em lista, barra das afinidades e os números da jornada.
          <AfinidadesPerfilDesktop
            afinidades={perfisRepresentativos.map((profileKey) => ({
              perfil: profileKey,
              afinidade: usuario?.perfis.find((item) => normalizeBrainHexProfile(item.nome) === profileKey)?.afinidade ?? 0,
            }))}
            ativo={perfil}
            salvando={perfilSalvando}
            onSelecionar={(profileKey) => void handleSelecionarPerfil(profileKey)}
            trocaRef={profileSwitcherGuideRef}
            turma={classeAtual?.resumo?.materia_nome}
            sequencia={sequenciaDeDias(metricsViewModel.semanaDiaria)}
            posicao={metricsViewModel.melhorPosicao?.posicao ?? null}
            palette={shellPalette}
          />
        ) : null}
    </>
  );

  // Troca de perfil no celular. Vem depois de Métricas e Conquistas, que abrem a tela.
  const trocaDePerfil = (
    <>
        {desktop ? null : perfisRepresentativos.length > 1 ? (
          // Cartão do perfil (08-perfil-hub.html, .cartao/.chip-perfil/.rot): o ativo no topo, depois a troca.
          <View
            ref={profileSwitcherGuideRef}
            collapsable={false}
            style={[styles.profileSwitcherWrap, { backgroundColor: shellPalette.surface, borderColor: shellPalette.border }]}
          >
            <View style={styles.chipPerfil}>
              <ProfileArtwork source={profileEmblems[perfil]} profile={perfil} width={44} height={44} />
              <View>
                <Text style={[styles.chipPerfilNome, { color: shellPalette.text }]}>{hexConfig.label}</Text>
                <Text style={[styles.chipPerfilTipo, { color: shellPalette.accent }]}>
                  {perfil === perfisRepresentativos[0] ? "Perfil dominante" : "Perfil ativo"}
                </Text>
              </View>
            </View>
            <Text style={[styles.profileSwitcherTitle, { color: shellPalette.textSubtle }]}>
              ALTERNAR PERFIL ATIVO
            </Text>
            {/* Celular (mobile-v1, 08-perfil-hub.html, `.opcoes`): grade de 3 colunas, não linha rolável. */}
            <View style={styles.profileSwitcherContent}>
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
                          : tinycolor(shellPalette.background).setAlpha(0.55).toRgbString(),
                        opacity: perfilSalvando && !saving ? 0.55 : 1,
                      },
                    ]}
                  >
                    {selected ? (
                      <MaterialCommunityIcons
                        name="check-circle"
                        size={16}
                        color={getProfileShellPalette(profileKey).accent}
                        style={styles.profileOptionCheck}
                      />
                    ) : null}
                    <ProfileArtwork source={profileEmblems[profileKey]} profile={perfil} width={28} height={30} />
                    <Text
                      numberOfLines={1}
                      style={[
                        styles.profileOptionLabel,
                        { color: selected ? getProfileShellPalette(profileKey).accent : shellPalette.text },
                      ]}
                    >
                      {config.label}
                    </Text>
                    <Text style={[styles.profileOptionAffinity, { color: shellPalette.textSubtle }]}>
                      {saving ? "Salvando..." : `${Math.round(afinidade ?? 0)}%`}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            {/* Barra de afinidades (08-perfil-hub.html, `.afin`): a proporção entre os perfis. As
                afinidades do app são independentes (0–100 cada, não somam 100), então a barra
                compara entre elas e a legenda mostra o valor real de cada uma. */}
            <View style={[styles.afinidades, { backgroundColor: shellPalette.surfaceElevated }]} accessible={false}>
              {perfisRepresentativos.map((profileKey) => (
                <View
                  key={profileKey}
                  style={{
                    flex: Math.max(1, afinidadeDe(profileKey)),
                    backgroundColor:
                      profileKey === perfil
                        ? shellPalette.accent
                        : tinycolor(getBrainHexConfig(profileKey).color).setAlpha(0.85).toRgbString(),
                  }}
                />
              ))}
            </View>
            <Text style={[styles.afinidadesLegenda, { color: shellPalette.textSubtle }]}>
              {perfisRepresentativos
                .map((profileKey) => `${getBrainHexConfig(profileKey).label} ${Math.round(afinidadeDe(profileKey))}%`)
                .join(" · ")}
            </Text>
          </View>
        ) : null}
    </>
  );

  // Conquistas, abas e conteúdo. Na tela larga ficam na coluna da direita.
  const principal = (
    <>
      {desktop && usuario?.id ? (
        <ConquistasDestaque
          alunoId={usuario.id}
          perfis={perfisRepresentativos.length ? perfisRepresentativos : [perfil]}
          palette={shellPalette}
          onAbrir={setConquistaSelecionada}
        />
      ) : null}

      {/* Tela larga (#346, protótipo v4): sem as abas; as métricas vêm direto e as conquistas já estão no cartão acima. */}
      {desktop ? null : (
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
          accessibilityRole="tab"
          accessibilityState={{ selected: aba === "metricas" }}
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
          accessibilityRole="tab"
          accessibilityState={{ selected: aba === "conquistas" }}
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
            Conquistas ({conquistas.length})
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
      )}

      <View ref={profileAchievementsGuideRef} collapsable={false} style={[styles.listContainer, desktop && styles.listaLarga]}>
        {!desktop && aba === "conquistas" ? (
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
                  accessibilityRole="button"
                  accessibilityLabel={conquista.nome ?? "Conquista"}
                >
                  <View
                    style={[
                      styles.conquistaIconContainer,
                      { borderColor: shellPalette.borderStrong },
                    ]}
                  >
                    <Image source={getAchievementArtwork(conquista)} resizeMode="contain" style={{ width: 50, height: 54 }} accessible={false} />
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
          <>
          <ProfileMetricsViews
            profile={perfil}
            theme={resolvedTheme}
            vm={metricsViewModel}
            guideRefs={profileGuideTargets}
            larga={desktop}
          />
          {desktop ? <UltimaAtividadeDesktop eventos={eventos} palette={shellPalette} /> : null}
          </>
        )}
      </View>
    </>
  );

  return (
    <>
      <StatusBar
        barStyle="light-content"
        translucent
        backgroundColor="transparent"
      />
      <View
        style={[styles.screen, { backgroundColor: shellPalette.background, paddingTop: insets.top }]}
      >
        <ScrollView
          ref={profileScrollRef}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          scrollEventThrottle={16}
          onScroll={(event) => {
            profileScrollYRef.current = event.nativeEvent.contentOffset.y;
          }}
        >
          <View style={[styles.headerContainer, desktop && styles.headerLargo]}>
            <SectionGuideButton
              profile={perfil}
              sectionTitle="Perfil"
              steps={profileGuideSteps}
              targetRefs={profileGuideTargets}
              onStepFocus={prepareProfileGuideStep}
              style={styles.guideButton}
            />
            <View style={[styles.bannerWrapper, desktop && styles.bannerLargo]}>
              {usuario?.banner_url ? (
                <ImagemDoStorage
                  source={{ uri: usuario.banner_url }}
                  fallback={banner}
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
                // No celular (mobile-v1, 08-perfil-hub.html) o banner some no fundo da tela embaixo.
                colors={
                  desktop
                    ? ["rgba(0,0,0,0.34)", "transparent"]
                    : [tinycolor(shellPalette.background).setAlpha(0.55).toRgbString(), "transparent", shellPalette.background]
                }
                locations={desktop ? undefined : [0, 0.45, 1]}
                style={StyleSheet.absoluteFill}
              />
              {desktop ? (
                <AcoesBannerPerfil
                  palette={shellPalette}
                  configuracoesRef={profileSettingsGuideRef}
                  bibliotecaRef={profileLibraryGuideRef}
                  onAbrirBag={() => setBagOpen(true)}
                />
              ) : null}
            </View>
            {desktop ? (
              <View style={styles.retrato}>
                <FramedProfileImage profile={perfil} source={usuario?.foto_url ? { uri: usuario.foto_url } : avatar} size={160} label={`Foto de ${usuario?.nome ?? "Aluno"}`} />
              </View>
            ) : null}

            {/* Na tela larga estes botões ficam dentro do banner (AcoesBannerPerfil). No celular,
                Loja e Bag lado a lado e a engrenagem por último: Biblioteca de conquistas,
                Relatório e Sair moram nas Configurações, não no corpo do Perfil. */}
            {desktop ? null : (
            <View style={styles.acoesTopo}>
              {usuario?.id && (classeAtual?.classe_id ?? 0) > 0 ? (
                <TouchableOpacity
                  style={styles.btnTopo}
                  onPress={() => setLojaAberta(true)}
                  accessibilityRole="button"
                  accessibilityLabel="Abrir loja"
                >
                  <UtilityIcon kind="store" size={34} />
                </TouchableOpacity>
              ) : null}
              <TouchableOpacity
                style={styles.btnTopo}
                onPress={() => setBagOpen(true)}
                accessibilityRole="button"
                accessibilityLabel="Abrir minha Bag"
              >
                <UtilityIcon kind="bag" size={34} />
              </TouchableOpacity>
              <View ref={profileSettingsGuideRef} collapsable={false}>
                <TouchableOpacity
                  style={styles.btnTopo}
                  onPress={() => router.push("/(tabs)/perfil/settings")}
                  accessibilityRole="button"
                  accessibilityLabel="Configurações"
                >
                  <UtilityIcon kind="settings" size={34} />
                </TouchableOpacity>
              </View>
            </View>
            )}

            {desktop ? null : identidade}
          </View>

          {desktop ? (
            <View style={styles.colunas}>
              <View style={[styles.colunaIdentidade, styles.colunaIdentidadeGrudada]}>
                {identidade}
              </View>
              <View style={styles.colunaPrincipal}>{principal}</View>
            </View>
          ) : (
            <>
              {principal}
              {trocaDePerfil}
            </>
          )}
        </ScrollView>
        {usuario?.id && (classeAtual?.classe_id ?? 0) > 0 ? (
          <StoreModal
            visible={lojaAberta}
            alunoId={usuario.id}
            classeId={classeAtual!.classe_id}
            profileName={perfil}
            onClose={() => setLojaAberta(false)}
          />
        ) : null}

        <BagModal
          visible={bagOpen}
          classeId={classeAtual?.classe_id ?? null}
          profile={perfil}
          onClose={() => setBagOpen(false)}
        />

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
          profile={perfil}
          imageSource={getAchievementArtwork(conquistaSelecionada)}
        />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  scrollContent: { paddingBottom: 40 },
  headerContainer: { marginBottom: 4, alignItems: "center" },
  // Web em tela larga (#346, protótipo v4): banner de 240 px e, embaixo, identidade (4/12) e conteúdo (8/12).
  headerLargo: { paddingHorizontal: 32, paddingTop: 28 },
  bannerLargo: { height: 240, borderRadius: 20, overflow: "hidden" },
  colunas: { flexDirection: "row", gap: 20, alignItems: "flex-start", paddingHorizontal: 32, marginTop: 8 },
  // A identidade é mais curta que a coluna de conteúdo: rolando as duas juntas, a esquerda
  // acabava e deixava meia tela vazia ao lado do que ainda estava rolando. Grudada no topo, ela
  // acompanha a leitura até o fim.
  //
  // `position: "sticky"` existe na web e não no React Native; o cast é o mesmo idioma do
  // `lateralBatalhaDesktop` em `trilhaTopicoStyles`. O estilo só é aplicado quando
  // `useDesktopWeb()` é verdadeiro, então o celular nunca o vê.
  colunaIdentidade: { flex: 4, minWidth: 0 },
  colunaIdentidadeGrudada: {
    position: "sticky" as "absolute",
    // Respira abaixo da barra superior em vez de encostar nela.
    top: 16,
    // Identidade mais alta que a janela volta a rolar por dentro, senão o fim dela fica
    // inalcançável — é o modo de falha que `sticky` tem e `fixed` não resolveria.
    maxHeight: "100vh" as unknown as number,
    // `overflowY` só existe na web (o react-native-web repassa ao CSS); o tipo de estilo do RN não o
    // conhece e um cast no valor não basta, porque a chave é que é desconhecida.
    ...({ overflowY: "auto" } as object),
  },
  // Retrato de 160 px sobre o canto do banner: 72 px dele descem abaixo da borda, como no protótipo.
  retrato: { position: "absolute", left: 64, top: 28 + 240 - 88, zIndex: 5 },
  colunaPrincipal: { flex: 8, minWidth: 0 },
  // Celular (mobile-v1, 08-perfil-hub.html): 150 px de cenário, não a faixa de 64 de antes.
  bannerWrapper: { width: "100%", height: 150, position: "relative" },
  banner: { width: "100%", height: "100%" },
  // Loja, Bag e Configurações numa linha só no canto do banner.
  acoesTopo: {
    position: "absolute",
    top: 10,
    right: 14,
    zIndex: 10,
    flexDirection: "row",
    gap: 4,
  },
  btnTopo: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  guideButton: {
    position: "absolute",
    top: 10,
    left: 20,
  },
  // Celular (mobile-v1, 08-perfil-hub.html, .retrato/.ident): retrato de 104 subindo 60 sobre o
  // banner, e nome, @ e bio centrados embaixo.
  profileCard: {
    width: "100%",
    alignItems: "center",
    marginTop: -60,
    paddingBottom: 4,
    paddingHorizontal: 22,
  },
  avatarContainer: {
    width: 104,
    height: 104,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 2,
  },
  hexBadgeContainer: {
    position: "absolute",
    bottom: 0,
    right: 0,
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 3,
  },
  seloEditarFoto: {
    position: "absolute",
    bottom: 2,
    left: 2,
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 3,
  },
  acoesPerfil: { flexDirection: "row", gap: 10, marginTop: 14, alignSelf: "stretch", justifyContent: "center" },
  acaoPerfil: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minHeight: 44,
    paddingLeft: 6,
    paddingRight: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  acaoPerfilIcone: { width: 32, height: 32, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  acaoPerfilTexto: { fontFamily: FontFamily.interMedium, fontSize: 14, fontWeight: "600" },
  infoContainer: { alignItems: "center", gap: 2, paddingTop: 10 },
  profileSwitcherWrap: {
    // O cabeçalho centraliza os filhos: sem isto o cartão encolhia e cortava os nomes.
    alignSelf: "stretch",
    marginTop: 20,
    marginHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
  },
  chipPerfil: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 12, paddingHorizontal: 16 },
  chipPerfilNome: { fontFamily: FontFamily.interMedium, fontSize: 16, fontWeight: "700" },
  chipPerfilTipo: { fontFamily: FontFamily.interMedium, fontSize: 12.5, fontWeight: "700" },
  profileSwitcherTitle: {
    fontFamily: FontFamily.interMedium,
    fontSize: 11.5,
    fontWeight: "700",
    letterSpacing: 1,
    marginBottom: 8,
    marginLeft: 16,
  },
  profileSwitcherContent: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    paddingHorizontal: 16,
  },
  profileOption: {
    // 3 por linha: (100% - 2 espaços de 8px) / 3.
    width: "31.6%",
    minHeight: 72,
    alignItems: "center",
    justifyContent: "center",
    gap: 3,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 4,
    paddingVertical: 6,
  },
  afinidades: { flexDirection: "row", height: 10, borderRadius: 999, overflow: "hidden", marginTop: 14, marginBottom: 6, marginHorizontal: 16 },
  afinidadesLegenda: { fontFamily: FontFamily.interMedium, fontSize: 12.5, lineHeight: 19, marginHorizontal: 16 },
  profileOptionCheck: { position: "absolute", top: 6, right: 6 },
  profileOptionLabel: {
    fontFamily: FontFamily.inikaBold,
    fontSize: 12.5,
  },
  profileOptionAffinity: {
    fontFamily: FontFamily.interMedium,
    fontSize: 11,
    marginTop: 1,
  },
  username: {
    fontFamily: FontFamily.interMedium,
    fontSize: 12.5,
    letterSpacing: 1.5,
    marginBottom: 6,
  },
  name: { fontFamily: FontFamily.inikaBold, fontSize: 24, lineHeight: 30, textAlign: "center" },
  desc: {
    fontFamily: FontFamily.interMedium,
    fontSize: 14.5,
    lineHeight: 22,
    textAlign: "center",
  },
  tabsContainer: {
    flexDirection: "row",
    marginHorizontal: 20,
    marginTop: 8,
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
  // Na tela larga os cartões encostam nas bordas da coluna, como no protótipo.
  listaLarga: { paddingHorizontal: 0, marginTop: 0, gap: 16 },
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
