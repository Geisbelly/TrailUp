import { FontFamily } from "@/styles/GlobalStyle";
import type { ProfileShellPalette } from "@/utils/profileShellTheme";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import React from "react";
import { Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";

/**
 * O aviso do sinal de uso (spec 2026-11-20, seção 4). Fala do USO, nunca de emoção: o detector
 * mede erros, tempo e abandonos, e não sabe como o aluno se sente (DAT-45). Por isso nada de
 * "ansiedade", "ansioso" ou "crise" aqui, e o teste varre este texto.
 *
 * Sem vermelho: cores da paleta do perfil. O ícone é o broto (`sprout`), que no app só quer dizer
 * modo de cuidado ("um ícone, um significado"; `leaf` já é emblema de mapa de turma).
 */
export const COPY_AVISO_USO = {
  titulo: "Você está há um tempo nisso. 🌿",
  corpo: "Que tal uma pausa de 5 minutos?",
  pausar: "Fazer uma pausa",
  continuar: "Continuar",
} as const;

export const ICONE_DO_CUIDADO = "sprout" as const;

type Props = {
  visivel: boolean;
  palette: ProfileShellPalette;
  onPausar: () => void;
  onContinuar: () => void;
};

export function AvisoDeCuidado({ visivel, palette, onPausar, onContinuar }: Props) {
  if (!visivel) return null;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onContinuar}>
      <View style={styles.fundo}>
        <View
          accessibilityRole="alert"
          style={[styles.cartao, { backgroundColor: palette.surfaceElevated, borderColor: palette.border }]}
        >
          <View style={[styles.icone, { backgroundColor: palette.accentSoft }]}>
            <MaterialCommunityIcons name={ICONE_DO_CUIDADO} size={26} color={palette.accent} />
          </View>
          <Text style={[styles.titulo, { color: palette.text }]}>{COPY_AVISO_USO.titulo}</Text>
          <Text style={[styles.corpo, { color: palette.textMuted }]}>{COPY_AVISO_USO.corpo}</Text>
          <View style={styles.botoes}>
            <TouchableOpacity
              accessibilityRole="button"
              onPress={onPausar}
              style={[styles.botao, { backgroundColor: palette.accent }]}
            >
              <Text style={[styles.botaoTexto, { color: palette.background }]}>{COPY_AVISO_USO.pausar}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityRole="button"
              onPress={onContinuar}
              style={[styles.botao, { borderColor: palette.borderStrong, borderWidth: 1 }]}
            >
              <Text style={[styles.botaoTexto, { color: palette.text }]}>{COPY_AVISO_USO.continuar}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fundo: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  cartao: { width: "100%", maxWidth: 380, borderRadius: 20, borderWidth: 1, padding: 22, gap: 12, alignItems: "center" },
  icone: { width: 52, height: 52, borderRadius: 26, alignItems: "center", justifyContent: "center" },
  titulo: { fontFamily: FontFamily.poppinsExtraBold, fontSize: 18, textAlign: "center" },
  corpo: { fontFamily: FontFamily.interMedium, fontSize: 15, lineHeight: 22, textAlign: "center" },
  botoes: { alignSelf: "stretch", gap: 10, marginTop: 6 },
  botao: { minHeight: 48, borderRadius: 14, alignItems: "center", justifyContent: "center", paddingHorizontal: 16 },
  botaoTexto: { fontFamily: FontFamily.interMedium, fontSize: 15, fontWeight: "700" },
});
