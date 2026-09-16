import { RankingPodium } from "@/components/ranking/RankingPodium";
import { ProfileArtwork } from "@/components/ProfileArtwork";
import {
  SectionGuideButton,
  type SectionGuideScrollable,
  type SectionGuideStep,
} from "@/components/SectionGuideButton";
import { getProfileArtwork, profileEmblems } from "@/constants/designAssets";
import { normalizeBrainHexProfile } from "@/constants/profileImages";
import { useConquistaRank } from "@/context/ConquistaRankContext";
import { useUsuario } from "@/context/SessaoContext";
import { supabase } from "@/database/supabase";
import { useRankingPeople } from "@/hooks/useRankingPeople";
import type { RankPosicao } from "@/models/RankPosicao";
import { FontFamily } from "@/styles/GlobalStyle";
import { getProfileShellPalette } from "@/utils/profileShellTheme";
import { aplicarCorteDoRank, descreverCorte } from "@/utils/rankCorte";
import { formatRankScore } from "@/utils/rankingPodium";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

type Filter = "geral" | "perfil_majoritario" | "outros_perfis";
const filters: { key: Filter; label: string }[] = [
  { key: "geral", label: "Geral" },
  { key: "perfil_majoritario", label: "Meu perfil" },
  { key: "outros_perfis", label: "Outros perfis" },
];

