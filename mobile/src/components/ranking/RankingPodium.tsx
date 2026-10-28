import { FramedProfileImage } from "@/components/FramedProfileImage";
import { JourneySymbol } from "@/components/JourneySymbol";
import { ProfileEmblem } from "@/components/ProfileEmblem";
import { UtilityIcon } from "@/components/UtilityIcon";
import { useDesktopWeb } from "@/hooks/useDesktopWeb";
import { FontFamily } from "@/styles/GlobalStyle";
import type { ProfileShellPalette } from "@/utils/profileShellTheme";
import type { RankingProfileMeta } from "@/utils/rankingProfiles";
import { formatRankScore, selectPodium } from "@/utils/rankingPodium";
import { Pressable, StyleSheet, Text, View } from "react-native";

type Row = {
  id_aluno: string;
  posicao: number | null;
  nome_aluno: string;
  pontuacao: number | null;
};
type Props = {
  rows: readonly Row[];
  criterion: string | null;
  palette: ProfileShellPalette;
  userId?: string;
  profiles: Record<string, RankingProfileMeta>;
  photos: Record<string, string>;
  /** Só no Ranking da web em tela larga (#346): o lugar do pódio vira botão. */
  onPressAluno?: (idAluno: string) => void;
};

export function RankingPodium({
  rows,
  criterion,
  palette,
  userId,
  profiles,
  photos,
  onPressAluno,
}: Props) {
  // Web em tela larga (#346, protótipo v4 05-ranking): pilares retos de alturas diferentes.
  const desktop = useDesktopWeb();
  const leaders = selectPodium(rows);
  if (!leaders.length)
    return (
      <View style={s.empty}>
        <JourneySymbol section="ranking" size={84} />
        <Text style={[s.emptyTitle, { color: palette.text }]}>
          O pódio está em aberto
        </Text>
      </View>
    );
  const Coluna = onPressAluno ? Pressable : View;
  const first = leaders.slice(0, 3);
  const columns = first.length === 3 ? [first[1], first[0], first[2]] : first;
  return (
    <View style={s.root}>
      <View style={[s.stage, desktop && s.stageLargo]}>
        {columns.map((row) => {
          const position = row.posicao!;
          const winner = position === 1;
          const color = palette.text;
          // Celular (mobile-v1, 05-ranking.html, .p-av .rosto): 72 / 56 / 48; tela larga mantém 88 / 66.
          const size = desktop ? (winner ? 88 : 66) : TAMANHO_CELULAR[position] ?? TAMANHO_CELULAR[3];
          const profile = profiles[row.id_aluno]?.key;
          const photo = photos[row.id_aluno];
          return (
            <Coluna
              key={row.id_aluno}
              {...(onPressAluno
                ? { onPress: () => onPressAluno(row.id_aluno), accessibilityRole: "button" as const }
                : null)}
              style={[
                s.column,
                {
                  paddingBottom: 0,
                },
              ]}
              accessible
              accessibilityLabel={`${position}º lugar, ${row.nome_aluno}, ${formatRankScore(row.pontuacao, criterion)}${row.id_aluno === userId ? ", você" : ""}`}
            >
              <View style={[s.portrait, !desktop && s.portraitCelular, { width: size, height: size }]}>
                {profile || photo ? (
                  <FramedProfileImage
                    profile={profile}
                    source={photo ? { uri: photo } : undefined}
                    size={size}
                  />
                ) : (
                  <View
                    style={[
                      s.initialsCircle,
                      {
                        width: size - 8,
                        height: size - 8,
                        borderColor: color,
                        backgroundColor: palette.surface,
                      },
                    ]}
                  >
                    <Text style={[s.initials, { color: palette.text }]}>
                      {row.nome_aluno
                        .trim()
                        .split(/\s+/)
                        .slice(0, 2)
                        .map((name) => name[0])
                        .join("")}
                    </Text>
                  </View>
                )}
                <UtilityIcon
                  kind="medal"
                  profile={palette.profile}
                  size={desktop ? 44 : 26}
                  style={desktop ? s.medal : s.medalCelular}
                />
              </View>
              <Text
                numberOfLines={desktop ? undefined : 1}
                style={[s.name, !desktop && s.nameCelular, { color: row.id_aluno === userId ? palette.accent : palette.text }]}
              >
                {row.nome_aluno}
              </Text>
              <Text style={[s.score, s.scoreLargo, !desktop && s.scoreCelular, { color: palette.textMuted }]}>
                {formatRankScore(row.pontuacao, criterion)}
              </Text>
              {desktop ? <ProfileEmblem profile={profile} toneProfile={palette.profile} size={28} /> : null}
              {/* Pilares retos. Celular (05-ranking.html, .pedestal): 64 / 44 / 32, o 1º com borda no accent. */}
              <View
                style={[
                  s.pilar,
                  !desktop && s.pilarCelular,
                  {
                    height: (desktop ? ALTURA_PILAR : ALTURA_PILAR_CELULAR)[position] ?? (desktop ? ALTURA_PILAR : ALTURA_PILAR_CELULAR)[3],
                    backgroundColor: winner || (!desktop && position === 2) ? palette.surfaceElevated : palette.surface,
                    borderColor: desktop ? palette.borderStrong : winner ? palette.accent : position === 3 ? palette.border : palette.borderStrong,
                  },
                ]}
              >
                <Text
                  style={[
                    s.place,
                    s.placeLargo,
                    !desktop && { marginTop: 0, fontSize: FONTE_LUGAR_CELULAR[position] ?? 18 },
                    { color: desktop || winner ? color : palette.textMuted },
                  ]}
                >
                  {position}
                  <Text style={s.ordinal}>º</Text>
                </Text>
              </View>
            </Coluna>
          );
        })}
      </View>
      {leaders.slice(3).map((row) => (
        <View
          key={row.id_aluno}
          style={[s.tie, { borderBottomColor: palette.border }]}
        >
          <Text style={[s.tiePlace, { color: palette.accent }]}>
            {row.posicao}º
          </Text>
          <ProfileEmblem profile={profiles[row.id_aluno]?.key} toneProfile={palette.profile} size={40} />
          <Text style={[s.tieName, { color: palette.text }]}>
            {row.nome_aluno}
          </Text>
          <Text style={{ color: palette.textMuted }}>
            {formatRankScore(row.pontuacao, criterion)}
          </Text>
        </View>
      ))}
    </View>
  );
}

