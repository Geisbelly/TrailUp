import CardSemDados from "@/components/CardSemDados";
import { HallBackground, OrnamentDivider } from "@/components/HallTheme";
import { LoadingState } from "@/components/LoadingState";
import {
  SectionGuideButton,
  SectionGuideScrollable,
  SectionGuideStep,
} from "@/components/SectionGuideButton";
import {
  BrainHexProfile,
  getBrainHexConfig,
  normalizeBrainHexProfile,
} from "@/constants/profileImages";
import { useConquistaRank } from "@/context/ConquistaRankContext";
import { useUsuario } from "@/context/SessaoContext";
import { supabase } from "@/database/supabase";
import { Color, FontFamily } from "@/styles/GlobalStyle";
import { getProfileShellPalette } from "@/utils/profileShellTheme";
import { getProfileGuideEmphasis } from "@/utils/profileSectionGuide";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { Stack, useLocalSearchParams, useNavigation } from "expo-router";
import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Dimensions,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import tinycolor from "tinycolor2";

const { height: SCREEN_H } = Dimensions.get("window");

type RankFilter = "geral" | "perfil_majoritario" | "outros_perfis";

type DominantProfileMeta = {
  key: BrainHexProfile | null;
  label: string;
};

type RankPosicaoRow = {
  rank_id: number;
  id_aluno: string;
  posicao: number | null;
  nome_aluno: string;
  pontuacao: number | null;
  medalha: string | null;
};

type AlunoPerfilRow = {
  aluno_id: string;
  afinidade: number | null;
  perfil: { nome: string | null } | null;
};

const medalMap: Record<string, any> = {
  ouro: require("@/assets/icones/rank/2.png"),
  prata: require("@/assets/icones/rank/4.png"),
  bronze: require("@/assets/icones/rank/1.png"),
  diamante: require("@/assets/icones/rank/3.png"),
};

const getMedalImage = (nome?: string | null) => {
  if (!nome) return null;
  const key = nome.toLowerCase().trim().split(" ")[0];
  return medalMap[key] ?? null;
};

function getDominantProfileLabel(profile: BrainHexProfile | null) {
  if (!profile) return "Perfil não definido";
  return getBrainHexConfig(profile).label;
}

const FILTER_LABELS: Record<RankFilter, string> = {
  geral: "Geral",
  perfil_majoritario: "Meu perfil",
  outros_perfis: "Outros perfis",
};

function formatPontuacao(valor: number | null | undefined, criterio: string | null) {
  const numero = valor ?? 0;
  if (criterio === "percentual") {
    return `${numero.toFixed(0)}%`;
  }
  if (criterio === "tempo") {
    const minutos = Math.round(numero);
    if (minutos < 60) return `${minutos} min`;
    const horas = Math.floor(minutos / 60);
    const restoMin = minutos % 60;
    return restoMin > 0 ? `${horas}h ${restoMin}min` : `${horas}h`;
  }
  return numero.toFixed(0);
}

function getPontuacaoColumnLabel(criterio: string | null) {
  if (criterio === "percentual") return "%";
  if (criterio === "tempo") return "Tempo";
  return "Pts.";
}

