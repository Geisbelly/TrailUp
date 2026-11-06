import { MaterialCommunityIcons } from "@expo/vector-icons";
import { ProfessorDaTurma } from "@/components/social/ProfessorDaTurma";
import { ProfessorProfileModal } from "@/components/social/ProfessorProfileModal";
import { rotuloDaTurma } from "@/utils/rotuloDaTurma";
import { useFocusEffect } from "@react-navigation/native";
import { LinearGradient } from "expo-linear-gradient";
import { useLocalSearchParams, useRouter } from "expo-router";
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
import { useMolduraEquipada } from "@/hooks/useMolduras";
import { ProfileMetricsViews } from "@/components/perfil/ProfileMetricsViews";
import { FaixaXpCartao } from "@/components/perfil/FaixaXpCartao";
import {
  EsqueletoDaFaixaXp,
  EsqueletoDaListaDeConquistas,
  EsqueletoDasMetricas,
} from "@/components/perfil/EsqueletoDoPerfil";
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
import { registrarAlvoTour, useAlvoTour } from "@/utils/tourTargets";
import { resolveRepresentativeBrainHexProfiles } from "@/utils/brainHex";
import { buildProfileGuideSteps } from "@/utils/profileSectionGuide";
import { selectClassBattles } from '@/utils/battleRuntime';
import { ImagemDoStorage } from "@/components/ImagemDoStorage";

