import { designStar, publicScenery } from "@/constants/designAssets";
import { Design } from "@/styles/design";
import { Image } from "expo-image";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import { useEffect } from "react";
import { Image as CenaImagem, Platform, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { textShadowStyle } from "@/utils/webShadow";

const IS_WEB = Platform.OS === "web";
const SERIF = Platform.select({ ios: "Georgia", android: "serif", default: "Georgia, serif" });

// "Bem-vindo(a) de volta" (protótipo mobile-v1, 00-entrada, estado "volta"): a mesma cena da entrada,
// a frase e o anel com a estrela no centro. Dura ~2s e segue para o login; sem botões.
const Tela_De_Rosto = () => {
  const navigation = useRouter();

  useEffect(() => {
    const timer = setTimeout(() => {
      navigation.replace("/(auth)/login");
    }, 2000);
    return () => clearTimeout(timer);
  }, [navigation]);

  return (
    <View style={styles.outer}>
      <CenaImagem source={publicScenery} style={[StyleSheet.absoluteFill, IS_WEB && styles.cenaWeb]} resizeMode="cover" accessible={false} />
      <LinearGradient
        colors={["rgba(23,14,43,0.08)", "rgba(23,14,43,0.3)", Design.ink]}
        locations={[0, 0.45, 0.82]}
        style={[StyleSheet.absoluteFill, { pointerEvents: "none" }]}
      />
      <SafeAreaView style={styles.container}>
        <View accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.textContainer}>
          <Text style={styles.title}>BEM VINDO(A) DE VOLTA!</Text>
          <Text style={styles.subtitle}>Sentimos sua falta, ficamos felizes{"\n"}que tenha voltado.</Text>
          <View style={styles.imageRing}>
            <Image source={designStar} style={styles.image} contentFit="contain" accessibilityLabel="" />
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
};

const styles = StyleSheet.create({
  outer: { flex: 1, backgroundColor: Design.ink },
  cenaWeb: { width: "100%", height: "100%" },
  container: { flex: 1, justifyContent: "center", alignItems: "center", paddingHorizontal: 32 },
  textContainer: { alignItems: "center", gap: 14 },
  title: {
    fontFamily: SERIF,
    fontSize: 24,
    fontWeight: "700",
    textAlign: "center",
    letterSpacing: 0.5,
    color: Design.text,
    ...textShadowStyle({ color: "rgba(0,0,0,0.8)", offset: { width: 0, height: 2 }, radius: 8 }, IS_WEB),
  },
  subtitle: { fontSize: 15, lineHeight: 22, textAlign: "center", color: "rgba(244,243,247,0.82)" },
  imageRing: {
    width: 168,
    height: 168,
    marginTop: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(149,131,230,0.45)",
    alignItems: "center",
    justifyContent: "center",
  },
  image: { width: 112, height: 112 },
});

export default Tela_De_Rosto;
