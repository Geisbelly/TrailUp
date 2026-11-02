import React from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

import { FontFamily } from "@/styles/GlobalStyle";
import { progressoDaFaixa, textosDaFaixa, type FaixaXp } from "@/services/faixaXp";
import type { ProfileShellPalette } from "@/utils/profileShellTheme";

type Props = {
  faixa: FaixaXp;
  palette: ProfileShellPalette;
  style?: StyleProp<ViewStyle>;
};

/**
 * Título da faixa de XP e a barra até a próxima (#143). A barra é a única
 * representação de progresso para quem não olha o rank (Achiever e Seeker, na
 * matriz de Monterrat), por isso fica no Perfil de todos os perfis.
 *
 * Sem ícone de propósito: medalha, troféu e estrela já têm dono no app.
 */
export function FaixaXpCartao({ faixa, palette, style }: Props) {
  const textos = textosDaFaixa(faixa);
  const progresso = progressoDaFaixa(faixa);
  const ultima = faixa.proximoMinimo === null;

  return (
    <View
      accessible
      accessibilityLabel={textos.acessivel}
      style={[styles.cartao, { backgroundColor: palette.surface, borderColor: palette.border }, style]}
    >
      <View style={styles.topo}>
        <View style={styles.titulos}>
          <Text style={[styles.nivel, { color: palette.textSubtle }]}>{textos.nivel.toUpperCase()}</Text>
          <Text numberOfLines={1} style={[styles.titulo, { color: palette.text }]}>
            {faixa.titulo}
          </Text>
        </View>
        <Text style={[styles.xp, { color: palette.accent }]}>{textos.xp}</Text>
      </View>

      <View
        accessibilityRole="progressbar"
        accessibilityValue={
          ultima
            ? { min: 0, max: 100, now: 100 }
            : { min: 0, max: faixa.tamanhoFaixa ?? 0, now: Math.floor(faixa.xpNaFaixa) }
        }
        style={[styles.trilho, { backgroundColor: palette.progressTrack }]}
      >
        <View style={[styles.preenchido, { width: `${progresso * 100}%`, backgroundColor: palette.accent }]} />
      </View>

      <Text style={[styles.proxima, { color: palette.textMuted }]}>{textos.proxima}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  cartao: {
    borderRadius: 14,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 8,
  },
  topo: { flexDirection: "row", alignItems: "flex-end", gap: 10 },
  titulos: { flex: 1, minWidth: 0 },
  nivel: { fontFamily: FontFamily.interMedium, fontSize: 11, fontWeight: "700", letterSpacing: 1.1 },
  titulo: { fontFamily: FontFamily.interMedium, fontSize: 16, fontWeight: "700", marginTop: 2 },
  xp: { fontFamily: FontFamily.interMedium, fontSize: 14, fontWeight: "700", flexShrink: 0 },
  trilho: { height: 8, borderRadius: 4, overflow: "hidden" },
  preenchido: { height: "100%", borderRadius: 4 },
  proxima: { fontFamily: FontFamily.interMedium, fontSize: 12, lineHeight: 17 },
});
