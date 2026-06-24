import { HallBackground } from "@/components/HallTheme";
import { bannerImages } from "@/constants/profileImages";
import { FontFamily } from "@/styles/GlobalStyle";
import { buildProfileShellPaletteFromAccent } from "@/utils/profileShellTheme";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useEffect } from "react";
import { SafeAreaView, StyleSheet, Text, View } from "react-native";
import tinycolor from "tinycolor2";

// Paleta estática para telas de autenticação — roxo místico
const AUTH_PALETTE = buildProfileShellPaletteFromAccent("#6366f1", "magica");

const Tela_De_Rosto = () => {
  const navigation = useRouter();

  const gold = tinycolor(AUTH_PALETTE.accent).lighten(12).toHexString();
  const goldDim = tinycolor(AUTH_PALETTE.accent).setAlpha(0.45).toRgbString();

  useEffect(() => {
    const timer = setTimeout(() => {
      navigation.replace("/(auth)/login");
    }, 2000);
    return () => clearTimeout(timer);
  }, []);

  return (
    <View style={[styles.outer, { backgroundColor: AUTH_PALETTE.background }]}>
      {/* Fundo do salão */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <HallBackground palette={AUTH_PALETTE} />
      </View>

      {/* Gradiente candelabro */}
      <LinearGradient
        colors={[
          tinycolor(AUTH_PALETTE.accent).setAlpha(0.22).toRgbString(),
          "transparent",
        ]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={[StyleSheet.absoluteFill, { height: "40%" }]}
        pointerEvents="none"
      />

      <SafeAreaView style={styles.container}>
        <View style={styles.textContainer}>
          <Text style={[styles.title, { color: "#fff" }]}>
            BEM VINDO(A) DE VOLTA!
          </Text>
          <Text style={[styles.subtitle, { color: "rgba(255,255,255,0.72)" }]}>
            Sentimos sua falta, ficamos felizes{"\n"}que tenha voltado.
          </Text>

          <View style={[styles.imageRing, { borderColor: goldDim }]}>
            <Image
              source={bannerImages[10]}
              style={styles.image}
            />
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
};

const styles = StyleSheet.create({
  outer: {
    flex: 1,
  },
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
  },
  textContainer: {
    alignItems: "center",
    gap: 10,
  },
  title: {
    fontSize: 22,
    fontFamily: FontFamily.inknutAntiquaMedium,
    fontWeight: "700",
    textAlign: "center",
    letterSpacing: 0.5,
    textShadowColor: "rgba(0,0,0,0.8)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  subtitle: {
    marginTop: 5,
    marginBottom: 25,
    fontSize: 17,
    fontFamily: FontFamily.inknutAntiquaMedium,
    fontWeight: "500",
    textAlign: "center",
    lineHeight: 24,
  },
  imageRing: {
    borderRadius: 100,
    borderWidth: 1.5,
    padding: 4,
  },
  image: {
    width: 180,
    height: 180,
    borderRadius: 200,
  },
});

export default Tela_De_Rosto;
