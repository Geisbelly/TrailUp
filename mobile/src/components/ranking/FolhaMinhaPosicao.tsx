import React from "react";
import { Modal, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { FontFamily } from "@/styles/GlobalStyle";
import type { ProfileShellPalette } from "@/utils/profileShellTheme";

/**
 * Folha "Sua posição" do Ranking no celular (mobile-v1, `05-ranking.html`,
 * `minhaFolha`): abre ao tocar na barra fixa. Mostra a posição em destaque, o
 * colega logo acima e quanto falta para passá-lo.
 */
export function FolhaMinhaPosicao({
  visivel,
  categoria,
  posicao,
  total,
  valor,
  acima,
  falta,
  palette,
  onFechar,
}: {
  visivel: boolean;
  categoria: string;
  posicao: number | null;
  total: number | null;
  valor: string;
  acima: { nome: string; posicao: number | null } | null;
  falta: string | null;
  palette: ProfileShellPalette;
  onFechar: () => void;
}) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visivel} transparent animationType="slide" onRequestClose={onFechar}>
      <View style={[s.veu, { backgroundColor: `${palette.background}cc` }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onFechar} accessibilityRole="button" accessibilityLabel="Fechar sua posição" />
        <View
          accessibilityRole="summary"
          accessibilityLabel="Sua posição"
          style={[s.folha, { backgroundColor: palette.surfaceElevated, borderColor: palette.borderStrong, paddingBottom: 18 + insets.bottom }]}
        >
          <View style={[s.alca, { backgroundColor: palette.borderStrong }]} />
          <Text style={[s.eyebrow, { color: palette.accent }]}>SUA POSIÇÃO · {categoria.toUpperCase()}</Text>
          {posicao === null ? (
            <>
              <Text style={[s.nota, { color: palette.text, fontSize: 14.5 }]}>Você ainda não pontuou nesta categoria.</Text>
              <Text style={[s.nota, { color: palette.textMuted }]}>Assim que você pontuar, sua posição aparece aqui.</Text>
            </>
          ) : (
            <>
              <View style={s.principal}>
                <Text style={[s.pos, { color: palette.accent }]}>{posicao}º</Text>
                {total ? <Text style={[s.de, { color: palette.textSubtle }]}>de {total}</Text> : null}
                <Text style={[s.valor, { color: palette.text }]}>{valor}</Text>
              </View>
              <View style={[s.proximo, { backgroundColor: palette.surface, borderColor: palette.border }]}>
                {acima ? (
                  <>
                    <Text style={[s.rotulo, { color: palette.textSubtle }]}>PRÓXIMO ACIMA</Text>
                    <Text style={[s.nome, { color: palette.text }]}>
                      {acima.nome}
                      {acima.posicao ? <Text style={{ color: palette.textMuted }}> · {acima.posicao}º</Text> : null}
                    </Text>
                    <Text style={[s.nota, { color: palette.textMuted }]}>
                      Faltam <Text style={{ color: palette.text, fontWeight: "700" }}>{falta}</Text> para passar.
                    </Text>
                  </>
                ) : (
                  <Text style={[s.nome, { color: palette.text }]}>Você lidera esta categoria.</Text>
                )}
              </View>
              <Text style={[s.nota, { color: palette.textSubtle }]}>Sua posição continua aqui mesmo quando você filtra os colegas.</Text>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  veu: { flex: 1, justifyContent: "flex-end" },
  folha: { borderTopLeftRadius: 20, borderTopRightRadius: 20, borderWidth: 1, borderBottomWidth: 0, paddingHorizontal: 18, paddingTop: 10, gap: 12 },
  alca: { alignSelf: "center", width: 36, height: 4, borderRadius: 2, marginBottom: 6 },
  eyebrow: { fontFamily: FontFamily.interMedium, fontSize: 11, fontWeight: "700", letterSpacing: 1 },
  principal: { flexDirection: "row", alignItems: "baseline", gap: 8 },
  pos: { fontFamily: FontFamily.inikaBold, fontSize: 40 },
  de: { fontFamily: FontFamily.interMedium, fontSize: 14, flex: 1 },
  valor: { fontFamily: FontFamily.interMedium, fontSize: 18, fontWeight: "700" },
  proximo: { borderRadius: 12, borderWidth: 1, padding: 14, gap: 6 },
  rotulo: { fontFamily: FontFamily.interMedium, fontSize: 10.5, fontWeight: "700", letterSpacing: 1 },
  nome: { fontFamily: FontFamily.interMedium, fontSize: 15, fontWeight: "700" },
  nota: { fontFamily: FontFamily.interMedium, fontSize: 13, lineHeight: 19 },
});
