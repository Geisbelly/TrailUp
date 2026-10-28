import React from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";

import { FontFamily } from "@/styles/GlobalStyle";
import type { ProfileShellPalette } from "@/utils/profileShellTheme";

/**
 * Interruptor das Configurações (mobile-v1, `11-configuracoes.html`, `.sw`): trilho
 * de 52×32, bolinha de 24px que corre para a direita quando ligado. Só desenha: o
 * toque e o `accessibilityRole="switch"` ficam na linha inteira, como já eram.
 * `bloqueado` (o servidor não libera) troca o trilho por um rótulo.
 */
export function Interruptor({
  ligado,
  salvando = false,
  bloqueado = false,
  palette,
}: {
  ligado: boolean;
  salvando?: boolean;
  bloqueado?: boolean;
  palette: ProfileShellPalette;
}) {
  if (bloqueado) return <Text style={[s.bloqueado, { color: palette.textSubtle }]}>Bloqueado</Text>;
  return (
    <View
      style={[
        s.trilho,
        ligado
          ? { backgroundColor: palette.accent, borderColor: palette.accent }
          : { backgroundColor: palette.surfaceElevated, borderColor: palette.border },
      ]}
    >
      <View style={[s.bolinha, ligado ? s.ligada : null, { backgroundColor: ligado ? palette.background : palette.textSubtle }]}>
        {salvando ? <ActivityIndicator size="small" color={ligado ? palette.accent : palette.background} /> : null}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  trilho: { width: 52, height: 32, borderRadius: 999, borderWidth: 1, justifyContent: "center" },
  bolinha: { width: 24, height: 24, borderRadius: 12, marginLeft: 3, alignItems: "center", justifyContent: "center", transform: [{ scale: 0.92 }] },
  ligada: { marginLeft: 23 },
  bloqueado: { fontFamily: FontFamily.interMedium, fontSize: 12, fontWeight: "700" },
});
