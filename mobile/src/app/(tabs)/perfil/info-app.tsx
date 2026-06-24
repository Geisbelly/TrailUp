import { HallBackground } from "@/components/HallTheme";
import React, { useMemo } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

import { app } from "@/constants/definicoes";
import { useUsuario } from "@/context/SessaoContext";
import { FontFamily } from "@/styles/GlobalStyle";
import { getProfileShellPalette } from "@/utils/profileShellTheme";

export default function InfoAppScreen() {
  const { usuario } = useUsuario();
  const palette = useMemo(
    () => getProfileShellPalette(usuario?.perfis?.[0]?.nome ?? null),
    [usuario?.perfis]
  );

  return (
    <View style={[styles.outer, { backgroundColor: palette.background }]}>
      <View style={[StyleSheet.absoluteFill, { opacity: 0.35 }]} pointerEvents="none">
        <HallBackground palette={palette} />
      </View>
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.content}
    >
      <Text style={[styles.title, { color: palette.text }]}>Informações do app</Text>
      <Text style={[styles.paragraph, { color: palette.textMuted }]}>
        {app.informs ??
          "TrailUp ajuda você a acompanhar sua trilha de aprendizado, módulos, atividades e conquistas em um só lugar. Aqui estão alguns detalhes técnicos e de produto."}
      </Text>

      <View
        style={[
          styles.card,
          { backgroundColor: palette.surfaceElevated, borderColor: palette.border },
        ]}
      >
        <Text style={[styles.cardTitle, { color: palette.text }]}>Nome</Text>
        <Text style={[styles.item, { color: palette.textMuted }]}>{app?.name ?? "TrailUp"}</Text>
      </View>

      <View
        style={[
          styles.card,
          { backgroundColor: palette.surfaceElevated, borderColor: palette.border },
        ]}
      >
        <Text style={[styles.cardTitle, { color: palette.text }]}>Descrição</Text>
        <Text style={[styles.item, { color: palette.textMuted }]}>
          {app?.descricao ??
            "Plataforma mobile para gerenciar trilhas, módulos, conteúdos e gamificação (ranking, eventos e conquistas)."}
        </Text>
      </View>

      <View
        style={[
          styles.card,
          { backgroundColor: palette.surfaceElevated, borderColor: palette.border },
        ]}
      >
        <Text style={[styles.cardTitle, { color: palette.text }]}>Autor / Organização</Text>
        <Text style={[styles.item, { color: palette.textMuted }]}>
          {app?.author ?? "TrailUp"}
        </Text>
      </View>
    </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  outer: {
    flex: 1,
  },
  container: {
    flex: 1,
    paddingHorizontal: 20,
  },
  content: {
    paddingVertical: 20,
    gap: 12,
  },
  title: {
    fontFamily: FontFamily.inikaBold,
    fontSize: 20,
  },
  paragraph: {
    fontFamily: FontFamily.interMedium,
    fontSize: 14,
  },
  card: {
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    gap: 6,
  },
  cardTitle: {
    fontFamily: FontFamily.inikaBold,
    fontSize: 16,
  },
  item: {
    fontFamily: FontFamily.interMedium,
    fontSize: 14,
  },
});
