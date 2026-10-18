import { MaterialCommunityIcons } from "@expo/vector-icons";
import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Image, Pressable, StyleSheet, Text, View } from "react-native";

import { RankDetalhe } from "@/app/(tabs)/ranking/[id]";
import { HallBackground } from "@/components/HallTheme";
import { UtilityIcon } from "@/components/UtilityIcon";
import { useConquistaRank } from "@/context/ConquistaRankContext";
import { useUsuario } from "@/context/SessaoContext";
import { FontFamily } from "@/styles/GlobalStyle";
import { resumirMinhaPosicao } from "@/utils/minhaPosicaoRank";
import { formatRankScore } from "@/utils/rankingPodium";
import { getProfileShellPalette } from "@/utils/profileShellTheme";
import { registrarAlvoTour } from "@/utils/tourTargets";

// Mesma escolha de arte da lista de categorias do app (ranking/index.tsx).
const arteDoCriterio = (criterio?: string | null) =>
  criterio === "tempo" ? "deadline" : criterio === "percentual" ? "book" : "medal";

/**
 * Ranking na web em tela larga (#346, protótipo v4): as categorias ficam numa
 * coluna fixa à esquerda, da altura da tela, e a categoria aberta ocupa a
 * direita — que é a única parte que rola. A direita é a própria tela de
 * categoria do app (`RankDetalhe`), embutida.
 */
