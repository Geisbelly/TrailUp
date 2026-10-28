import { FolhaMinhaPosicao } from "@/components/ranking/FolhaMinhaPosicao";
import { RankingPodium } from "@/components/ranking/RankingPodium";
import { ProfileEmblem } from "@/components/ProfileEmblem";
import { SocialProfileModal } from "@/components/social/SocialProfileModal";
import {
  SectionGuideButton,
  type SectionGuideScrollable,
  type SectionGuideStep,
} from "@/components/SectionGuideButton";
import { getProfileArtwork } from "@/constants/designAssets";
import { normalizeBrainHexProfile } from "@/constants/profileImages";
import { useConquistaRank } from "@/context/ConquistaRankContext";
import { useUsuario } from "@/context/SessaoContext";
import { supabase } from "@/database/supabase";
import { useRankingPeople } from "@/hooks/useRankingPeople";
import type { RankPosicao } from "@/models/RankPosicao";
import { FontFamily } from "@/styles/GlobalStyle";
import { getProfileShellPalette } from "@/utils/profileShellTheme";
import { aplicarCorteDoRank, descreverCorte } from "@/utils/rankCorte";
import { resumirMinhaPosicao } from "@/utils/minhaPosicaoRank";
import { formatRankScore, rotuloDoCriterio } from "@/utils/rankingPodium";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { perfilVisualDoAluno } from "@/utils/brainHex";
import { shadowStyle } from "@/utils/webShadow";

type Filter = "geral" | "perfil_majoritario" | "outros_perfis";
const filters: { key: Filter; label: string }[] = [
  { key: "geral", label: "Geral" },
  { key: "perfil_majoritario", label: "Meu perfil" },
  { key: "outros_perfis", label: "Outros perfis" },
];

export default function RankDetalheScreen() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  return <RankDetalhe rankId={Number(id)} />;
}

/**
 * Categoria aberta do ranking. `embutido`: dentro do Ranking da web em tela
 * larga (#346), ao lado das categorias — sem a barra de voltar, porque as
 * categorias continuam visíveis na coluna da esquerda. Embutido, o aluno
 * clicado (pódio ou lista) abre o perfil público; a própria linha leva ao Perfil.
 */