export default function RankDetalheScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const rankId = id ? Number(id) : null;
  const navigation = useNavigation();

  const { ranking, carregando } = useConquistaRank();
  const { usuario } = useUsuario();
  const activeProfile = usuario?.perfilAtivo ?? usuario?.perfis?.[0]?.nome ?? null;
  const palette = getProfileShellPalette(activeProfile);
  const profileEmphasis = getProfileGuideEmphasis(activeProfile, "ranking");

  const gold = tinycolor(palette.accent).lighten(10).toHexString();
  const goldDim = tinycolor(palette.accent).setAlpha(0.55).toRgbString();

  const [filtro, setFiltro] = useState<RankFilter>("geral");
  const [perfisCarregando, setPerfisCarregando] = useState(false);
  const [perfilDominantePorAluno, setPerfilDominantePorAluno] = useState<Record<string, DominantProfileMeta>>({});
  const rankHeaderGuideRef = useRef<View | null>(null);

  // Entregue ao guia: sem isso ele descreve linhas fora da tela.
  const listaRef = useRef<FlatList>(null);
  // `scrollTo` quer posicao ABSOLUTA e `measureInWindow` devolve posicao na
  // TELA; o deslocamento atual e o que converte uma na outra.
  const scrollOffsetRef = useRef(0);
  const rankFiltersGuideRef = useRef<View | null>(null);
  const rankMyPositionGuideRef = useRef<View | null>(null);

  const meuPerfilMajoritario = normalizeBrainHexProfile(usuario?.perfis?.[0]?.nome ?? null);
  const meuPerfilLabel = getDominantProfileLabel(meuPerfilMajoritario);

  // Pulse animation for the crown icon
  const crownPulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(crownPulse, { toValue: 1, duration: 2200, useNativeDriver: true }),
        Animated.timing(crownPulse, { toValue: 0, duration: 2200, useNativeDriver: true }),
      ])
    ).start();
  }, [crownPulse]);
  const crownScale = crownPulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.07] });
  const crownOpacity = crownPulse.interpolate({ inputRange: [0, 1], outputRange: [0.82, 1] });

  const rank = useMemo(
    () => ranking?.ranks.find((r) => r.info.rank_id === rankId) ?? null,
    [ranking?.ranks, rankId]
  );

  useLayoutEffect(() => {
    navigation.setOptions({
      headerTitle: "",
      headerTransparent: true,
      headerTintColor: gold,
      headerStyle: { backgroundColor: "transparent" },
      headerShadowVisible: false,
    });
  }, [navigation, gold]);

  useEffect(() => {
    const alunoIds = Array.from(
      new Set((rank?.posicoes ?? []).map((item) => String(item.id_aluno)).filter(Boolean))
    );

    if (!alunoIds.length) {
      setPerfilDominantePorAluno({});
      setPerfisCarregando(false);
      return;
    }

    let ativo = true;
    setPerfisCarregando(true);

    const carregarPerfis = async () => {
      const { data, error } = await supabase
        .from("aluno_perfil")
        .select("aluno_id, afinidade, perfil:perfil_id(nome)")
        .in("aluno_id", alunoIds)
        .order("aluno_id", { ascending: true })
        .order("afinidade", { ascending: false });

      if (!ativo) return;

      if (error) {
        console.warn("[Ranking] Falha ao carregar perfis majoritários:", error);
        setPerfilDominantePorAluno({});
        setPerfisCarregando(false);
        return;
      }

      const rows = (data ?? []) as unknown as AlunoPerfilRow[];
      const dominantes: Record<string, DominantProfileMeta> = {};

      rows.forEach((row) => {
        const alunoId = String(row.aluno_id ?? "");
        if (!alunoId || dominantes[alunoId]) return;

        const normalized = normalizeBrainHexProfile(row.perfil?.nome ?? null);
        dominantes[alunoId] = {
          key: normalized,
          label: getDominantProfileLabel(normalized),
        };
      });

      alunoIds.forEach((alunoId) => {
        if (!dominantes[alunoId]) {
          dominantes[alunoId] = { key: null, label: "Perfil não definido" };
        }
      });

      setPerfilDominantePorAluno(dominantes);
      setPerfisCarregando(false);
    };

    void carregarPerfis();
    return () => { ativo = false; };
  }, [rank?.posicoes]);

  const posicoes = useMemo(
    () => (rank?.posicoes ?? []) as RankPosicaoRow[],
    [rank?.posicoes]
  );

  const contagens = useMemo(() => {
    const geral = posicoes.length;
    const perfilMajoritario = !meuPerfilMajoritario
      ? 0
      : posicoes.filter((item) => perfilDominantePorAluno[item.id_aluno]?.key === meuPerfilMajoritario).length;
    const outrosPerfis = !meuPerfilMajoritario
      ? posicoes.length
      : posicoes.filter((item) => perfilDominantePorAluno[item.id_aluno]?.key !== meuPerfilMajoritario).length;
    return { geral, perfil_majoritario: perfilMajoritario, outros_perfis: outrosPerfis };
  }, [posicoes, perfilDominantePorAluno, meuPerfilMajoritario]);

  const posicoesFiltradas = useMemo(() => {
    if (filtro === "geral") return posicoes;
    if (filtro === "perfil_majoritario") {
      if (!meuPerfilMajoritario) return [];
      return posicoes.filter((item) => perfilDominantePorAluno[item.id_aluno]?.key === meuPerfilMajoritario);
    }
    if (!meuPerfilMajoritario) return posicoes;
    return posicoes.filter((item) => perfilDominantePorAluno[item.id_aluno]?.key !== meuPerfilMajoritario);
  }, [filtro, posicoes, perfilDominantePorAluno, meuPerfilMajoritario]);

  const myRankData = useMemo(() => {
    if (!usuario?.id) return null;
    return posicoes.find((p) => p.id_aluno === usuario.id) ?? null;
  }, [posicoes, usuario?.id]);

  const textoFiltro = useMemo(() => {
    if (filtro === "perfil_majoritario") {
      return meuPerfilMajoritario
        ? `Alunos com perfil majoritário: ${meuPerfilLabel}`
        : "Seu perfil majoritário ainda não está definido.";
    }
    if (filtro === "outros_perfis") {
      return meuPerfilMajoritario
        ? `Alunos de perfis diferentes de ${meuPerfilLabel}`
        : "Todos os perfis (seu perfil não definido)";
    }
    return "Classificação geral da turma";
  }, [filtro, meuPerfilLabel, meuPerfilMajoritario]);

  const rankDetailGuideSteps = useMemo<SectionGuideStep[]>(() => {
    const criterio = String(rank?.info.criterio ?? "").toLowerCase();
    const scoreDescription =
      criterio === "percentual"
        ? "A coluna % mostra o percentual concluído da trilha, de 0 a 100. A ordem segue esse avanço registrado."
        : criterio === "tempo"
        ? "A coluna Tempo mostra o estudo acumulado e formata o resultado em minutos ou horas. A posição segue o critério de tempo configurado para esta categoria."
        : "A coluna Pts. mostra a pontuação acumulada conforme as regras desta categoria. A classificação é ordenada por esse resultado.";

    return [
      {
        id: "rank-detail-header",
        target: "rank_detail_header",
        title: rank?.info.nome_rank ?? "Classificação",
        description: `${rank?.info.descricao ?? "O cabeçalho informa qual categoria e critério estão sendo consultados."} ${profileEmphasis}`,
        icon: "shield-crown-outline",
      },
      {
        id: "rank-detail-filters",
        target: "rank_detail_filters",
        title: "Filtros por perfil",
        description:
          "Geral mostra toda a turma; Meu perfil mostra alunos com o mesmo perfil BrainHex majoritário que o seu; Outros perfis mostra os demais. O número em cada botão é a quantidade de alunos no recorte.",
        icon: "filter-variant",
      },
      {
        id: "rank-detail-position",
        target: "rank_detail_explanation",
        title: "Posição e medalha",
        description:
          "Pos. é a colocação do aluno. Rank mostra a medalha cadastrada; as três primeiras posições recebem destaque visual de ouro, prata e bronze quando disponíveis.",
        icon: "medal-outline",
      },
      {
        id: "rank-detail-student",
        target: "rank_detail_explanation",
        title: "Aluno e perfil",
        description:
          "A coluna Aluno mostra o nome e, abaixo, o perfil BrainHex de maior afinidade. Sua linha recebe a indicação “Você” e uma cor de destaque.",
        icon: "account-outline",
      },
      {
        id: "rank-detail-score",
        target: "rank_detail_explanation",
        title: "Valor da classificação",
        description: scoreDescription,
        icon: "chart-line",
      },
      ...(myRankData
        ? [{
            id: "rank-detail-me",
            target: "rank_detail_me",
            title: "Sua posição fixa",
            description:
              "O rodapé mantém sua própria colocação visível mesmo enquanto você percorre a lista. Ele usa os dados da classificação geral, independentemente do filtro selecionado.",
            icon: "account-star-outline" as const,
          }]
        : []),
    ];
  }, [myRankData, profileEmphasis, rank?.info.criterio, rank?.info.descricao, rank?.info.nome_rank]);
  const rankDetailGuideTargets = useMemo(
    () => ({
      rank_detail_header: rankHeaderGuideRef,
      rank_detail_filters: rankFiltersGuideRef,
      rank_detail_me: rankMyPositionGuideRef,
    }),
    [],
  );

  if (carregando) {
    return (
      <View style={[s.screen, { backgroundColor: palette.background }]}>
        <LoadingState title="Carregando" message="Atualizando tabela de ranking..." />
      </View>
    );
  }

  if (!rank) {
    return (
      <View style={[s.screen, { backgroundColor: palette.background }]}>
        <CardSemDados title="Indisponível" description="Ranking não encontrado." accentColor={palette.accent} />
      </View>
    );
  }

  const RankRow = ({
    item,
    index,
    isFooter = false,
  }: {
    item: RankPosicaoRow;
    index?: number;
    isFooter?: boolean;
  }) => {
    const isTop3 = (item.posicao || 0) <= 3;
    const isMe = usuario?.id === item.id_aluno;

    const perfilAluno = perfilDominantePorAluno[item.id_aluno] ?? {
      key: null,
      label: "Perfil não definido",
    };

    const medalSource = getMedalImage(item.medalha);

    const medalStyles: Record<number, { backgroundColor: string; borderLeftColor: string }> = {
      1: {
        backgroundColor: tinycolor("#FFD700").setAlpha(0.12).toRgbString(),
        borderLeftColor: "#FFD700",
      },
      2: {
        backgroundColor: tinycolor("#C0C0C0").setAlpha(0.12).toRgbString(),
        borderLeftColor: "#C0C0C0",
      },
      3: {
        backgroundColor: tinycolor("#CD7F32").setAlpha(0.12).toRgbString(),
        borderLeftColor: "#CD7F32",
      },
    };

    const getRowStyle = () => {
      if (isFooter) return {};
      if (isMe) {
        return {
          backgroundColor: palette.accentMuted,
          borderLeftWidth: 3,
          borderLeftColor: palette.accent,
          marginLeft: -3,
        };
      }
      if (item.posicao && medalStyles[item.posicao]) {
        return { ...medalStyles[item.posicao], borderLeftWidth: 3, marginLeft: -3 };
      }
      if ((index ?? 0) % 2 !== 0) {
        return { backgroundColor: tinycolor(palette.surface).setAlpha(0.22).toRgbString() };
      }
      return {};
    };

    return (
      <View style={[s.tableRow, getRowStyle()]}>
        {/* Posição */}
        <View style={s.colPos}>
          <Text
            style={[
              s.cellTextBold,
              isTop3 && s.textHighlight,
              !isMe && item.posicao === 1 && { color: "#FFD700" },
              !isMe && item.posicao === 2 && { color: "#C0C0C0" },
              !isMe && item.posicao === 3 && { color: "#CD7F32" },
              { color: isMe ? gold : undefined },
            ]}
          >
            #{item.posicao}
          </Text>
        </View>

        <View style={[s.verticalDivider, { backgroundColor: goldDim }]} />

        {/* Medalha/Rank */}
        <View style={s.colClass}>
          {medalSource ? (
            <Image source={medalSource} style={s.medalIcon} resizeMode="contain" />
          ) : (
            <Text style={[s.cellTextSmall, { color: palette.textSubtle }]}>
              {item.medalha ? item.medalha.charAt(0).toUpperCase() : "—"}
            </Text>
          )}
        </View>

        <View style={[s.verticalDivider, { backgroundColor: goldDim }]} />

        {/* Nome + perfil */}
        <View style={s.colNome}>
          <Text
            style={[
              s.cellText,
              { color: palette.textMuted },
              isMe && { color: gold, fontFamily: FontFamily.inikaBold },
            ]}
            numberOfLines={1}
          >
            {item.nome_aluno}
            {isMe && !isFooter ? " (Você)" : ""}
          </Text>
          <Text style={[s.profileHint, { color: palette.textSubtle }]} numberOfLines={1}>
            {perfilAluno.label}
          </Text>
        </View>

        <View style={[s.verticalDivider, { backgroundColor: goldDim }]} />

        {/* Pontuação */}
        <View style={s.colPts}>
          <Text style={[s.cellTextBold, { color: isMe ? gold : palette.text }]}>
            {formatPontuacao(item.pontuacao, rank.info.criterio)}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <View style={[s.screen, { backgroundColor: palette.background }]}>
      {/* ── Fundo do salão ── */}
      <HallBackground palette={palette} />

      {/* ── Gradiente candelabro ── */}
      <LinearGradient
        colors={[
          tinycolor(palette.accent).setAlpha(0.22).toRgbString(),
          tinycolor(palette.accent).setAlpha(0.06).toRgbString(),
          "transparent",
        ]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={[StyleSheet.absoluteFill, { height: SCREEN_H * 0.45 }]}
        pointerEvents="none"
      />

      <SafeAreaView style={{ flex: 1 }} edges={["top"]}>
        {/* Guia no cabecalho da tela: mesmo lugar em toda pagina com header,
            sem flutuar sobre o conteudo nem depender de offset por pagina. */}
        <Stack.Screen
          options={{
            headerRight: () => (
              <SectionGuideButton
                profile={activeProfile}
                sectionTitle="Classificação"
                steps={rankDetailGuideSteps}
                targetRefs={rankDetailGuideTargets}
                scrollRef={listaRef as unknown as React.RefObject<SectionGuideScrollable | null>}
          scrollOffsetRef={scrollOffsetRef}
                style={s.guideButton}
              />
            ),
          }}
        />
        {/* ══════════ HEADER ══════════ */}
        <View ref={rankHeaderGuideRef} collapsable={false} style={s.header}>
          <Animated.View style={{ transform: [{ scale: crownScale }], opacity: crownOpacity }}>
            <MaterialCommunityIcons name="shield-crown" size={46} color={gold} />
          </Animated.View>

          <Text style={[s.headerTitle, { color: gold }]}>
            {(rank.info.nome_rank ?? "Ranking").toUpperCase()}
          </Text>

          <OrnamentDivider color={gold} />

          {rank.info.descricao ? (
            <Text style={[s.headerSubtitle, { color: palette.textMuted }]}>
              {rank.info.descricao}
            </Text>
          ) : null}
        </View>

        {/* ══════════ ABAS DE FILTRO ══════════ */}
        <View ref={rankFiltersGuideRef} collapsable={false} style={s.filtersRow}>
          {(["geral", "perfil_majoritario", "outros_perfis"] as RankFilter[]).map((f) => {
            const active = filtro === f;
            return (
              <Pressable
                key={f}
                style={[
                  s.filterBtn,
                  { borderColor: active ? gold : goldDim },
                  active && { backgroundColor: palette.accentMuted },
                ]}
                onPress={() => setFiltro(f)}
              >
                <Text style={[s.filterLabel, { color: active ? gold : palette.textMuted }]}>
                  {FILTER_LABELS[f]}
                </Text>
                <Text style={[s.filterCount, { color: active ? goldDim : palette.textSubtle }]}>
                  {contagens[f]}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Descrição do filtro */}
        <Text style={[s.filterDesc, { color: palette.textSubtle }]}>{textoFiltro}</Text>

        {/* ══════════ CABEÇALHO DA TABELA ══════════ */}
        <LinearGradient
          colors={[palette.surfaceElevated, palette.surface]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[s.tableHeader, { borderTopColor: goldDim, borderBottomColor: goldDim }]}
        >
          <Text style={[s.colHeader, s.colPos, { color: gold }]}>Pos.</Text>
          <Text style={[s.colHeader, s.colClass, { color: gold }]}>Rank</Text>
          <Text style={[s.colHeader, s.colNome, { color: gold }]}>Aluno</Text>
          <Text style={[s.colHeader, s.colPts, { color: gold }]}>
            {getPontuacaoColumnLabel(rank.info.criterio)}
          </Text>
        </LinearGradient>

        {/* ══════════ LISTA ══════════ */}
        <FlatList
          ref={listaRef}
          scrollEventThrottle={16}
          onScroll={(e) => {
            scrollOffsetRef.current = e.nativeEvent.contentOffset.y;
          }}
          data={posicoesFiltradas}
          keyExtractor={(item, idx) => `${item.rank_id}-${item.id_aluno}-${idx}`}
          contentContainerStyle={s.listContent}
          showsVerticalScrollIndicator={false}
          renderItem={({ item, index }) => <RankRow item={item} index={index} />}
          ListEmptyComponent={
            <Text style={[s.emptyText, { color: palette.textSubtle }]}>
              Nenhum dado encontrado para este recorte.
            </Text>
          }
          ListHeaderComponent={
            perfisCarregando ? (
              <Text style={[s.loadingHint, { color: palette.textSubtle }]}>
                Carregando perfis...
              </Text>
            ) : null
          }
        />

        {/* ══════════ FOOTER — SUA POSIÇÃO ══════════ */}
        {myRankData && (
          <View
            ref={rankMyPositionGuideRef}
            collapsable={false}
            style={[s.footerContainer, { backgroundColor: palette.surfaceElevated }]}
          >
            {/* Borda topo dourada */}
            <LinearGradient
              colors={["transparent", gold, "transparent"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={s.footerBorderTop}
            />
            {/* Ornamento micro */}
            <View style={s.footerOrnRow}>
              <OrnamentDivider color={gold} />
            </View>
            {/* Linha do usuário */}
            <View style={[s.footerContent, { backgroundColor: palette.accentMuted }]}>
              <RankRow item={myRankData} isFooter />
            </View>
          </View>
        )}
      </SafeAreaView>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: Color.background },
  guideButton: {
    marginRight: 12,
  },

  // Header
  header: {
    alignItems: "center",
    marginTop: 10,
    marginBottom: 10,
    paddingHorizontal: 20,
    gap: 4,
  },
  headerTitle: {
    fontFamily: FontFamily.inikaBold,
    fontSize: 22,
    letterSpacing: 2,
    textShadowColor: "rgba(0,0,0,0.9)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
    marginTop: 4,
  },
  headerSubtitle: {
    fontFamily: FontFamily.interMedium,
    fontSize: 12,
    letterSpacing: 0.5,
    textAlign: "center",
    paddingHorizontal: 16,
    marginTop: 2,
  },

  // Filtros
  filtersRow: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 12,
    marginBottom: 4,
  },
  filterBtn: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 6,
    alignItems: "center",
  },
  filterLabel: {
    fontFamily: FontFamily.inikaBold,
    fontSize: 11,
  },
  filterCount: {
    fontFamily: FontFamily.interMedium,
    fontSize: 10,
    marginTop: 2,
  },
  filterDesc: {
    fontFamily: FontFamily.interMedium,
    fontSize: 11,
    paddingHorizontal: 12,
    marginBottom: 6,
    textAlign: "center",
  },

  // Cabeçalho da tabela
  tableHeader: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderBottomWidth: 1,
    paddingVertical: 10,
    paddingHorizontal: 10,
  },
  colPos: { width: 50, alignItems: "center" },
  colNome: { flex: 1, paddingLeft: 10, alignItems: "flex-start" },
  colClass: { width: 60, alignItems: "center" },
  colPts: { width: 70, alignItems: "center" },
  colHeader: {
    fontFamily: FontFamily.inikaBold,
    fontSize: 12,
    textAlign: "center",
  },

  // Linhas
  listContent: { paddingBottom: 120 },
  tableRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 10,
  },
  verticalDivider: {
    width: 1,
    height: 20,
    opacity: 0.22,
    marginHorizontal: 2,
  },
  cellText: {
    fontFamily: FontFamily.inikaBold,
    fontSize: 13,
  },
  cellTextBold: {
    fontFamily: FontFamily.inikaBold,
    fontSize: 14,
    color: "#FFF",
  },
  textHighlight: { fontSize: 15 },
  cellTextSmall: {
    fontFamily: FontFamily.inikaBold,
    fontSize: 12,
    letterSpacing: 2,
  },
  profileHint: {
    fontFamily: FontFamily.interMedium,
    fontSize: 11,
    marginTop: 2,
  },
  loadingHint: {
    textAlign: "center",
    fontFamily: FontFamily.interMedium,
    marginTop: 8,
    marginBottom: 2,
    fontSize: 12,
  },
  emptyText: {
    textAlign: "center",
    marginTop: 24,
    fontFamily: FontFamily.interMedium,
    fontSize: 13,
  },
  medalIcon: { width: 24, height: 24 },

  // Footer
  footerContainer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -5 },
    shadowOpacity: 0.55,
    shadowRadius: 12,
    elevation: 20,
    zIndex: 100,
  },
  footerBorderTop: { height: 1, width: "100%" },
  footerOrnRow: {
    paddingHorizontal: 20,
    transform: [{ scaleY: 0.75 }],
    opacity: 0.65,
  },
  footerContent: {},
});