export function RankingDesktop() {
  const { ranking, carregando } = useConquistaRank();
  const { usuario } = useUsuario();
  const palette = getProfileShellPalette(usuario?.perfilAtivo ?? usuario?.perfis?.[0]?.nome);
  const ranks = ranking?.ranks ?? [];
  const [aberto, setAberto] = useState<number | null>(null);
  const alvoTour = useRef<View | null>(null);
  useEffect(() => registrarAlvoTour("ranking_categorias", alvoTour), []);

  // Abre a primeira categoria quando o ranking chega (ou se a aberta sumir).
  const idAberto = aberto !== null && ranks.some((r) => r.info.rank_id === aberto) ? aberto : ranks[0]?.info.rank_id ?? null;
  const rankAberto = ranks.find((r) => r.info.rank_id === idAberto);
  const criterio = rankAberto?.info.criterio ?? null;
  const resumo = resumirMinhaPosicao(rankAberto?.posicoes ?? [], usuario?.id, criterio);
  // Turma sem ranking: o aviso vai num cartão à direita, como o estado "Vazio" do protótipo v4.
  const semRanking = !carregando && !ranks.length;

  return (
    <View style={[s.tela, { backgroundColor: palette.background }]}>
      <HallBackground palette={palette} />
      <View style={s.esquerda}>
        <Text style={[s.eyebrow, { color: palette.accent }]}>RANKING</Text>
        <Text style={[s.titulo, { color: palette.text }]}>Sala de honra</Text>
        <Text style={[s.subtitulo, { color: palette.textMuted }]}>Classificações da turma</Text>

        <View ref={alvoTour} collapsable={false} style={s.categorias}>
          {ranks.map((rank) => {
            const ativo = rank.info.rank_id === idAberto;
            // "Você: 12º · 3h 20min", como no protótipo: a sua posição em cada categoria.
            const minha = resumirMinhaPosicao(rank.posicoes, usuario?.id, rank.info.criterio).minha;
            return (
              <Pressable
                key={rank.info.rank_id}
                accessibilityRole="tab"
                accessibilityState={{ selected: ativo }}
                accessibilityLabel={`Abrir ranking de ${rank.info.nome_rank}`}
                onPress={() => setAberto(rank.info.rank_id)}
                style={({ hovered }: { hovered?: boolean; pressed: boolean }) => [
                  s.categoria,
                  {
                    borderColor: ativo ? palette.accent : palette.border,
                    backgroundColor: ativo ? palette.accentMuted : hovered ? palette.surfaceElevated : palette.surface,
                  },
                ]}
              >
                <UtilityIcon kind={arteDoCriterio(rank.info.criterio)} size={38} height={42} />
                <View style={s.copia}>
                  <Text style={[s.nomeCategoria, { color: palette.text }]} numberOfLines={1}>{rank.info.nome_rank}</Text>
                  {rank.info.descricao ? (
                    <Text style={[s.descricao, { color: palette.textSubtle }]} numberOfLines={1}>{rank.info.descricao}</Text>
                  ) : null}
                  {minha?.posicao ? (
                    <Text style={[s.voce, { color: palette.textMuted }]} numberOfLines={1}>
                      Você: <Text style={[s.negrito, { color: palette.text }]}>{minha.posicao}º</Text> · {formatRankScore(minha.pontuacao, rank.info.criterio)}
                    </Text>
                  ) : null}
                </View>
                <MaterialCommunityIcons name="chevron-right" size={16} color={palette.accent} />
              </Pressable>
            );
          })}
        </View>

        {carregando && !ranks.length ? <ActivityIndicator color={palette.accent} style={s.vazio} /> : null}

        {/* Sua posição: sai do rodapé da tabela e fica aqui, sempre visível enquanto a classificação rola. */}
        {rankAberto && resumo.minha ? (
          <View style={[s.posicao, { borderColor: palette.accent, backgroundColor: palette.surfaceElevated }]}>
            <Text style={[s.eyebrow, { color: palette.accent }]} numberOfLines={1}>
              SUA POSIÇÃO · {rankAberto.info.nome_rank.toUpperCase()}
            </Text>
            <View style={s.posLinha}>
              {usuario?.foto_url ? <Image source={{ uri: usuario.foto_url }} style={[s.posFoto, { borderColor: palette.accent }]} /> : null}
              <Text style={[s.posNumero, { color: palette.accent }]}>{resumo.minha.posicao ? `${resumo.minha.posicao}º` : "--"}</Text>
              <Text style={[s.posValor, { color: palette.text }]}>{formatRankScore(resumo.minha.pontuacao, criterio)}</Text>
            </View>
            <View style={[s.acima, { backgroundColor: palette.background }]}>
              {resumo.acima ? (
                <>
                  <Text style={[s.acimaRotulo, { color: palette.textSubtle }]}>PRÓXIMO ACIMA</Text>
                  <Text style={[s.acimaTexto, { color: palette.text }]}>
                    <Text style={s.negrito}>{resumo.acima.nome_aluno}</Text> · {resumo.acima.posicao}º
                  </Text>
                  <Text style={[s.acimaTexto, { color: palette.textMuted }]}>
                    Faltam <Text style={[s.negrito, { color: palette.text }]}>{resumo.falta}</Text> para passar.
                  </Text>
                </>
              ) : (
                <Text style={[s.acimaTexto, s.negrito, { color: palette.text }]}>Você lidera esta categoria.</Text>
              )}
            </View>
            <Text style={[s.posNota, { color: palette.textSubtle }]}>Sua posição continua aqui mesmo quando você filtra os colegas.</Text>
          </View>
        ) : null}
      </View>

      {/* A categoria aberta fica num cartão, como no protótipo v4. */}
      {semRanking ? (
        <View style={[s.direita, s.cartaoVazio, { borderColor: palette.border, backgroundColor: palette.surface }]}>
          <UtilityIcon kind="medal" size={52} height={58} />
          <Text style={[s.vazioTitulo, { color: palette.text }]}>Nenhum ranking ainda</Text>
          <Text style={[s.vazioTexto, { color: palette.textMuted }]}>Nenhum ranking disponível nesta turma.</Text>
        </View>
      ) : (
        <View style={[s.direita, { borderColor: palette.border, backgroundColor: palette.background }]}>
          {idAberto !== null ? <RankDetalhe key={idAberto} rankId={idAberto} embutido /> : null}
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  tela: { flex: 1, flexDirection: "row" },
  esquerda: { width: 340, paddingHorizontal: 24, paddingTop: 24, paddingBottom: 16, gap: 4 },
  eyebrow: { fontFamily: FontFamily.interMedium, fontSize: 11, fontWeight: "700", letterSpacing: 1.5 },
  titulo: { fontFamily: FontFamily.inikaBold, fontSize: 24 },
  subtitulo: { fontFamily: FontFamily.interMedium, fontSize: 13, marginBottom: 14 },
  categorias: { gap: 8 },
  categoria: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 9, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1 },
  copia: { flex: 1, minWidth: 0 },
  nomeCategoria: { fontFamily: FontFamily.inikaBold, fontSize: 15.5 },
  descricao: { fontFamily: FontFamily.interMedium, fontSize: 12, marginTop: 1 },
  vazio: { marginTop: 24 },
  cartaoVazio: { flex: 1, alignSelf: "flex-start", alignItems: "center", gap: 10, paddingVertical: 40, paddingHorizontal: 24 },
  vazioTitulo: { fontFamily: FontFamily.interMedium, fontSize: 17, fontWeight: "700", marginTop: 6 },
  vazioTexto: { fontFamily: FontFamily.interMedium, fontSize: 14, textAlign: "center" },
  voce: { fontFamily: FontFamily.interMedium, fontSize: 11.5, marginTop: 2 },
  direita: { flex: 1, minWidth: 0, marginTop: 24, marginRight: 24, marginBottom: 24, borderRadius: 20, borderWidth: 1, overflow: "hidden" },
  // Logo abaixo das categorias, como no protótipo (antes ficava presa ao pé da coluna).
  posicao: { marginTop: 20, padding: 16, borderRadius: 16, borderWidth: 1, gap: 10 },
  posLinha: { flexDirection: "row", alignItems: "center", gap: 12 },
  posFoto: { width: 44, height: 44, borderRadius: 22, borderWidth: 3 },
  posNumero: { fontFamily: FontFamily.inikaBold, fontSize: 34 },
  posValor: { marginLeft: "auto", fontFamily: FontFamily.interMedium, fontSize: 16, fontWeight: "700" },
  acima: { padding: 12, borderRadius: 12, gap: 4 },
  acimaRotulo: { fontFamily: FontFamily.interMedium, fontSize: 10.5, fontWeight: "700", letterSpacing: 1 },
  acimaTexto: { fontFamily: FontFamily.interMedium, fontSize: 13 },
  negrito: { fontWeight: "700" },
  posNota: { fontFamily: FontFamily.interMedium, fontSize: 11.5 },
});