// Altura de cada pilar na tela larga (1º mais alto), como no protótipo.
const ALTURA_PILAR: Record<number, number> = { 1: 120, 2: 90, 3: 70 };
// Celular (mobile-v1, 05-ranking.html): pedestais, retratos e números menores.
const ALTURA_PILAR_CELULAR: Record<number, number> = { 1: 64, 2: 44, 3: 32 };
const TAMANHO_CELULAR: Record<number, number> = { 1: 72, 2: 56, 3: 48 };
const FONTE_LUGAR_CELULAR: Record<number, number> = { 1: 28, 2: 22, 3: 18 };

const s = StyleSheet.create({
  root: { paddingTop: 28, paddingBottom: 12 },
  stage: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "center",
  },
  column: { flex: 1, minWidth: 0, maxWidth: 180, alignItems: "center" },
  portrait: {
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 28,
  },
  initialsCircle: {
    borderWidth: 2,
    borderRadius: 80,
    alignItems: "center",
    justifyContent: "center",
  },
  initials: { fontFamily: FontFamily.inikaBold, fontSize: 22 },
  medal: { width: 44, height: 44, position: "absolute", bottom: -22 },
  portraitCelular: { marginBottom: 6 },
  medalCelular: { width: 26, height: 26, position: "absolute", right: -8, bottom: -4 },
  nameCelular: { minHeight: 0, fontSize: 12.5, fontWeight: "700", lineHeight: 16 },
  scoreCelular: { fontSize: 12, marginTop: 2, marginBottom: 6 },
  pilarCelular: { marginTop: 0, justifyContent: "center" },
  name: {
    paddingHorizontal: 4,
    minHeight: 40,
    fontSize: 14,
    fontWeight: "600",
    lineHeight: 20,
    textAlign: "center",
  },
  score: {
    fontSize: 18,
    fontWeight: "700",
    marginTop: 7,
    marginBottom: 10,
    textAlign: "center",
  },
  place: {
    fontFamily: FontFamily.inikaBold,
    fontSize: 27,
  },
  ordinal: { fontSize: 15 },
  stageLargo: { gap: 12, paddingHorizontal: 24 },
  scoreLargo: { fontSize: 13, fontWeight: "600", marginTop: 2, marginBottom: 8 },
  pilar: {
    marginTop: 10,
    width: "100%",
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
    borderWidth: 1,
    borderBottomWidth: 0,
    alignItems: "center",
  },
  placeLargo: { position: "relative", top: 0, marginTop: 14, fontSize: 32 },
  tie: {
    flexDirection: "row",
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    alignItems: "center",
  },
  tiePlace: { fontSize: 17, fontWeight: "700" },
  tieName: { flex: 1, minWidth: 0, fontSize: 13 },
  empty: { paddingVertical: 36, alignItems: "center", gap: 12 },
  emptyArt: { width: 84, height: 92 },
  emptyTitle: {
    fontFamily: FontFamily.inikaBold,
    textAlign: "center",
    fontSize: 20,
  },
});
