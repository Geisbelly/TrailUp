import { FramedProfileImage } from "@/components/FramedProfileImage";
import { JourneySymbol } from "@/components/JourneySymbol";
import { ProfileEmblem } from "@/components/ProfileEmblem";
import { UtilityIcon } from "@/components/UtilityIcon";
import { FontFamily } from "@/styles/GlobalStyle";
import type { ProfileShellPalette } from "@/utils/profileShellTheme";
import type { RankingProfileMeta } from "@/utils/rankingProfiles";
import { formatRankScore, selectPodium } from "@/utils/rankingPodium";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Polygon } from "react-native-svg";

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
};

export function RankingPodium({
  rows,
  criterion,
  palette,
  userId,
  profiles,
  photos,
}: Props) {
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
  const first = leaders.slice(0, 3);
  const columns = first.length === 3 ? [first[1], first[0], first[2]] : first;
  return (
    <View style={s.root}>
      <View style={s.stage}>
        {columns.map((row) => {
          const position = row.posicao!;
          const winner = position === 1;
          const color = palette.text;
          const size = winner ? 88 : 66;
          const profile = profiles[row.id_aluno]?.key;
          const photo = photos[row.id_aluno];
          return (
            <View
              key={row.id_aluno}
              style={[
                s.column,
                {
                  paddingBottom: position === 1 ? 30 : position === 2 ? 12 : 0,
                },
              ]}
              accessible
              accessibilityLabel={`${position}º lugar, ${row.nome_aluno}, ${formatRankScore(row.pontuacao, criterion)}${row.id_aluno === userId ? ", você" : ""}`}
            >
              <View style={[s.portrait, { width: size, height: size }]}>
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
                  size={44}
                  style={s.medal}
                />
              </View>
              <Text style={[s.name, { color: palette.text }]}>
                {row.nome_aluno}
              </Text>
              <Text style={[s.score, { color }]}>
                {formatRankScore(row.pontuacao, criterion)}
              </Text>
              <ProfileEmblem profile={profile} toneProfile={palette.profile} size={44} />
              <View style={s.pedestal}>
                <Svg
                  width="100%"
                  height="100%"
                  viewBox="0 0 120 64"
                  preserveAspectRatio="none"
                >
                  <Polygon
                    points="0,12 60,0 120,12 108,52 60,64 12,52"
                    fill={palette.surface}
                  />
                  <Polygon
                    points="0,12 60,0 120,12 60,26"
                    fill={palette.surfaceElevated}
                    stroke={palette.borderStrong}
                    strokeWidth="1"
                  />
                  <Polygon
                    points="0,12 60,26 60,64 12,52"
                    fill={palette.surfaceElevated}
                  />
                  <Polygon
                    points="60,26 120,12 108,52 60,64"
                    fill={palette.surface}
                  />
                </Svg>
                <Text style={[s.place, { color }]}>
                  {position}
                  <Text style={s.ordinal}>º</Text>
                </Text>
              </View>
            </View>
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
  pedestal: {
    marginTop: 8,
    width: "100%",
    height: 64,
    alignItems: "center",
    justifyContent: "center",
  },
  place: {
    position: "absolute",
    top: 17,
    fontFamily: FontFamily.inikaBold,
    fontSize: 27,
  },
  ordinal: { fontSize: 15 },
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