export default function RankDetalheScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const router = useRouter();
  const { ranking, carregando, reloadRanking } = useConquistaRank();
  const { usuario } = useUsuario();
  const profile = usuario?.perfilAtivo ?? usuario?.perfis?.[0]?.nome;
  const palette = getProfileShellPalette(profile);
  const rank = ranking?.ranks.find((item) => item.info.rank_id === Number(id));
  const [filter, setFilter] = useState<Filter>("geral");
  const [total, setTotal] = useState<number | null>(null);
  const ids = useMemo(
    () => (rank?.posicoes ?? []).map((row) => row.id_aluno),
    [rank?.posicoes],
  );
  const {
    profiles,
    photos,
    loading: profilesLoading,
  } = useRankingPeople(
    rank?.info.classe_id,
    ids,
    usuario?.id,
    profile,
    usuario?.foto_url,
  );
  const ownProfile = normalizeBrainHexProfile(profile);
  const cutoff = useMemo(
    () => aplicarCorteDoRank(rank?.posicoes ?? [], usuario?.id ?? null),
    [rank?.posicoes, usuario?.id],
  );
  const filtered = useMemo(
    () =>
      cutoff.visiveis.filter(
        (row) =>
          filter === "geral" ||
          (filter === "perfil_majoritario"
            ? !!ownProfile && profiles[row.id_aluno]?.key === ownProfile
            : !ownProfile || profiles[row.id_aluno]?.key !== ownProfile),
      ),
    [cutoff.visiveis, filter, profiles, ownProfile],
  );
  const notice = descreverCorte(cutoff, total);
  const listRef = useRef<FlatList<RankPosicao> | null>(null);
  const scrollOffsetRef = useRef(0);
  const headerRef = useRef<View | null>(null);
  const filtersRef = useRef<View | null>(null);
  const myRef = useRef<View | null>(null);
  const targets = useMemo(
    () => ({
      rank_detail_header: headerRef,
      rank_detail_filters: filtersRef,
      rank_detail_me: myRef,
    }),
    [],
  );
  const steps = useMemo<SectionGuideStep[]>(
    () => [
      {
        id: "podium",
        target: "rank_detail_header",
        title: "Pódio da turma",
        description:
          "Os três primeiros lugares seguem a classificação geral desta categoria. Empates mantêm a mesma posição.",
        icon: "podium",
      },
      {
        id: "filters",
        target: "rank_detail_filters",
        title: "Classificação",
        description:
          "Os filtros se aplicam à lista. As posições originais da categoria são preservadas.",
        icon: "filter-variant",
      },
      ...(cutoff.minhaLinha
        ? [
            {
              id: "me",
              target: "rank_detail_me",
              title: "Sua posição",
              description:
                "Sua colocação geral permanece visível no rodapé, mesmo ao filtrar os colegas.",
              icon: "account-star-outline" as const,
            },
          ]
        : []),
    ],
    [cutoff.minhaLinha],
  );
  const classeId = rank?.info.classe_id;
  useEffect(() => {
    let active = true;
    setTotal(null);
    if (!classeId) return;
    void supabase
      .from("classe_aluno")
      .select("aluno_id", { count: "exact", head: true })
      .eq("classe_id", classeId)
      .then(({ count, error }) => {
        if (active) setTotal(error ? null : count);
      });
    return () => {
      active = false;
    };
  }, [classeId]);

  const scoreLabel =
    rank?.info.criterio === "tempo"
      ? "Tempo"
      : rank?.info.criterio === "percentual"
        ? "Progresso"
        : "Pontos";
  return (
    <View style={[s.screen, { backgroundColor: palette.background }]}>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={s.screen} edges={["top", "left", "right"]}>
        <View style={[s.topbar, { borderBottomColor: palette.border }]}>
          <Pressable
            onPress={() => router.back()}
            accessibilityRole="button"
            accessibilityLabel="Voltar aos rankings"
            style={s.back}
          >
            <MaterialCommunityIcons
              name="arrow-left"
              size={22}
              color={palette.accent}
            />
            <Text style={[s.backLabel, { color: palette.text }]}>Rankings</Text>
          </Pressable>
          <SectionGuideButton
            profile={profile}
            sectionTitle="Classificação"
            steps={steps}
            targetRefs={targets}
            scrollRef={
              listRef as unknown as React.RefObject<SectionGuideScrollable | null>
            }
            scrollOffsetRef={scrollOffsetRef}
          />
        </View>
        {!rank ? (
          carregando ? (
            <ActivityIndicator color={palette.accent} style={s.empty} />
          ) : (
            <Text style={[s.empty, { color: palette.textMuted }]}>
              Ranking não encontrado.
            </Text>
          )
        ) : (
          <>
            <FlatList
              ref={listRef}
              data={profilesLoading && filter !== "geral" ? [] : filtered}
              keyExtractor={(row) => `${row.rank_id}-${row.id_aluno}`}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={s.listContent}
              scrollEventThrottle={16}
              onScroll={(event) => {
                scrollOffsetRef.current = event.nativeEvent.contentOffset.y;
              }}
              refreshControl={
                <RefreshControl
                  refreshing={carregando}
                  onRefresh={() => void reloadRanking()}
                  tintColor={palette.accent}
                />
              }
              ListHeaderComponent={
                <>
                  <View ref={headerRef} collapsable={false} style={s.hero}>
                    <View style={s.scenery} pointerEvents="none">
                      <Image
                        source={getProfileArtwork(profile, "rank")}
                        style={s.sceneryImage}
                        resizeMode="cover"
                        accessible={false}
                      />
                      <LinearGradient
                        colors={[
                          `${palette.background}60`,
                          `${palette.background}b0`,
                          palette.background,
                        ]}
                        locations={[0, 0.5, 1]}
                        style={StyleSheet.absoluteFill}
                      />
                    </View>
                    <View style={s.heading}>
                      <Text style={[s.eyebrow, { color: palette.accent }]}>
                        SALA DE HONRA
                      </Text>
                      <Text style={[s.title, { color: palette.text }]}>
                        {rank.info.nome_rank}
                      </Text>
                      {rank.info.descricao ? (
                        <Text
                          style={[s.subtitle, { color: palette.textMuted }]}
                        >
                          {rank.info.descricao}
                        </Text>
                      ) : null}
                    </View>
                    <RankingPodium
                      rows={rank.posicoes}
                      criterion={rank.info.criterio}
                      palette={palette}
                      userId={usuario?.id}
                      profiles={profiles}
                      photos={photos}
                    />
                  </View>
                  <View
                    ref={filtersRef}
                    collapsable={false}
                    style={s.filtersSection}
                  >
                    <Text style={[s.sectionTitle, { color: palette.text }]}>
                      Classificação
                    </Text>
                    <View
                      style={[s.filters, { borderBottomColor: palette.border }]}
                    >
                      {filters.map((item) => (
                        <Pressable
                          key={item.key}
                          accessibilityRole="tab"
                          accessibilityState={{ selected: filter === item.key }}
                          onPress={() => setFilter(item.key)}
                          style={[
                            s.filter,
                            {
                              borderBottomColor:
                                filter === item.key
                                  ? palette.accent
                                  : "transparent",
                            },
                          ]}
                        >
                          <Text
                            style={[
                              s.filterText,
                              {
                                color:
                                  filter === item.key
                                    ? palette.accent
                                    : palette.textMuted,
                              },
                            ]}
                          >
                            {item.label}
                          </Text>
                        </Pressable>
                      ))}
                    </View>
                    <View style={s.listHeading}>
                      <Text
                        style={[s.columnLabel, { color: palette.textSubtle }]}
                      >
                        ALUNO
                      </Text>
                      <Text
                        style={[s.columnLabel, { color: palette.textSubtle }]}
                      >
                        {scoreLabel.toUpperCase()}
                      </Text>
                    </View>
                  </View>
                </>
              }
              renderItem={({ item }) => {
                const me = item.id_aluno === usuario?.id;
                const personProfile = profiles[item.id_aluno];
                return (
                  <View
                    style={[
                      s.row,
                      {
                        borderBottomColor: palette.border,
                        backgroundColor: me
                          ? palette.surface
                          : palette.background,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        s.position,
                        { color: me ? palette.accent : palette.textMuted },
                      ]}
                    >
                      {item.posicao ? `${item.posicao}º` : "--"}
                    </Text>
                    {personProfile?.key ? (
                      <ProfileArtwork
                        source={profileEmblems[personProfile.key]}
                        profile={profile}
                        width={32}
                        height={38}
                        style={s.emblem}
                      />
                    ) : (
                      <View style={s.emblem}>
                        <MaterialCommunityIcons
                          name="account-outline"
                          color={palette.textSubtle}
                          size={25}
                        />
                      </View>
                    )}
                    <View style={s.student}>
                      <Text style={[s.studentName, { color: palette.text }]}>
                        {item.nome_aluno}
                        {me ? " (Você)" : ""}
                      </Text>
                      <Text style={[s.profile, { color: palette.textMuted }]}>
                        {personProfile?.label ?? "Perfil não definido"}
                      </Text>
                    </View>
                    <Text
                      style={[
                        s.score,
                        { color: me ? palette.accent : palette.text },
                      ]}
                    >
                      {formatRankScore(item.pontuacao, rank.info.criterio)}
                    </Text>
                  </View>
                );
              }}
              ListEmptyComponent={
                profilesLoading && filter !== "geral" ? (
                  <ActivityIndicator color={palette.accent} style={s.empty} />
                ) : (
                  <Text style={[s.empty, { color: palette.textMuted }]}>
                    Nenhum aluno neste recorte.
                  </Text>
                )
              }
              ListFooterComponent={
                notice ? (
                  <Text style={[s.notice, { color: palette.textMuted }]}>
                    {notice}
                  </Text>
                ) : null
              }
            />
            {cutoff.minhaLinha ? (
              <View
                ref={myRef}
                collapsable={false}
                style={[
                  s.myPosition,
                  {
                    backgroundColor: palette.surfaceElevated,
                    borderTopColor: palette.borderStrong,
                  },
                ]}
              >
                <Text style={[s.myPlace, { color: palette.accent }]}>
                  {cutoff.minhaLinha.posicao
                    ? `${cutoff.minhaLinha.posicao}º`
                    : "--"}
                </Text>
                <View style={s.student}>
                  <Text style={[s.myLabel, { color: palette.text }]}>
                    Sua posição
                  </Text>
                  <Text style={[s.profile, { color: palette.textMuted }]}>
                    Classificação geral
                  </Text>
                </View>
                <Text style={[s.myScore, { color: palette.text }]}>
                  {formatRankScore(
                    cutoff.minhaLinha.pontuacao,
                    rank.info.criterio,
                  )}
                </Text>
              </View>
            ) : null}
          </>
        )}
      </SafeAreaView>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1 },
  topbar: {
    minHeight: 56,
    paddingHorizontal: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottomWidth: 1,
  },
  back: { minHeight: 44, flexDirection: "row", alignItems: "center", gap: 10 },
  backLabel: { fontSize: 14, fontWeight: "600" },
  listContent: { paddingBottom: 20 },
  hero: { paddingHorizontal: 20, overflow: "hidden" },
  scenery: { ...StyleSheet.absoluteFillObject },
  sceneryImage: { width: "100%", height: "100%", opacity: 0.75 },
  heading: { paddingTop: 24, gap: 7 },
  eyebrow: { fontSize: 10, fontWeight: "700" },
  title: { fontFamily: FontFamily.inikaBold, fontSize: 27, lineHeight: 34 },
  subtitle: { fontSize: 12, lineHeight: 18, maxWidth: 300 },
  filtersSection: { paddingHorizontal: 20 },
  sectionTitle: {
    fontFamily: FontFamily.inikaBold,
    fontSize: 22,
    marginTop: 10,
    marginBottom: 8,
  },
  filters: { flexDirection: "row", borderBottomWidth: 1, gap: 12 },
  filter: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 14,
    borderBottomWidth: 2,
  },
  filterText: { fontSize: 12, fontWeight: "600", textAlign: "center" },
  listHeading: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: 20,
    paddingBottom: 10,
  },
  columnLabel: { fontSize: 10, fontWeight: "600" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 80,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    gap: 10,
  },
  position: { width: 26, fontFamily: FontFamily.inikaBold, fontSize: 17 },
  emblem: {
    width: 32,
    height: 38,
    alignItems: "center",
    justifyContent: "center",
  },
  student: { flex: 1, minWidth: 0 },
  studentName: { fontSize: 13, lineHeight: 19, fontWeight: "600" },
  profile: { fontSize: 10, lineHeight: 15, marginTop: 3 },
  score: { width: 64, fontSize: 13, fontWeight: "700", textAlign: "right" },
  myPosition: {
    flexDirection: "row",
    alignItems: "center",
    gap: 14,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderTopWidth: 1,
  },
  myPlace: { fontFamily: FontFamily.inikaBold, fontSize: 26 },
  myLabel: { fontSize: 13, fontWeight: "700" },
  myScore: { fontSize: 18, fontWeight: "700" },
  empty: { margin: 36, textAlign: "center" },
  notice: { padding: 20, fontSize: 12, lineHeight: 18, textAlign: "center" },
});
