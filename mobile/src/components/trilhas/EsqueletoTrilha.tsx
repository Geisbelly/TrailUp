import React from "react";
import { StyleSheet, Text, View } from "react-native";

import { FontFamily } from "@/styles/GlobalStyle";
import type { ProfileShellPalette } from "@/utils/profileShellTheme";

/** Carregando da Trilha no celular (mobile-v1): topo, 5 hexágonos e folha recolhida em esqueleto. */
export function EsqueletoTrilha({ palette }: { palette: ProfileShellPalette }) {
  const bloco = { backgroundColor: palette.surfaceElevated };
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel="Carregando trilhas"
      style={[s.raiz, { backgroundColor: palette.background }]}
    >
      <View style={s.topo}>
        <View style={[s.emblema, bloco]} />
        <View style={s.topoTextos}>
          <View style={[s.linhaCurta, bloco]} />
          <View style={[s.linhaMedia, bloco]} />
        </View>
      </View>
      <View style={[s.barra, bloco]} />
      <View style={s.hexagonos}>
        {[0, 1, 2, 3, 4].map((i) => (
          <View key={i} style={[s.hexagono, bloco, { alignSelf: i % 2 === 0 ? "flex-start" : "flex-end" }]} />
        ))}
      </View>
      <Text style={[s.titulo, { color: palette.text }]}>Carregando trilhas</Text>
      <Text style={[s.texto, { color: palette.textMuted }]}>Preparando sua jornada.</Text>
      <View style={[s.folha, { backgroundColor: palette.surface, borderColor: palette.borderStrong }]}>
        <View style={[s.alca, { backgroundColor: palette.borderStrong }]} />
        <View style={s.folhaLinha}>
          <View style={[s.hexPequeno, bloco]} />
          <View style={s.topoTextos}>
            <View style={[s.linhaCurta, bloco]} />
            <View style={[s.linhaMedia, bloco]} />
          </View>
          <View style={[s.botao, bloco]} />
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  raiz: { flex: 1, paddingHorizontal: 16, paddingTop: 12 },
  topo: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 56 },
  topoTextos: { flex: 1, gap: 6 },
  emblema: { width: 32, height: 32, borderRadius: 16 },
  linhaCurta: { width: "35%", height: 10, borderRadius: 5 },
  linhaMedia: { width: "60%", height: 14, borderRadius: 7 },
  barra: { height: 6, borderRadius: 3, marginTop: 6 },
  hexagonos: { flex: 1, justifyContent: "space-evenly", paddingHorizontal: 24 },
  hexagono: { width: 56, height: 56, borderRadius: 14 },
  titulo: { fontFamily: "Georgia, serif", fontSize: 18, textAlign: "center" },
  texto: { fontFamily: FontFamily.interMedium, fontSize: 14, textAlign: "center", marginBottom: 130 },
  folha: { position: "absolute", left: 0, right: 0, bottom: 0, height: 96, borderTopWidth: 1, borderTopLeftRadius: 20, borderTopRightRadius: 20, alignItems: "center", paddingTop: 10 },
  alca: { width: 36, height: 4, borderRadius: 2, marginBottom: 14 },
  folhaLinha: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, alignSelf: "stretch" },
  hexPequeno: { width: 40, height: 40, borderRadius: 10 },
  botao: { width: 96, height: 48, borderRadius: 24 },
});
