import React from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { FontFamily } from "@/styles/GlobalStyle";
import type { ProfileShellPalette } from "@/utils/profileShellTheme";

/**
 * Peças das seções das Configurações na web em tela larga (#346, protótipo v4,
 * 11-configuracoes.html): o conteúdo num cartão à esquerda e, à direita, os
 * cartões de apoio ("Passos", "Antes de pedir", "Como chega"...).
 */
export function DuasColunasConfig({ children, apoio }: { children: React.ReactNode; apoio?: React.ReactNode }) {
  return (
    <View style={s.colunas}>
      <View style={s.principal}>{children}</View>
      {apoio ? <View style={s.apoio}>{apoio}</View> : null}
    </View>
  );
}

export function CartaoConfig({
  children,
  palette,
  style,
}: {
  children: React.ReactNode;
  palette: ProfileShellPalette;
  style?: StyleProp<ViewStyle>;
}) {
  return <View style={[s.cartao, { backgroundColor: palette.surface, borderColor: palette.border }, style]}>{children}</View>;
}

export function ApoioConfig({ titulo, children, palette }: { titulo: string; children: React.ReactNode; palette: ProfileShellPalette }) {
  return (
    <View style={[s.cartaoApoio, { backgroundColor: palette.surface, borderColor: palette.border }]}>
      <Text style={[s.tituloApoio, { color: palette.textMuted }]}>{titulo.toUpperCase()}</Text>
      {children}
    </View>
  );
}

/** Texto corrido de um cartão de apoio. */
export function TextoApoio({ children, palette }: { children: React.ReactNode; palette: ProfileShellPalette }) {
  return <Text style={[s.textoApoio, { color: palette.textMuted }]}>{children}</Text>;
}

const s = StyleSheet.create({
  // 20 px somados aos 12 do painel alinham os cartões ao título, como no protótipo.
  colunas: { flexDirection: "row", gap: 16, alignItems: "flex-start", paddingHorizontal: 20, paddingTop: 24, paddingBottom: 24 },
  principal: { flex: 1, minWidth: 0, gap: 16 },
  apoio: { width: 260, gap: 12 },
  cartao: { borderRadius: 14, borderWidth: 1, padding: 18, gap: 12 },
  cartaoApoio: { borderRadius: 14, borderWidth: 1, padding: 16, gap: 10 },
  tituloApoio: { fontFamily: FontFamily.interMedium, fontSize: 11, fontWeight: "700", letterSpacing: 1.2 },
  textoApoio: { fontFamily: FontFamily.interMedium, fontSize: 12.5, lineHeight: 19 },
});