export default function PerfilHome() {
  const insets = useSafeAreaInsets();
  const { usuario, selecionarPerfilAtivo } = useUsuario();
  const moldura = useMolduraEquipada();
  const { classeAtual, classes, trocarTurma, perfil, progressoPersonalizado, reload: reloadTrilha } = useTrilha();
  const { conquistas, carregando, eventos, faixaXp, posicoesDoAluno, presenca, reloadAll } =
    useConquistaRank();
  const { lastAnalysis, cameraOptIn, cameraPermission } = useMetricas();
  const { timeMetricsRecentes } = useMetricasBatch();
  const { runtimeStates } = useIA();
  const router = useRouter();
  // Na web em tela larga (#346): informações do aluno e conquistas em destaque.
  const desktop = useDesktopWeb();
  const { avisar } = useAviso();
  const [bagOpen, setBagOpen] = useState(false);
  const [perfilDoProfessorAberto, setPerfilDoProfessorAberto] = useState(false);
  const [lojaAberta, setLojaAberta] = useState(false);
  const alvoLoja = useAlvoTour("perfil_loja");
  // No celular a Loja é um modal: é assim que o botão do Guardião chega nela.
  const { abrir } = useLocalSearchParams<{ abrir?: string }>();
  useEffect(() => {
    if (abrir !== "loja") return;
    setLojaAberta(true);
    router.setParams({ abrir: undefined });
  }, [abrir, router]);

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
        timeMetricsRecentes,
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
      timeMetricsRecentes,
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

      const targetRef: React.RefObject<View | null> | undefined = (
        profileGuideTargets as Record<string, React.RefObject<View | null>>
      )[step.target];
      // Na primeira carga as métricas são esqueleto e os alvos delas ainda não existem:
      // o passo espera o painel montar (até 3 s) em vez de abrir sem nada destacado.
      for (let espera = 0; metricStep && targetRef && !targetRef.current && espera < 3_000; espera += 100) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
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
              onTrocarTurma={classes.length > 1 ? trocarTurma : undefined}
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
              banner, longe do que ela muda. O emblema do perfil saiu do canto do retrato: ele já
              aparece no cartão de troca de perfil. */}
          <Pressable
            onPress={() => router.push("/(tabs)/perfil/info")}
            accessibilityRole="button"
            accessibilityLabel="Editar foto e banner"
            style={({ pressed }) => [styles.avatarContainer, { opacity: pressed ? 0.85 : 1 }]}
          >
            <FramedProfileImage profile={perfil} moldura={moldura} source={usuario?.foto_url ? { uri: usuario.foto_url } : avatar} size={104} label={`Foto de ${usuario?.nome ?? 'Aluno'}`} />
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

  // Faixa de XP da turma atual (#143), logo abaixo da identidade. Só a da turma na tela: ao
  // trocar de turma, a da anterior não aparece enquanto a nova carrega.
  // Enquanto a primeira carga não volta, o lugar dela fica reservado: sem isso o cartão
  // aparecia depois, empurrando a tela inteira para baixo.
  const faixaDaTurma =
    faixaXp && faixaXp.classeId === Number(classeAtual?.classe_id) ? (
      <FaixaXpCartao faixa={faixaXp} palette={shellPalette} style={desktop ? styles.faixaXpLarga : styles.faixaXp} />
    ) : carregando ? (
      <EsqueletoDaFaixaXp palette={shellPalette} style={desktop ? styles.faixaXpLarga : styles.faixaXp} />
    ) : null;

  // A aba Social fica fechada no começo da trilha, e a turma salva pula os cards: aqui o aluno
  // sempre alcança o professor.
  const professorDaTurma = rotuloDaTurma(classeAtual?.resumo).professor;
  const professorNoPerfil = professorDaTurma && classeAtual ? (
    <View style={desktop ? styles.faixaXpLarga : styles.faixaXp}>
      <ProfessorDaTurma
        professor={professorDaTurma}
        accent={shellPalette.accent}
        textColor={shellPalette.text}
        mutedColor={shellPalette.textMuted}
        cartao={{ surface: shellPalette.surface, border: shellPalette.border }}
        onPress={() => setPerfilDoProfessorAberto(true)}
      />
    </View>
  ) : null;

  // Troca de perfil no celular, logo abaixo do nome, em formato compacto: um rótulo e um
  // botão por perfil (emblema, nome, afinidade), o em uso destacado na cor dele. O que a
  // troca faz está no guia da seção (passo "Troca de perfil").
  const trocaDePerfil = (
    <>
        {desktop ? null : perfisRepresentativos.length > 1 ? (
          <View ref={profileSwitcherGuideRef} collapsable={false} style={styles.trocaPerfil}>
            <Text style={[styles.trocaPerfilRotulo, { color: shellPalette.textSubtle }]}>PERFIL BRAINHEX</Text>
            <View accessibilityRole="radiogroup" accessibilityLabel="Perfil BrainHex em uso" style={styles.trocaPerfilLista}>
              {perfisRepresentativos.map((profileKey) => {
                const config = getBrainHexConfig(profileKey);
                const corDoPerfil = getProfileShellPalette(profileKey).accent;
                const afinidade = Math.round(afinidadeDe(profileKey));
                const ehDominante = profileKey === dominante;
                const selected = profileKey === perfil;
                const saving = profileKey === perfilSalvando;

                return (
                  <TouchableOpacity
                    key={profileKey}
                    accessibilityRole="radio"
                    accessibilityState={{ selected, busy: saving }}
                    accessibilityLabel={`${config.label}, ${afinidade}% de afinidade${ehDominante ? ", dominante" : ""}`}
                    disabled={Boolean(perfilSalvando)}
                    onPress={() => void handleSelecionarPerfil(profileKey)}
                    style={[
                      styles.trocaPerfilOpcao,
                      {
                        borderColor: selected ? corDoPerfil : shellPalette.border,
                        backgroundColor: selected
                          ? tinycolor(config.color).setAlpha(0.18).toRgbString()
                          : shellPalette.surface,
                        opacity: perfilSalvando && !saving ? 0.55 : 1,
                      },
                    ]}
                  >
                    <ProfileArtwork source={profileEmblems[profileKey]} profile={profileKey} width={26} height={26} />
                    <View style={styles.trocaPerfilTexto}>
                      <Text numberOfLines={1} style={[styles.trocaPerfilNome, { color: selected ? corDoPerfil : shellPalette.text }]}>
                        {config.label}
                      </Text>
                      {/* Estrela no dominante e ✓ no em uso, ao lado do percentual: em 360 px a
                          palavra "dominante" e um ✓ no fim do botão cortavam o nome. */}
                      <View style={styles.trocaPerfilAfinidadeLinha}>
                        <Text numberOfLines={1} style={[styles.trocaPerfilAfinidade, { color: shellPalette.textSubtle }]}>
                          {saving ? "Salvando..." : `${afinidade}%`}
                        </Text>
                        {ehDominante && !saving ? <MaterialCommunityIcons name="star" size={11} color={shellPalette.accent} /> : null}
                        {selected && !saving ? <MaterialCommunityIcons name="check-circle" size={12} color={corDoPerfil} /> : null}
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
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
            {/* Sem número até a primeira carga: "(0)" diria que não há nenhuma. */}
            {carregando ? "Conquistas" : `Conquistas (${conquistas.length})`}
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
              <EsqueletoDaListaDeConquistas palette={shellPalette} />
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
          {/* Até a primeira carga do ConquistaRank, o painel mostraria "0%", "Sem rank" e
              barras zeradas como se fossem o resultado do aluno. */}
          {carregando ? (
            <EsqueletoDasMetricas palette={shellPalette} />
          ) : (
            <ProfileMetricsViews
              profile={perfil}
              theme={resolvedTheme}
              vm={metricsViewModel}
              guideRefs={profileGuideTargets}
              larga={desktop}
            />
          )}
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
                <FramedProfileImage profile={perfil} moldura={moldura} source={usuario?.foto_url ? { uri: usuario.foto_url } : avatar} size={160} label={`Foto de ${usuario?.nome ?? "Aluno"}`} />
              </View>
            ) : null}

            {/* Na tela larga estes botões ficam dentro do banner (AcoesBannerPerfil). No celular,
                Loja, Bag e Biblioteca de conquistas lado a lado e a engrenagem por último.
                Relatório e Sair moram nas Configurações, não no corpo do Perfil. */}
            {desktop ? null : (
            <View style={styles.acoesTopo}>
              {usuario?.id && (classeAtual?.classe_id ?? 0) > 0 ? (
                <View ref={alvoLoja} collapsable={false}>
                  <TouchableOpacity
                    style={styles.btnTopo}
                    onPress={() => setLojaAberta(true)}
                    accessibilityRole="button"
                    accessibilityLabel="Abrir loja"
                  >
                    <UtilityIcon kind="store" size={34} />
                  </TouchableOpacity>
                </View>
              ) : null}
              <TouchableOpacity
                style={styles.btnTopo}
                onPress={() => setBagOpen(true)}
                accessibilityRole="button"
                accessibilityLabel="Abrir minha Bag"
              >
                <UtilityIcon kind="bag" size={34} />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.btnTopo}
                onPress={() => router.push("/(tabs)/perfil/molduras")}
                accessibilityRole="button"
                accessibilityLabel="Molduras"
              >
                <MaterialCommunityIcons name="circle-double" size={30} color={shellPalette.accent} />
              </TouchableOpacity>
              <View ref={profileLibraryGuideRef} collapsable={false}>
                <TouchableOpacity
                  style={styles.btnTopo}
                  onPress={() => router.push("/(tabs)/perfil/biblioteca-conquistas")}
                  accessibilityRole="button"
                  accessibilityLabel="Biblioteca de conquistas"
                >
                  <UtilityIcon kind="achievements" size={34} />
                </TouchableOpacity>
              </View>
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
                {professorNoPerfil}
                {faixaDaTurma}
              </View>
              <View style={styles.colunaPrincipal}>{principal}</View>
            </View>
          ) : (
            <>
              {professorNoPerfil}
                {faixaDaTurma}
              {trocaDePerfil}
              {principal}
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

        {perfilDoProfessorAberto && classeAtual ? (
          <ProfessorProfileModal classeId={Number(classeAtual.classe_id)} accent={shellPalette.accent} centralizado={desktop} onClose={() => setPerfilDoProfessorAberto(false)} />
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
  // Loja, Bag, Biblioteca de conquistas e Configurações numa linha só no canto do banner.
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
  seloEditarFoto: {
    position: "absolute",
    bottom: 2,
    right: 2,
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 3,
  },
  // Quebra a linha quando os dois botões não cabem lado a lado: sem o wrap, em tela
  // estreita "Editar perfil" e "Trocar turma" vazavam pelas duas bordas. Base e teto
  // iguais para os dois, para ficarem da mesma largura lado a lado e empilhados.
  acoesPerfil: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginTop: 14, alignSelf: "stretch", justifyContent: "center" },
  acaoPerfil: {
    flexGrow: 1,
    flexBasis: 140,
    maxWidth: 220,
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
  acaoPerfilTexto: { flexShrink: 1, fontFamily: FontFamily.interMedium, fontSize: 14, fontWeight: "600" },
  infoContainer: { alignItems: "center", gap: 2, paddingTop: 10 },
  faixaXp: { marginTop: 16, marginHorizontal: 14 },
  faixaXpLarga: { marginTop: 16 },
  trocaPerfil: { marginTop: 16, marginHorizontal: 14 },
  trocaPerfilRotulo: { fontFamily: FontFamily.interMedium, fontSize: 11, fontWeight: "700", letterSpacing: 1.1, marginBottom: 8, marginLeft: 2 },
  trocaPerfilLista: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  // gap 6 e respiro direito 8: em 320 px "Conquistador" tinha 88 px para 91 e saía cortado.
  trocaPerfilOpcao: { flexBasis: "45%", flexGrow: 1, minWidth: 0, flexDirection: "row", alignItems: "center", gap: 6, minHeight: 48, paddingVertical: 6, paddingLeft: 8, paddingRight: 8, borderRadius: 12, borderWidth: 1 },
  trocaPerfilTexto: { flex: 1, minWidth: 0 },
  trocaPerfilNome: { fontFamily: FontFamily.interMedium, fontSize: 13.5, fontWeight: "700" },
  trocaPerfilAfinidadeLinha: { flexDirection: "row", alignItems: "center", gap: 3, marginTop: 1 },
  trocaPerfilAfinidade: { fontFamily: FontFamily.interMedium, fontSize: 11 },
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
    marginHorizontal: 14,
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
  listContainer: { paddingHorizontal: 14, marginTop: 10 },
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
