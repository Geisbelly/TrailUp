// Tela/bloco de erro com a identidade do perfil (06/11): o rosto do Guardião, a cor e o fundo
// do perfil BrainHex. Antes cada tela improvisava o seu (título "salmon", ícone branco genérico).
import { getBrainHexGuideName, getGuardianFaceImage } from "@/constants/profileImages";
import { FontFamily } from "@/styles/GlobalStyle";
import type { ProfileShellPalette } from "@/utils/profileShellTheme";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import React from "react";
import { Image, Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";

type Props = {
  palette: ProfileShellPalette;
  titulo: string;
  mensagem?: string | null;
  /** Mostra o botão "Tentar de novo". */
  onTentarDeNovo?: () => void;
  rotuloTentar?: string;
  /** `tela` ocupa o espaço todo e pinta o fundo; `bloco` fica dentro de outra tela. */
  variante?: "tela" | "bloco";
  style?: StyleProp<ViewStyle>;
};

export function EstadoDeErro({
  palette,
  titulo,
  mensagem,
  onTentarDeNovo,
  rotuloTentar = "Tentar de novo",
  variante = "tela",
  style,
}: Props) {
  const perfil = palette.profile ?? null;
  const guia = getBrainHexGuideName(perfil);
  return (
    <View
      accessibilityRole="alert"
      style={[variante === "tela" ? s.tela : s.bloco, variante === "tela" ? { backgroundColor: palette.background } : null, style]}
    >
      <View style={[s.rosto, { borderColor: palette.borderStrong, backgroundColor: palette.surfaceElevated }]}>
        <Image source={getGuardianFaceImage(perfil)} style={s.imagem} accessibilityLabel={`${guia}, seu guia`} />
        <View style={[s.selo, { backgroundColor: palette.surfaceElevated, borderColor: palette.accent }]}>
          <MaterialCommunityIcons name="alert-circle-outline" size={16} color={palette.accent} />
        </View>
      </View>
      <Text style={[s.titulo, { color: palette.text }]}>{titulo}</Text>
      {mensagem ? <Text style={[s.mensagem, { color: palette.textMuted }]}>{mensagem}</Text> : null}
      {onTentarDeNovo ? (
        <Pressable
          accessibilityRole="button"
          onPress={onTentarDeNovo}
          style={[s.botao, { backgroundColor: palette.accent }]}
        >
          <Text style={[s.botaoTexto, { color: palette.background }]}>{rotuloTentar}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  tela: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 12 },
  bloco: { alignItems: "center", justifyContent: "center", paddingVertical: 32, paddingHorizontal: 20, gap: 12 },
  rosto: { width: 76, height: 76, borderRadius: 38, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  imagem: { width: 70, height: 70, borderRadius: 35 },
  selo: {
    position: "absolute",
    right: -4,
    bottom: -4,
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  titulo: { fontFamily: FontFamily.inikaBold, fontSize: 19, textAlign: "center" },
  mensagem: { fontFamily: FontFamily.interMedium, fontSize: 14, lineHeight: 21, textAlign: "center", maxWidth: 360 },
  botao: { marginTop: 4, borderRadius: 999, paddingHorizontal: 20, paddingVertical: 11 },
  botaoTexto: { fontFamily: FontFamily.interMedium, fontSize: 14, fontWeight: "700" },
});
