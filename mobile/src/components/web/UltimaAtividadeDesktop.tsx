import { MaterialCommunityIcons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { FontFamily } from "@/styles/GlobalStyle";
import type { ProfileShellPalette } from "@/utils/profileShellTheme";
import { ultimasAtividades } from "@/utils/ultimaAtividade";

/**
 * "Última atividade" no fim do Perfil da web em tela larga (#346, protótipo
 * v4, 08-perfil-hub.html): os três registros mais recentes do aluno, com o
 * ícone do tipo, a frase, os pontos e quando foi.
 */
export function UltimaAtividadeDesktop({
  eventos,
  palette,
}: {
  eventos: readonly { id: number | string; tipo: string; valor: number | null; criado_em: string | null }[];
  palette: ProfileShellPalette;
}) {
  const linhas = ultimasAtividades(eventos, new Date());
  return (
    <View style={s.bloco}>
      <Text accessibilityRole="header" style={[s.titulo, { color: palette.text }]}>Última atividade</Text>
      {linhas.length === 0 ? (
        <Text style={[s.vazio, { color: palette.textMuted }]}>Nada registrado ainda. O que você estudar aparece aqui.</Text>
      ) : (
        linhas.map((l) => (
          <View key={l.id} style={[s.linha, { backgroundColor: palette.surface, borderColor: palette.border }]}>
            <View style={[s.icone, { backgroundColor: palette.accentMuted }]}>
              <MaterialCommunityIcons name={l.icone} size={17} color={palette.accent} />
            </View>
            <Text style={[s.texto, { color: palette.text }]} numberOfLines={1}>
              <Text style={s.negrito}>{l.texto}</Text>
              {l.pontos > 0 ? <Text style={{ color: palette.textMuted }}>{` — +${l.pontos} ${l.pontos === 1 ? "ponto" : "pontos"}`}</Text> : null}
            </Text>
            <Text style={[s.quando, { color: palette.textSubtle }]}>{l.quando}</Text>
          </View>
        ))
      )}
    </View>
  );
}

const s = StyleSheet.create({
  bloco: { gap: 10, marginTop: 8 },
  titulo: { fontFamily: FontFamily.interMedium, fontSize: 15, fontWeight: "700", marginBottom: 2 },
  vazio: { fontFamily: FontFamily.interMedium, fontSize: 13 },
  linha: { flexDirection: "row", alignItems: "center", gap: 14, borderRadius: 12, borderWidth: 1, paddingVertical: 12, paddingHorizontal: 16 },
  icone: { width: 34, height: 34, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  texto: { flex: 1, minWidth: 0, fontFamily: FontFamily.interMedium, fontSize: 13 },
  negrito: { fontWeight: "700" },
  quando: { fontFamily: FontFamily.interMedium, fontSize: 11.5 },
});
