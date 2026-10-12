import { useFocusEffect } from "@react-navigation/native";
import { router } from "expo-router";
import React, { useCallback, useState } from "react";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";

import { getAchievementArtwork } from "@/constants/achievementImages";
import { Conquista, type ConquistaBibliotecaItem } from "@/models/Conquista";
import { FontFamily } from "@/styles/GlobalStyle";
import { dataCurta, resumirConquistas } from "@/utils/destaqueConquistas";
import type { ProfileShellPalette } from "@/utils/profileShellTheme";

/**
 * Conquistas em destaque no Perfil da web em tela larga (#346, protótipo v4):
 * quantas foram conquistadas, a parte da biblioteca, as 4 mais recentes e as
 * 3 mais perto de sair. Os números são os da Biblioteca de conquistas.
 */
export function ConquistasDestaque({
  alunoId,
  perfis,
  palette,
  onAbrir,
}: {
  alunoId: string;
  perfis: readonly string[];
  palette: ProfileShellPalette;
  onAbrir?: (conquista: Conquista) => void;
}) {
  const [itens, setItens] = useState<ConquistaBibliotecaItem[] | null>(null);
  const chavePerfis = perfis.join(",");

  useFocusEffect(
    useCallback(() => {
      let ativo = true;
      void Conquista.fetchBibliotecaForAluno(alunoId, chavePerfis ? chavePerfis.split(",") : [])
        .then((dados) => ativo && setItens(dados))
        .catch(() => ativo && setItens([]));
      return () => {
        ativo = false;
      };
    }, [alunoId, chavePerfis]),
  );

  if (!itens) return null;
  const r = resumirConquistas(itens);

  return (
    <View style={[s.card, { borderColor: palette.accent, backgroundColor: palette.surfaceElevated }]}>
      <View style={s.cabeca}>
        <View style={s.flex}>
          <Text style={[s.eyebrow, { color: palette.accent }]}>CONQUISTAS</Text>
          <Text style={[s.titulo, { color: palette.text }]}>
            {r.concluidas} {r.concluidas === 1 ? "conquistada" : "conquistadas"}
            <Text style={[s.parte, { color: palette.textMuted }]}> · {r.percentual}% da biblioteca</Text>
          </Text>
        </View>
        <Pressable accessibilityRole="link" onPress={() => router.push("/(tabs)/perfil/biblioteca-conquistas")}>
          <Text style={[s.link, { color: palette.accent }]}>Ver biblioteca completa →</Text>
        </Pressable>
      </View>
      <View
        accessibilityRole="progressbar"
        accessibilityValue={{ min: 0, max: 100, now: r.percentual }}
        style={[s.trilho, { backgroundColor: palette.progressTrack }]}
      >
        <View style={[s.preenchido, { width: `${r.percentual}%`, backgroundColor: palette.accent }]} />
      </View>

      {r.recentes.length ? (
        <View style={s.recentes}>
          {r.recentes.map(({ conquista }) => (
            <Pressable
              key={conquista.conquista_id}
              accessibilityRole="button"
              accessibilityLabel={`Conquista ${conquista.nome}`}
              onPress={() => onAbrir?.(conquista)}
              style={({ hovered }: { hovered?: boolean; pressed: boolean }) => [
                s.recente,
                { backgroundColor: hovered ? palette.surface : palette.background, borderColor: palette.border },
              ]}
            >
              <Image source={getAchievementArtwork(conquista)} resizeMode="contain" style={s.arte} />
              <Text style={[s.nome, { color: palette.text }]} numberOfLines={2}>{conquista.nome}</Text>
              <Text style={[s.data, { color: palette.textSubtle }]}>{dataCurta(conquista.data_conquista)}</Text>
            </Pressable>
          ))}
        </View>
      ) : (
        <Text style={[s.texto, { color: palette.textMuted }]}>Nenhuma conquista ainda. A primeira sai do estudo na Trilha.</Text>
      )}

      {r.quaseLa.length ? (
        <View style={s.quase}>
          <Text style={[s.quaseTitulo, { color: palette.textMuted }]}>QUASE LÁ</Text>
          {/* Em grade de 3, como no protótipo: arte, nome, barra e o quanto falta. */}
          <View style={s.quaseGrade}>
            {r.quaseLa.map(({ conquista, progressoPercentual }) => (
              <View key={conquista.conquista_id} style={[s.quaseCartao, { backgroundColor: palette.background }]}>
                <Image source={getAchievementArtwork(conquista)} resizeMode="contain" style={s.quaseArte} />
                <View style={s.flex}>
                  <Text style={[s.quaseNome, { color: palette.text }]} numberOfLines={2}>{conquista.nome}</Text>
                  <View style={[s.trilhoPequeno, { backgroundColor: palette.progressTrack }]}>
                    <View style={[s.preenchido, { width: `${Math.round(progressoPercentual)}%`, backgroundColor: palette.accent }]} />
                  </View>
                </View>
                <Text style={[s.data, { color: palette.textSubtle }]}>{Math.round(progressoPercentual)}%</Text>
              </View>
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  card: { borderRadius: 18, borderWidth: 1, padding: 22, gap: 14 },
  cabeca: { flexDirection: "row", alignItems: "flex-end", gap: 16 },
  flex: { flex: 1, minWidth: 0, gap: 4 },
  eyebrow: { fontFamily: FontFamily.interMedium, fontSize: 11, fontWeight: "700", letterSpacing: 1.2 },
  titulo: { fontFamily: FontFamily.inikaBold, fontSize: 22 },
  parte: { fontFamily: FontFamily.interMedium, fontSize: 14 },
  link: { fontFamily: FontFamily.interMedium, fontSize: 13, fontWeight: "700" },
  trilho: { height: 8, borderRadius: 4, overflow: "hidden" },
  trilhoPequeno: { height: 5, borderRadius: 3, overflow: "hidden", marginTop: 6 },
  preenchido: { height: "100%", borderRadius: 4 },
  recentes: { flexDirection: "row", gap: 12 },
  recente: { flex: 1, minWidth: 0, borderRadius: 14, borderWidth: 1, padding: 12, alignItems: "center", gap: 6 },
  arte: { width: 64, height: 64 },
  nome: { fontFamily: FontFamily.interMedium, fontSize: 13, fontWeight: "700", textAlign: "center" },
  data: { fontFamily: FontFamily.interMedium, fontSize: 11.5 },
  texto: { fontFamily: FontFamily.interMedium, fontSize: 13 },
  quase: { gap: 10 },
  quaseTitulo: { fontFamily: FontFamily.interMedium, fontSize: 11, fontWeight: "700", letterSpacing: 1.2 },
  quaseGrade: { flexDirection: "row", gap: 12 },
  quaseCartao: { flex: 1, minWidth: 0, maxWidth: "33%", flexDirection: "row", alignItems: "center", gap: 10, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12 },
  quaseArte: { width: 36, height: 36, opacity: 0.75 },
  quaseNome: { fontFamily: FontFamily.interMedium, fontSize: 12.5, fontWeight: "700" },
});
