import { app } from "@/constants/definicoes";
import { bannerImages } from "@/constants/profileImages";
import { HallBackground, OrnamentDivider } from "@/components/HallTheme";
import { Color, FontFamily } from "@/styles/GlobalStyle";
import { buildProfileShellPaletteFromAccent } from "@/utils/profileShellTheme";
import { LinearGradient } from "expo-linear-gradient";
import { Image } from "expo-image";
import { useRouter } from "expo-router";
import React from "react";
import {
  Linking,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import tinycolor from "tinycolor2";

// Paleta estática para telas de autenticação — roxo místico
const AUTH_PALETTE = buildProfileShellPaletteFromAccent("#6366f1", "magica");

export default function Entrada() {
  const router = useRouter();
  const gold = tinycolor(AUTH_PALETTE.accent).lighten(12).toHexString();
  const goldDim = tinycolor(AUTH_PALETTE.accent).setAlpha(0.55).toRgbString();
  const goldFaint = tinycolor(AUTH_PALETTE.accent).setAlpha(0.12).toRgbString();

  return (
    <View style={[style.outer, { backgroundColor: AUTH_PALETTE.background }]}>
      {/* Fundo do salão */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <HallBackground palette={AUTH_PALETTE} />
      </View>

      {/* Gradiente candelabro no topo */}
      <LinearGradient
        colors={[
          tinycolor(AUTH_PALETTE.accent).setAlpha(0.28).toRgbString(),
          tinycolor(AUTH_PALETTE.accent).setAlpha(0.06).toRgbString(),
          "transparent",
        ]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={[StyleSheet.absoluteFill, { height: "45%" }]}
        pointerEvents="none"
      />

      <SafeAreaView style={style.container}>
        {/* Título */}
        <View style={style.header}>
          <Text style={[style.trailup, { color: "#fff" }]}>
            {app.name.toLocaleUpperCase()}
          </Text>
          <Text style={[style.subtitle, { color: "rgba(255,255,255,0.65)" }]}>
            SUA JORNADA COMEÇA AQUI
          </Text>
        </View>

        {/* Imagem central com glow */}
        <View style={style.compassContainer}>
          <View style={[style.glowOuter, { shadowColor: AUTH_PALETTE.accent }]}>
            <View style={[style.glowMiddle, { shadowColor: AUTH_PALETTE.accent, borderColor: goldDim, backgroundColor: goldFaint }]}>
              <Image
                source={bannerImages[9]}
                style={style.compassImage}
              />
            </View>
          </View>
        </View>

        {/* Ornamento divisor */}
        <View style={style.ornamentRow}>
          <OrnamentDivider color={gold} />
        </View>

        {/* Botões ornamentados */}
        <View style={style.buttonsContainer}>
          <TouchableOpacity
            style={[style.button, { borderColor: gold, backgroundColor: tinycolor(AUTH_PALETTE.accent).darken(5).toHexString() }]}
            onPress={() => Linking.openURL(app.siteCadastro)}
          >
            <Text style={[style.buttonText, { color: "#FFF" }]}>NOVATO(A)</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[style.button, style.buttonSecondary, { borderColor: goldDim, backgroundColor: goldFaint }]}
            onPress={() => router.replace("/(auth)/tela")}
          >
            <Text style={[style.buttonText, { color: gold }]}>JÁ TENHO CONTA</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </View>
  );
}

const style = StyleSheet.create({
  outer: {
    flex: 1,
  },
  container: {
    flex: 1,
    justifyContent: "space-between",
  },

  header: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingTop: 40,
    gap: 6,
  },

  trailup: {
    fontSize: 48,
    fontFamily: FontFamily.inknutAntiquaMedium,
    fontWeight: "700",
    textAlign: "center",
    letterSpacing: 3,
    textShadowColor: "rgba(0,0,0,0.9)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 12,
  },
  subtitle: {
    fontFamily: FontFamily.inikaBold,
    fontSize: 11,
    letterSpacing: 2.5,
  },

  compassContainer: {
    flex: 2.5,
    justifyContent: "center",
    alignItems: "center",
  },

  glowOuter: {
    width: 260,
    height: 260,
    borderRadius: 190,
    justifyContent: "center",
    alignItems: "center",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 80,
    elevation: 30,
  },

  glowMiddle: {
    width: 230,
    height: 230,
    borderRadius: 170,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 60,
  },

  compassImage: {
    width: 220,
    height: 220,
    borderRadius: 200,
  },

  ornamentRow: {
    paddingHorizontal: 28,
    marginVertical: 8,
  },

  buttonsContainer: {
    flex: 1.2,
    width: "100%",
    alignItems: "center",
    justifyContent: "flex-end",
    paddingBottom: 50,
    gap: 15,
  },

  button: {
    width: "85%",
    height: 56,
    borderRadius: 12,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },

  buttonSecondary: {},

  buttonText: {
    fontSize: 16,
    fontFamily: FontFamily.inknutAntiquaMedium,
    fontWeight: "600",
    letterSpacing: 0.5,
  },
});