export function RankDetalhe({
  rankId,
  embutido = false,
  semBarraDeVolta = false,
}: {
  rankId: number;
  embutido?: boolean;
  /** Celular (mobile-v1): a categoria aberta dentro das abas do Ranking, sem a barra "Rankings". */
  semBarraDeVolta?: boolean;
}) {
  const router = useRouter();
  const { ranking, carregando, reloadRanking } = useConquistaRank();
  const { usuario } = useUsuario();
  const profile = perfilVisualDoAluno(usuario);
  const palette = getProfileShellPalette(profile);
  const rank = ranking?.ranks.find((item) => item.info.rank_id === rankId);
  const [filter, setFilter] = useState<Filter>("geral");
  const [total, setTotal] = useState<number | null>(null);
  const [perfilAberto, setPerfilAberto] = useState<string | null>(null);
  const [folhaPosicao, setFolhaPosicao] = useState(false);
  const abrirAluno = (idAluno: string) =>
    idAluno === usuario?.id ? router.push("/perfil") : setPerfilAberto(idAluno);
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
  // Tela larga (#346, protótipo v4): na classificação geral, os três primeiros já
  // estão no pódio, então a tabela começa no 4º.
  const linhasTabela = useMemo(
    () => (embutido && filter === "geral" ? filtered.filter((row) => !row.posicao || row.posicao > 3) : filtered),
    [embutido, filter, filtered],
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

  const scoreLabel = rotuloDoCriterio(rank?.info.criterio);
  // Barra "Sua posição": quanto falta para passar o colega logo acima (ou que você lidera).
  const resumoPosicao = resumirMinhaPosicao(rank?.posicoes ?? [], usuario?.id, rank?.info.criterio ?? null);
  const textoFalta = resumoPosicao.acima
    ? `Faltam ${resumoPosicao.falta} para passar ${resumoPosicao.acima.nome_aluno}`
    : resumoPosicao.minha?.posicao === 1
      ? "Você lidera esta categoria."
      : "Classificação geral";
  return (
    <View style={[s.screen, { backgroundColor: palette.background }]}>
      {!embutido && !semBarraDeVolta ? <Stack.Screen options={{ headerShown: false }} /> : null}
      <SafeAreaView style={s.screen} edges={semBarraDeVolta ? ["left", "right"] : ["top", "left", "right"]}>
        {!embutido && !semBarraDeVolta ? (
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
        ) : null}
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
              data={profilesLoading && filter !== "geral" ? [] : linhasTabela}
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
                  {/* Celular (mobile-v1, 05-ranking.html, .arena): o pódio num cartão com o cenário do perfil. */}
                  <View
                    ref={headerRef}
                    collapsable={false}
                    style={embutido ? s.hero : [s.arena, { borderColor: palette.border, backgroundColor: palette.surface }]}
                  >
                    <View style={[s.scenery, { pointerEvents: "none" }]}>
                      <Image
                        source={getProfileArtwork(profile, "rank")}
                        style={[s.sceneryImage, !embutido && s.sceneryCelular]}
                        resizeMode="cover"
                        accessible={false}
                      />
                      <LinearGradient
                        colors={
                          embutido
                            ? [`${palette.background}60`, `${palette.background}b0`, palette.background]
                            : [`${palette.background}8c`, `${palette.background}00`, `${palette.background}d9`]
                        }
                        locations={embutido ? [0, 0.5, 1] : [0, 0.4, 1]}
                        style={StyleSheet.absoluteFill}
                      />
                    </View>
                    {/* Embutido na tela larga (#346, protótipo v4): "CATEGORIA" e os filtros como pílulas ao lado do título. */}
                    {/* Sob as abas do celular o nome e a descrição já aparecem em cima: não repete. */}
                    {semBarraDeVolta ? null : (
                    <View style={[s.heading, embutido && s.headingLargo]}>
                    <View style={embutido ? s.headingTextos : null}>
                      <Text style={[s.eyebrow, { color: palette.accent }]}>
                        {embutido ? "CATEGORIA" : "SALA DE HONRA"}
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
                    {embutido ? (
                      <View style={s.pilulas}>
                        {filters.map((item) => {
                          const ativo = filter === item.key;
                          return (
                            <Pressable
                              key={item.key}
                              accessibilityRole="tab"
                              accessibilityState={{ selected: ativo }}
                              onPress={() => setFilter(item.key)}
                              style={[
                                s.pilula,
                                {
                                  borderColor: ativo ? palette.accent : palette.border,
                                  backgroundColor: ativo ? palette.accent : palette.surface,
                                },
                              ]}
                            >
                              <Text style={[s.pilulaTexto, { color: ativo ? palette.background : palette.textMuted }]}>{item.label}</Text>
                            </Pressable>
                          );
                        })}
                      </View>
                    ) : null}
                    </View>
                    )}
                    <RankingPodium
                      rows={rank.posicoes}
                      criterion={rank.info.criterio}
                      palette={palette}
                      userId={usuario?.id}
                      profiles={profiles}
                      photos={photos}
                      onPressAluno={embutido ? abrirAluno : undefined}
                    />
                    {embutido ? (
                      <Text style={[s.notaPodio, { color: palette.textSubtle }]}>
                        Os três primeiros lugares seguem a classificação geral desta categoria. Empates mantêm a mesma posição.
                      </Text>
                    ) : null}
                  </View>
                  {embutido ? null : (
                    <Text style={[s.notaCelular, { color: palette.textSubtle }]}>
                      Os três primeiros seguem a classificação geral. Empates mantêm a mesma posição.
                    </Text>
                  )}
                  <View
                    ref={filtersRef}
                    collapsable={false}
                    style={embutido ? s.filtersSection : s.filtrosCelularWrap}
                  >
                    {embutido ? (
                      <Text style={[s.sectionTitle, s.sectionTitleLargo, { color: palette.accent }]}>CLASSIFICAÇÃO</Text>
                    ) : (
                      <>
                        {/* Celular (05-ranking.html, .filtros/.filtro): pílulas; a ativa em accent-muted. */}
                        <View style={s.filtrosCelular}>
                          {filters.map((item) => {
                            const ativo = filter === item.key;
                            return (
                              <Pressable
                                key={item.key}
                                accessibilityRole="tab"
                                accessibilityState={{ selected: ativo }}
                                onPress={() => setFilter(item.key)}
                                style={[
                                  s.filtroCelular,
                                  ativo
                                    ? { backgroundColor: palette.accentMuted, borderColor: palette.accent }
                                    : { borderColor: palette.border },
                                ]}
                              >
                                <Text style={[s.filtroCelularTexto, { color: ativo ? palette.accent : palette.textMuted }]}>
                                  {item.label}
                                </Text>
                              </Pressable>
                            );
                          })}
                        </View>
                        <Text style={[s.notaCelular, s.notaFiltro, { color: palette.textSubtle }]}>
                          As posições originais da categoria são preservadas.
                        </Text>
                      </>
                    )}
                    {embutido ? (
                    <View style={[s.listHeading, s.listHeadingLargo]}>
                      {embutido ? <Text style={[s.columnLabel, s.colunaPosicao, { color: palette.textSubtle }]}>#</Text> : null}
                      <Text
                        style={[s.columnLabel, embutido && s.colunaAluno, { color: palette.textSubtle }]}
                      >
                        ALUNO
                      </Text>
                      {embutido ? <Text style={[s.columnLabel, s.colunaPerfil, { color: palette.textSubtle }]}>PERFIL</Text> : null}
                      <Text
                        style={[s.columnLabel, embutido && s.colunaValor, { color: palette.textSubtle }]}
                      >
                        {scoreLabel.toUpperCase()}
                      </Text>
                    </View>
                    ) : null}
                  </View>
                </>
              }
              renderItem={({ item }) => {
                const me = item.id_aluno === usuario?.id;
                const personProfile = profiles[item.id_aluno];
                const Linha = embutido ? Pressable : View;
                return (
                  <Linha
                    {...(embutido
                      ? {
                          onPress: () => abrirAluno(item.id_aluno),
                          accessibilityRole: "button" as const,
                          accessibilityLabel: me ? "Ir para o seu perfil" : `Ver perfil de ${item.nome_aluno}`,
                        }
                      : null)}
                    style={[
                      s.row,
                      embutido ? s.rowLarga : s.rowCelular,
                      {
                        borderBottomColor: palette.border,
                        backgroundColor: me ? palette.surfaceElevated : embutido ? "transparent" : palette.surface,
                        borderLeftColor: me ? palette.accent : "transparent",
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
                    <ProfileEmblem profile={personProfile?.key} toneProfile={profile} size={embutido ? 32 : 38} />
                    <View style={s.student}>
                      <Text style={[s.studentName, { color: palette.text }]}>
                        {item.nome_aluno}
                        {me ? " (Você)" : ""}
                      </Text>
                      {embutido ? null : (
                        // Celular (05-ranking.html, .quem span): ponto na cor do perfil e o nome.
                        <View style={s.perfilCelular}>
                          {personProfile?.key ? (
                            <View style={[s.pontoPerfil, { backgroundColor: getProfileShellPalette(personProfile.key).accent }]} />
                          ) : null}
                          <Text numberOfLines={1} style={[s.profile, s.perfilLargo, { color: palette.textSubtle }]}>
                            {personProfile?.label ?? "Perfil não definido"}
                          </Text>
                        </View>
                      )}
                    </View>
                    {embutido ? (
                      // Coluna de perfil do protótipo: ponto na cor do perfil e o nome.
                      <View style={s.colunaPerfilLinha}>
                        {personProfile?.key ? (
                          <View style={[s.pontoPerfil, { backgroundColor: getProfileShellPalette(personProfile.key).accent }]} />
                        ) : null}
                        <Text
                          numberOfLines={1}
                          style={[s.profile, s.perfilLargo, { color: palette.textMuted }, !personProfile?.label && s.semPerfil]}
                        >
                          {personProfile?.label ?? "Perfil não definido"}
                        </Text>
                      </View>
                    ) : null}
                    <Text
                      style={[
                        s.score,
                        { color: palette.text },
                      ]}
                    >
                      {formatRankScore(item.pontuacao, rank.info.criterio)}
                    </Text>
                  </Linha>
                );
              }}
              ListEmptyComponent={
                // Todos os alunos já estão no pódio: a tabela fica vazia sem aviso.
                linhasTabela.length === 0 && filtered.length > 0 ? null : profilesLoading && filter !== "geral" ? (
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
            {/* Embutido no Ranking de tela larga, a posição fica no card da coluna da esquerda. */}
            {cutoff.minhaLinha && !embutido ? (
              <Pressable
                ref={myRef}
                collapsable={false}
                accessibilityRole="button"
                accessibilityLabel={`Sua posição: ${cutoff.minhaLinha.posicao ?? "--"}º. ${textoFalta}`}
                accessibilityHint="Abre os detalhes da sua posição"
                onPress={() => setFolhaPosicao(true)}
                // Celular (mobile-v1, 05-ranking.html, .minha): cartão flutuante com a foto, "Nº de N" e o valor.
                style={[
                  s.myPosition,
                  {
                    backgroundColor: palette.surface,
                    borderColor: palette.accent,
                  },
                  shadowStyle({ color: "#000", offset: { width: 0, height: 10 }, opacity: 0.45, radius: 13 }, Platform.OS === "web"),
                ]}
              >
                <View style={[s.minhaFoto, { borderColor: palette.accent }]}>
                  {usuario?.id && photos[usuario.id] ? (
                    <Image source={{ uri: photos[usuario.id] }} style={s.minhaFotoImagem} />
                  ) : (
                    <ProfileEmblem profile={profiles[usuario?.id ?? ""]?.key} toneProfile={profile} size={36} />
                  )}
                </View>
                <View style={s.student}>
                  <Text style={[s.myPlace, { color: palette.text }]}>
                    {cutoff.minhaLinha.posicao ? `${cutoff.minhaLinha.posicao}º` : "--"}
                    {total ? <Text style={[s.myTotal, { color: palette.textSubtle }]}>{` de ${total}`}</Text> : null}
                  </Text>
                  <Text numberOfLines={1} style={[s.myLabel, { color: palette.textMuted }]}>
                    {textoFalta}
                  </Text>
                </View>
                <Text style={[s.myScore, { color: palette.accent }]}>
                  {formatRankScore(cutoff.minhaLinha.pontuacao, rank.info.criterio)}
                </Text>
              </Pressable>
            ) : null}
            {cutoff.minhaLinha && !embutido ? (
              <FolhaMinhaPosicao
                visivel={folhaPosicao}
                categoria={scoreLabel}
                posicao={cutoff.minhaLinha.posicao ?? null}
                total={total}
                valor={formatRankScore(cutoff.minhaLinha.pontuacao, rank.info.criterio)}
                acima={resumoPosicao.acima ? { nome: resumoPosicao.acima.nome_aluno, posicao: resumoPosicao.acima.posicao ?? null } : null}
                falta={resumoPosicao.falta}
                palette={palette}
                onFechar={() => setFolhaPosicao(false)}
              />
            ) : null}
          </>
        )}
        {embutido && classeId ? (
          <SocialProfileModal
            visible={perfilAberto !== null}
            alunoId={perfilAberto}
            classeId={classeId}
            accent={palette.accent}
            centralizado
            onClose={() => setPerfilAberto(null)}
          />
        ) : null}
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
  sceneryImage: { width: "100%", height: "100%", opacity: 0.4 },
  // Celular (mobile-v1, 05-ranking.html).
  arena: { marginHorizontal: 12, borderRadius: 14, borderWidth: 1, overflow: "hidden", paddingHorizontal: 10 },
  sceneryCelular: { opacity: 0.55 },
  notaCelular: { fontFamily: FontFamily.interMedium, fontSize: 12, lineHeight: 17, marginTop: 8, marginHorizontal: 18 },
  notaFiltro: { marginTop: 4, marginBottom: 10 },
  filtrosCelularWrap: { paddingTop: 16 },
  filtrosCelular: { flexDirection: "row", gap: 8, paddingHorizontal: 18, paddingBottom: 4 },
  filtroCelular: { minHeight: 40, borderRadius: 999, borderWidth: 1, paddingHorizontal: 14, justifyContent: "center" },
  filtroCelularTexto: { fontFamily: FontFamily.interMedium, fontSize: 13.5, fontWeight: "600" },
  rowCelular: { minHeight: 60, paddingVertical: 6, paddingHorizontal: 8, marginHorizontal: 12, gap: 12 },
  perfilCelular: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 },
  heading: { paddingTop: 24, gap: 7 },
  headingLargo: { flexDirection: "row", alignItems: "flex-start", gap: 16 },
  headingTextos: { flex: 1, minWidth: 0, gap: 7 },
  pilulas: { flexDirection: "row", gap: 6, paddingTop: 14 },
  pilula: { borderRadius: 999, borderWidth: 1, paddingHorizontal: 14, paddingVertical: 7 },
  pilulaTexto: { fontFamily: FontFamily.interMedium, fontSize: 12.5, fontWeight: "700" },
  eyebrow: { fontSize: 10, fontWeight: "700" },
  title: { fontFamily: FontFamily.inikaBold, fontSize: 27, lineHeight: 34 },
  subtitle: { fontSize: 14, lineHeight: 21 },
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
  filterText: { fontSize: 14, fontWeight: "600", textAlign: "center" },
  listHeading: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingTop: 20,
    paddingBottom: 10,
  },
  columnLabel: { fontSize: 12, fontWeight: "700" },
  // Tabela da tela larga (protótipo v4): colunas # · ALUNO · PERFIL · valor e linhas compactas.
  notaPodio: { fontFamily: FontFamily.interMedium, fontSize: 12, textAlign: "center", paddingHorizontal: 20, paddingTop: 10 },
  sectionTitleLargo: { fontFamily: FontFamily.interMedium, fontSize: 12, fontWeight: "700", letterSpacing: 1.2, marginTop: 18, marginBottom: 0 },
  listHeadingLargo: { justifyContent: "flex-start", gap: 8, paddingTop: 12, paddingHorizontal: 15 },
  colunaPosicao: { minWidth: 28 },
  colunaAluno: { flex: 1, marginLeft: 40 },
  colunaPerfil: { width: 170 },
  colunaValor: { width: 76, textAlign: "right" },
  rowLarga: { minHeight: 52, paddingVertical: 8, borderBottomWidth: 1 },
  colunaPerfilLinha: { width: 170, flexDirection: "row", alignItems: "center", gap: 8 },
  pontoPerfil: { width: 8, height: 8, borderRadius: 4 },
  perfilLargo: { marginTop: 0, flexShrink: 1 },
  semPerfil: { fontStyle: "italic" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 88,
    paddingHorizontal: 12,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderLeftWidth: 3,
    gap: 8,
  },
  position: { minWidth: 28, fontSize: 17, fontWeight: "700", fontVariant: ["tabular-nums"] },
  student: { flex: 1, minWidth: 0 },
  studentName: { fontSize: 15, lineHeight: 22, fontWeight: "600" },
  profile: { fontSize: 12, lineHeight: 18, marginTop: 3 },
  score: { width: 76, fontSize: 16, lineHeight: 22, fontWeight: "700", textAlign: "right", fontVariant: ["tabular-nums"] },
  myPosition: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    minHeight: 64,
    marginHorizontal: 8,
    marginBottom: 8,
    paddingLeft: 8,
    paddingRight: 12,
    borderRadius: 14,
    borderWidth: 1,
    elevation: 8,
  },
  minhaFoto: { width: 44, height: 44, borderRadius: 22, borderWidth: 2, alignItems: "center", justifyContent: "center" },
  minhaFotoImagem: { width: 40, height: 40, borderRadius: 20 },
  myPlace: { fontFamily: FontFamily.interMedium, fontSize: 16, fontWeight: "700" },
  myTotal: { fontSize: 12, fontWeight: "500" },
  myLabel: { fontFamily: FontFamily.interMedium, fontSize: 12.5 },
  myScore: { fontFamily: FontFamily.interMedium, fontSize: 14, fontWeight: "800" },
  empty: { margin: 36, textAlign: "center" },
  notice: { padding: 20, fontSize: 12, lineHeight: 18, textAlign: "center" },
});
