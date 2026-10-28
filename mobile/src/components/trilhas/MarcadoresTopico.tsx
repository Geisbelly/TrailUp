import { MaterialCommunityIcons } from "@expo/vector-icons";
import React from "react";
import { Image, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import tinycolor from "tinycolor2";

import type { TopicoMapa } from "@/components/web/MapaPaisesDesktop";
import { FontFamily } from "@/styles/GlobalStyle";
import type { EstadoTopico } from "@/utils/painelTopicoTrilha";
import type { ProfileShellPalette } from "@/utils/profileShellTheme";

// Marcadores dos tópicos da Trilha no celular (mobile-v1, `03-trilha.html`,
// `noHTML`): o chip de estado sob o nome e o balão "Você parou aqui" com o rosto
// do guardião. Os mesmos no mapa, na árvore e na lista.

const CHIP: Record<EstadoTopico, { icone: keyof typeof MaterialCommunityIcons.glyphMap; texto: (t: TopicoMapa) => string }> = {
  done: { icone: "check", texto: () => "Concluído" },
  current: { icone: "clock-outline", texto: (t) => `${t.percentual}% · ${t.personalizado ? "personalizado" : "em andamento"}` },
  open: { icone: "play", texto: () => "Disponível" },
  locked: { icone: "lock-outline", texto: () => "Bloqueado" },
};

/** Texto do estado do tópico, para o chip e para o leitor de tela. */
export const textoDoEstado = (t: TopicoMapa) => CHIP[t.estado].texto(t);

/** `compacto`: no tópico atual, só a porcentagem (rótulo estreito, como a dupla de tópicos da árvore). */
export function ChipEstadoTopico({ topico, palette, compacto = false }: { topico: TopicoMapa; palette: ProfileShellPalette; compacto?: boolean }) {
  const e = topico.estado;
  const aceso = e === "done" || e === "current";
  const cor = aceso ? palette.accent : palette.textMuted;
  // No protótipo o chip aceso é `accent-muted` SOBRE a superfície: opaco. Só o
  // `accentMuted` (12% de alfa) sumia sobre o cenário do perfil.
  const fundoAceso = tinycolor.mix(palette.surface, palette.accent, 12).toRgbString();
  return (
    <View
      style={[
        s.chip,
        aceso ? { backgroundColor: fundoAceso, borderColor: palette.accentSoft } : { backgroundColor: palette.surface, borderColor: palette.border },
      ]}
    >
      <MaterialCommunityIcons name={topico.personalizado && e === "current" ? "star-four-points" : CHIP[e].icone} size={11} color={cor} />
      <Text numberOfLines={1} style={[s.chipTexto, { color: cor }]}>
        {compacto && e === "current" ? `${topico.percentual}%` : CHIP[e].texto(topico)}
      </Text>
    </View>
  );
}

/**
 * Rosto do guardião num círculo com borda. O View só desenha o anel; o Image
 * arredonda sozinho, sem borda. No aparelho, `borderRadius` + `borderWidth` no
 * Image desenhava só o anel vazio, e `overflow: hidden` no View deixava o rosto preto.
 */
export function RostoGuardiao({ rosto, tamanho, borda }: { rosto: number | { uri?: string } | object; tamanho: number; borda: string }) {
  const dentro = tamanho - 4;
  return (
    <View style={{ width: tamanho, height: tamanho, borderRadius: tamanho / 2, borderWidth: 2, borderColor: borda }}>
      <Image source={rosto as never} style={{ width: dentro, height: dentro, borderRadius: dentro / 2 }} resizeMode="cover" />
    </View>
  );
}

/** Balão sobre o tópico atual; `seta` diz onde fica o bico (no centro, ou perto da esquerda na árvore). */
export function BalaoVoceParouAqui({
  rosto,
  palette,
  seta = "centro",
  style,
}: {
  rosto: number | { uri?: string } | object;
  palette: ProfileShellPalette;
  seta?: "centro" | "esquerda";
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <View style={[s.aqui, { backgroundColor: palette.accent }, { pointerEvents: "none" }, style]}>
      <RostoGuardiao rosto={rosto} tamanho={24} borda={palette.background} />
      <Text style={[s.aquiTexto, { color: palette.background }]}>Você parou aqui</Text>
      <View style={[s.aquiSeta, seta === "centro" ? s.setaCentro : s.setaEsquerda, { borderTopColor: palette.accent }]} />
    </View>
  );
}

const s = StyleSheet.create({
  chip: { flexDirection: "row", alignItems: "center", gap: 4, borderRadius: 999, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 3 },
  chipTexto: { fontFamily: FontFamily.interMedium, fontSize: 10.5, fontWeight: "600" },
  aqui: {
    position: "absolute",
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingLeft: 3,
    paddingRight: 10,
    paddingVertical: 3,
    borderRadius: 999,
  },
  aquiTexto: { fontFamily: FontFamily.interMedium, fontSize: 11, fontWeight: "800" },
  aquiSeta: {
    position: "absolute",
    bottom: -6,
    width: 0,
    height: 0,
    borderLeftWidth: 6,
    borderRightWidth: 6,
    borderTopWidth: 7,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
  },
  setaCentro: { left: "50%", marginLeft: -6 },
  setaEsquerda: { left: 16 },
});
