import {
  Corner,
  HallBackground,
  OrnamentDivider,
} from "@/components/HallTheme";
import {
  SectionGuideButton,
  type SectionGuideStep,
} from "@/components/SectionGuideButton";
import { journeyObjects } from "@/constants/designAssets";
import { ProfileArtwork } from "@/components/ProfileArtwork";
import { JourneySymbol } from "@/components/JourneySymbol";
import { useConquistaRank } from "@/context/ConquistaRankContext";
import { useUsuario } from "@/context/SessaoContext";
import { Color, FontFamily } from "@/styles/GlobalStyle";
import { getProfileShellPalette } from "@/utils/profileShellTheme";
import { registrarAlvoTour } from "@/utils/tourTargets";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useEffect, useMemo, useRef } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

export default function RankingHome() {
  const { ranking, carregando, reloadRanking } = useConquistaRank();
  const { usuario } = useUsuario();
  const router = useRouter();
  const profile = usuario?.perfilAtivo ?? usuario?.perfis?.[0]?.nome;
  const palette = getProfileShellPalette(profile);
  const ranks = ranking?.ranks ?? [];
  const headerRef = useRef<View | null>(null);
  const categoriesRef = useRef<View | null>(null);
  const sampleRef = useRef<View | null>(null);
  const scrollRef = useRef<ScrollView | null>(null);
  const targets = useMemo(
    () => ({ ranking_header: headerRef, ranking_categories: categoriesRef }),
    [],
  );
  const steps = useMemo<SectionGuideStep[]>(
    () => [
      {
        id: "ranking-header",
        target: "ranking_header",
        title: "Sala de honra",
        description:
          "Cada categoria reconhece um resultado diferente da sua jornada.",
        icon: "podium",
      },
      {
        id: "ranking-categories",
        target: "ranking_categories",
        title: "Classificações",
        description:
          "Abra uma categoria para ver o pódio, sua posição e os resultados da turma.",
        icon: "trophy-outline",
      },
    ],
    [],
  );
  useEffect(
    () =>
      registrarAlvoTour("ranking_categorias", sampleRef, () =>
        scrollRef.current?.scrollTo({ y: 180, animated: false }),
      ),
    [],
  );

  return (
    <View style={[s.screen, { backgroundColor: palette.background }]}>
      <HallBackground palette={palette} />
      <SafeAreaView style={s.screen} edges={["top", "left", "right"]}>
        <ScrollView
          ref={scrollRef}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={s.scroll}
          refreshControl={
            <RefreshControl
              refreshing={carregando}
              onRefresh={() => void reloadRanking()}
              tintColor={palette.accent}
            />
          }
        >
          <View ref={headerRef} collapsable={false} style={s.header}>
            <View style={s.topLine}>
              <Text style={[s.eyebrow, { color: palette.accent }]}>
                RANKING
              </Text>
              <SectionGuideButton
                profile={profile}
                sectionTitle="Ranking"
                steps={steps}
                targetRefs={targets}
              />
            </View>
            <View style={s.trophy}><JourneySymbol section="ranking" profile={profile} size={80} /></View>
            <Text style={[s.title, { color: palette.text }]}>
              Sala de honra
            </Text>
            <Text style={[s.subtitle, { color: palette.textMuted }]}>
              Classificações da turma
            </Text>
            <OrnamentDivider color={palette.borderStrong} />
          </View>
          <View ref={categoriesRef} collapsable={false} style={s.categories}>
            {ranks.map((rank, index) => {
              const artwork =
                rank.info.criterio === "tempo"
                  ? journeyObjects.deadline
                  : rank.info.criterio === "percentual"
                    ? journeyObjects.book
                    : journeyObjects.gold;
              return (
                <View
                  ref={index === 0 ? sampleRef : undefined}
                  collapsable={false}
                  key={rank.info.rank_id}
                  style={s.full}
                >
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`Abrir ranking de ${rank.info.nome_rank}`}
                    onPress={() =>
                      router.push({
                        pathname: "/(tabs)/ranking/[id]",
                        params: { id: rank.info.rank_id },
                      })
                    }
                    style={({ pressed }) => [
                      s.category,
                      {
                        borderColor: palette.borderStrong,
                        backgroundColor: pressed
                          ? palette.surfaceElevated
                          : palette.surface,
                      },
                    ]}
                  >
                    <Corner pos="TL" color={palette.accent} />
                    <Corner pos="BR" color={palette.accent} />
                    <ProfileArtwork
                      source={artwork}
                      color={Color.colorWhite}
                      width={60}
                      height={68}
                    />
                    <View style={s.copy}>
                      <Text
                        style={[
                          s.categoryTitle,
                          { color: palette.text },
                        ]}
                      >
                        {rank.info.nome_rank}
                      </Text>
                      {rank.info.descricao ? (
                        <Text
                          style={[s.description, { color: palette.textMuted }]}
                        >
                          {rank.info.descricao}
                        </Text>
                      ) : null}
                    </View>
                    <MaterialCommunityIcons
                      name="arrow-right"
                      size={20}
                      color={palette.accent}
                    />
                  </Pressable>
                </View>
              );
            })}
          </View>
          {carregando && !ranks.length ? (
            <ActivityIndicator style={s.empty} color={palette.accent} />
          ) : !ranks.length ? (
            <Text style={[s.empty, { color: palette.textMuted }]}>
              Nenhum ranking disponível nesta turma.
            </Text>
          ) : null}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1 },
  scroll: { paddingHorizontal: 20, paddingBottom: 24 },
  header: { alignItems: "center", paddingBottom: 16 },
  topLine: {
    width: "100%",
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 8,
  },
  eyebrow: { fontSize: 11, fontWeight: "700" },
  trophy: { marginVertical: 10 },
  title: { fontFamily: FontFamily.inikaBold, fontSize: 28 },
  subtitle: { fontSize: 14, marginTop: 6, marginBottom: 12 },
  categories: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: 14,
  },
  full: { width: "100%" },
  category: {
    flexDirection: "row",
    minHeight: 112,
    borderWidth: 1,
    borderRadius: 6,
    padding: 14,
    alignItems: "center",
    justifyContent: "space-between",
    gap: 14,
  },
  copy: { flex: 1, minWidth: 0, justifyContent: "center" },
  categoryTitle: {
    fontFamily: FontFamily.inikaBold,
    fontSize: 19,
    lineHeight: 25,
    textAlign: "left",
  },
  description: { fontSize: 14, lineHeight: 20, marginTop: 6 },
  empty: { marginTop: 40, textAlign: "center" },
});
