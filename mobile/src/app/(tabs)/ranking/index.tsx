import { HallBackground } from "@/components/HallTheme";
import { UtilityIcon } from "@/components/UtilityIcon";
import { RankDetalhe } from "@/app/(tabs)/ranking/[id]";
import { RankingDesktop } from "@/components/web/RankingDesktop";
import { useDesktopWeb } from "@/hooks/useDesktopWeb";
import { useConquistaRank } from "@/context/ConquistaRankContext";
import { useUsuario } from "@/context/SessaoContext";
import { FontFamily } from "@/styles/GlobalStyle";
import { getProfileShellPalette } from "@/utils/profileShellTheme";
import { registrarAlvoTour } from "@/utils/tourTargets";
import { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { perfilVisualDoAluno } from "@/utils/brainHex";

// Web em tela larga (#346): categorias fixas à esquerda e a categoria aberta
// à direita. Nos demais casos (iOS/Android e web estreita) a tela é a de antes.
export default function Ranking() {
  const desktop = useDesktopWeb();
  return desktop ? <RankingDesktop /> : <RankingCelular />;
}

const NOME_CURTO: Record<string, string> = { tempo: "Tempo", percentual: "Progresso" };

/** Celular (mobile-v1): uma tela só, com as categorias como abas e a categoria aberta embaixo. */
function RankingCelular() {
  const { ranking, carregando } = useConquistaRank();
  const { usuario } = useUsuario();
  const palette = getProfileShellPalette(perfilVisualDoAluno(usuario));
  const ranks = ranking?.ranks ?? [];
  const [aberto, setAberto] = useState<number | null>(null);
  const idAberto = aberto !== null && ranks.some((r) => r.info.rank_id === aberto) ? aberto : (ranks[0]?.info.rank_id ?? null);
  const rankAberto = ranks.find((r) => r.info.rank_id === idAberto);
  const alvoTour = useRef<View | null>(null);
  useEffect(() => registrarAlvoTour("ranking_categorias", alvoTour), []);

  return (
    <View style={[s.screen, { backgroundColor: palette.background }]}>
      <HallBackground palette={palette} />
      <SafeAreaView style={s.screen} edges={["top", "left", "right"]}>
        <View style={s.topoCelular}>
          <Text style={[s.eyebrow, { color: palette.accent }]}>RANKING</Text>
          <Text accessibilityRole="header" style={[s.tituloCelular, { color: palette.text }]}>Sala de honra</Text>
        </View>
        {ranks.length ? (
          <>
            <View ref={alvoTour} collapsable={false} accessibilityRole="tablist" style={s.abas}>
              {ranks.map((rank) => {
                const ativa = rank.info.rank_id === idAberto;
                const criterio = rank.info.criterio;
                return (
                  <Pressable
                    key={rank.info.rank_id}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: ativa }}
                    onPress={() => setAberto(rank.info.rank_id)}
                    style={[
                      s.aba,
                      { borderColor: palette.borderStrong, backgroundColor: ativa ? palette.accent : palette.surface },
                    ]}
                  >
                    <UtilityIcon kind={arteDoCriterio(criterio)} size={26} height={26} />
                    <Text numberOfLines={1} style={[s.abaTexto, { color: ativa ? palette.background : palette.text }]}>
                      {(criterio && NOME_CURTO[criterio]) || "Pontos"}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            {rankAberto ? (
              <Text style={[s.descricaoCelular, { color: palette.textMuted }]}>
                <Text style={{ color: palette.text, fontWeight: "700" }}>{rankAberto.info.nome_rank}</Text>
                {rankAberto.info.descricao ? ` · ${rankAberto.info.descricao}` : ""}
              </Text>
            ) : null}
            {idAberto !== null ? <RankDetalhe rankId={idAberto} semBarraDeVolta /> : null}
          </>
        ) : carregando ? (
          <ActivityIndicator style={s.empty} color={palette.accent} />
        ) : (
          <Text style={[s.empty, { color: palette.textMuted }]}>Nenhum ranking disponível nesta turma.</Text>
        )}
      </SafeAreaView>
    </View>
  );
}

const arteDoCriterio = (criterio?: string | null) =>
  criterio === "tempo" ? "deadline" : criterio === "percentual" ? "book" : "medal";

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
  topoCelular: { paddingHorizontal: 18, paddingTop: 8, paddingBottom: 8 },
  tituloCelular: { fontFamily: "Georgia, serif", fontSize: 22 },
  abas: { flexDirection: "row", gap: 8, paddingHorizontal: 18 },
  aba: { flex: 1, minHeight: 48, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, borderWidth: 1, borderRadius: 8, paddingHorizontal: 6 },
  abaTexto: { fontFamily: FontFamily.interMedium, fontSize: 13, fontWeight: "700" },
  descricaoCelular: { fontSize: 13, lineHeight: 19, paddingHorizontal: 18, paddingVertical: 10 },
});
