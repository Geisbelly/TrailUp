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
import { useConquistaRank } from "@/context/ConquistaRankContext";
import { useUsuario } from "@/context/SessaoContext";
import { FontFamily } from "@/styles/GlobalStyle";
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
            <ProfileArtwork
              source={journeyObjects.trophy}
              profile={profile}
              width={94}
              height={104}
              style={s.trophy}
            />
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
              const wide = ranks.length % 2 !== 0 && index === ranks.length - 1;
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
                  style={wide ? s.full : s.half}
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
                      wide && s.categoryWide,
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
                      profile={profile}
                      width={wide ? 70 : 86}
                      height={wide ? 78 : 92}
                      style={wide ? s.wideArt : s.categoryArt}
                    />
                    <View style={wide ? s.wideCopy : s.copy}>
                      <Text
                        style={[
                          s.categoryTitle,
                          { color: palette.text },
                          wide && s.leftText,
                        ]}
                      >
                        {rank.info.nome_rank}
                      </Text>
                      {wide ? (
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
  trophy: { width: 94, height: 104, marginTop: 4, marginBottom: 8 },
  title: { fontFamily: FontFamily.inikaBold, fontSize: 28 },
  subtitle: { fontSize: 13, marginTop: 6, marginBottom: 16 },
  categories: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: 14,
  },
  half: { width: "48%" },
  full: { width: "100%" },
  category: {
    minHeight: 220,
    borderWidth: 1,
    borderRadius: 6,
    padding: 18,
    alignItems: "center",
    justifyContent: "space-between",
    gap: 14,
  },
  categoryWide: { flexDirection: "row", minHeight: 128, gap: 14 },
  categoryArt: { width: 86, height: 92 },
  wideArt: { width: 70, height: 78 },
  copy: { flex: 1, justifyContent: "center" },
  wideCopy: { flex: 1, minWidth: 0 },
  categoryTitle: {
    fontFamily: FontFamily.inikaBold,
    fontSize: 19,
    lineHeight: 25,
    textAlign: "center",
  },
  leftText: { textAlign: "left" },
  description: { fontSize: 12, lineHeight: 18, marginTop: 6 },
  empty: { marginTop: 40, textAlign: "center" },
});
