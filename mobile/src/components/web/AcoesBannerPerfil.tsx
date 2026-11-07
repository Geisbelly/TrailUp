import { MaterialCommunityIcons } from "@expo/vector-icons";
import { router } from "expo-router";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import tinycolor from "tinycolor2";

import { UtilityIcon } from "@/components/UtilityIcon";
import { FontFamily } from "@/styles/GlobalStyle";
import type { ProfileShellPalette } from "@/utils/profileShellTheme";

/**
 * Botões no canto do banner do Perfil na web em tela larga (#346, protótipo v4,
 * 08-perfil-hub.html): "Trocar banner" (abre Informações pessoais, onde o banner
 * é escolhido), Configurações, Biblioteca de conquistas e Bag, em vidro sobre a
 * imagem. As refs são os alvos do tutorial do Perfil.
 */
export function AcoesBannerPerfil({
  palette,
  configuracoesRef,
  bibliotecaRef,
  onAbrirBag,
}: {
  palette: ProfileShellPalette;
  configuracoesRef?: React.RefObject<View | null>;
  bibliotecaRef?: React.RefObject<View | null>;
  onAbrirBag: () => void;
}) {
  const vidro = {
    backgroundColor: tinycolor(palette.background).setAlpha(0.7).toRgbString(),
    borderColor: palette.borderStrong,
  };
  const estilo = (extra?: object) =>
    ({ hovered }: { hovered?: boolean; pressed: boolean }) => [
      s.botao,
      vidro,
      extra,
      hovered ? { backgroundColor: palette.surfaceElevated } : null,
    ];

  return (
    <View style={s.linha}>
      <Pressable
        accessibilityRole="link"
        onPress={() => router.push("/(tabs)/perfil/settings?sub=info")}
        style={estilo()}
      >
        <MaterialCommunityIcons name="camera-outline" size={18} color={palette.text} />
        <Text style={[s.texto, { color: palette.text }]}>Trocar banner</Text>
      </Pressable>
      <View ref={configuracoesRef} collapsable={false}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Configurações"
          onPress={() => router.push("/(tabs)/perfil/settings")}
          style={estilo(s.icone)}
        >
          <UtilityIcon kind="settings" size={22} />
        </Pressable>
      </View>
      <View ref={bibliotecaRef} collapsable={false}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Biblioteca de conquistas"
          onPress={() => router.push("/(tabs)/perfil/biblioteca-conquistas")}
          style={estilo(s.icone)}
        >
          <UtilityIcon kind="achievements" size={22} />
        </Pressable>
      </View>
      <Pressable accessibilityRole="button" accessibilityLabel="Abrir minha Bag" onPress={onAbrirBag} style={estilo(s.icone)}>
        <UtilityIcon kind="bag" size={22} />
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
  linha: { position: "absolute", top: 14, right: 14, flexDirection: "row", gap: 8, zIndex: 6 },
  botao: { height: 40, borderRadius: 10, borderWidth: 1, paddingHorizontal: 14, flexDirection: "row", alignItems: "center", gap: 8 },
  icone: { width: 40, paddingHorizontal: 0, justifyContent: "center" },
  texto: { fontFamily: FontFamily.interMedium, fontSize: 13, fontWeight: "600" },
});
