import { router } from "expo-router";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { FontFamily } from "@/styles/GlobalStyle";
import type { ProfileShellPalette } from "@/utils/profileShellTheme";

/**
 * Informações do aluno embaixo do nome, no Perfil da web em tela larga (#346,
 * protótipo v4, 08-perfil-hub.md §2): turma e e-mail, e o atalho para
 * editar, que abre "Informações pessoais" nas Configurações.
 */
export function InfoAlunoDesktop({
  turma,
  professor,
  email,
  palette,
}: {
  turma: string | null | undefined;
  professor: string | null | undefined;
  email: string | null | undefined;
  palette: ProfileShellPalette;
}) {
  const linhas: [string, string][] = [];
  if (turma) linhas.push(["Turma", professor ? `${turma} · Prof. ${professor}` : turma]);
  if (email) linhas.push(["E-mail", email]);
  return (
    <View style={s.bloco}>
      {linhas.map(([rotulo, valor]) => (
        <View key={rotulo} style={s.linha}>
          <Text style={[s.rotulo, { color: palette.textSubtle }]}>{rotulo}</Text>
          <Text style={[s.valor, { color: palette.textMuted }]} numberOfLines={1}>{valor}</Text>
        </View>
      ))}
      <Pressable accessibilityRole="link" onPress={() => router.push("/(tabs)/perfil/settings?sub=info")}>
        <Text style={[s.editar, { color: palette.accent }]}>Editar informações</Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  bloco: { gap: 6, marginTop: 10 },
  linha: { flexDirection: "row", gap: 10 },
  rotulo: { width: 64, fontFamily: FontFamily.interMedium, fontSize: 12.5 },
  valor: { flex: 1, fontFamily: FontFamily.interMedium, fontSize: 12.5 },
  editar: { fontFamily: FontFamily.interMedium, fontSize: 13, fontWeight: "700", marginTop: 4 },
});
