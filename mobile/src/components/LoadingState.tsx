import { FontFamily } from "@/styles/GlobalStyle";
import {
  getProfileShellPalette,
  ProfileShellPalette,
} from "@/utils/profileShellTheme";
import React from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import tinycolor from "tinycolor2";

type Props = {
  title?: string;
  message?: string;
  color?: string;
  palette?: ProfileShellPalette | null;
};

export function LoadingState({
  title = "Carregando",
  message = "Aguarde enquanto buscamos as informações.",
  color,
  palette,
}: Props) {
  const effectivePalette = palette ?? getProfileShellPalette(null);
  const indicatorColor = color || effectivePalette.accent;
  const gold = tinycolor(effectivePalette.accent).lighten(10).toHexString();
  const goldDim = tinycolor(effectivePalette.accent).setAlpha(0.4).toRgbString();

  return (
    <View style={[styles.container, { backgroundColor: effectivePalette.background }]}>
      <View
        style={[
          styles.indicatorShell,
          {
            backgroundColor: effectivePalette.surfaceElevated,
            borderColor: goldDim,
            shadowColor: effectivePalette.accent,
            shadowOpacity: 0.35,
            shadowRadius: 18,
            shadowOffset: { width: 0, height: 0 },
            elevation: 8,
          },
        ]}
      >
        <ActivityIndicator size="large" color={indicatorColor} />
      </View>
      <Text style={[styles.title, { color: gold, textShadowColor: "rgba(0,0,0,0.7)", textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 4 }]}>{title}</Text>
      <Text style={[styles.message, { color: effectivePalette.textMuted }]}>
        {message}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
    gap: 8,
  },
  indicatorShell: {
    width: 82,
    height: 82,
    borderRadius: 26,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 10,
  },
  title: {
    fontFamily: FontFamily.inikaBold,
    fontSize: 18,
    marginTop: 6,
    textAlign: "center",
  },
  message: {
    fontFamily: FontFamily.interMedium,
    fontSize: 14,
    textAlign: "center",
  },
});
