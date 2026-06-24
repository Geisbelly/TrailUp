/**
 * Loading.tsx
 *
 * IMPORTANTE — todas as animações usam useNativeDriver: false.
 * O Fabric (nova arquitetura) propaga __makeNative por toda a árvore de
 * interpolações. Misturar true e false em qualquer nó compartilhado gera
 * "shadowColor / width is not supported by native animated module".
 * Com tudo em JS driver não há conflito e a performance é aceitável
 * num componente de carregamento.
 */

import { HallBackground, OrnamentDivider } from "@/components/HallTheme";
import {
  bannerImages,
  getBrainHexConfig,
  getBrainHexGuideName,
  getProfileImageByString,
} from "@/constants/profileImages";
import { useUsuario } from "@/context/SessaoContext";
import { FontFamily } from "@/styles/GlobalStyle";
import {
  buildProfileShellPaletteFromAccent,
  getProfileShellPalette,
} from "@/utils/profileShellTheme";
import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Image,
  ImageSourcePropType,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
import tinycolor from "tinycolor2";

interface LoadingScreenProps {
  forceShow?: boolean;
}

const defaultPalette = buildProfileShellPaletteFromAccent("#6366f1", "magica");
const defaultGold = tinycolor(defaultPalette.accent).lighten(12).toHexString();

// ─── driver: false em TUDO ────────────────────────────────────────────────────
const ND = { useNativeDriver: false } as const;

const LoadingScreen = ({ forceShow = false }: LoadingScreenProps) => {
  const { usuario } = useUsuario();
  const { width: screenWidth } = useWindowDimensions();
  const BAR_MAX = screenWidth * 0.72;

  // Valores animados
  const progress      = useRef(new Animated.Value(0)).current;
  const themeProgress = useRef(new Animated.Value(0)).current;
  const pulseAnim     = useRef(new Animated.Value(0.88)).current;
  const pulseOpacity  = useRef(new Animated.Value(0.5)).current;
  const flashAnim     = useRef(new Animated.Value(0)).current;
  const guideReveal   = useRef(new Animated.Value(0)).current;

  // Estado
  const [defaultImg]  = useState<ImageSourcePropType>(bannerImages[9]);
  const [profileImg, setProfileImg] = useState<ImageSourcePropType | null>(null);
  const [imageState, setImageState] = useState<"default" | "transitioning" | "profile">("default");
  const [canHide, setCanHide] = useState(false);

  // Segurança: garante que o loading sempre fecha mesmo em caso de falha
  useEffect(() => {
    const t = setTimeout(() => setCanHide(true), 6000);
    return () => clearTimeout(t);
  }, []);

  // Perfil majoritário
  const perfilPrincipal = useMemo(() => {
    if (!usuario?.perfis?.length) return null;
    return [...usuario.perfis].sort((a, b) => (b.afinidade ?? 0) - (a.afinidade ?? 0))[0];
  }, [usuario?.perfis]);

  const targetPalette = useMemo(
    () => getProfileShellPalette(perfilPrincipal?.nome ?? null),
    [perfilPrincipal?.nome]
  );

  const profileConfig = useMemo(
    () => getBrainHexConfig(perfilPrincipal?.nome ?? undefined),
    [perfilPrincipal?.nome]
  );

  const guideName    = perfilPrincipal ? getBrainHexGuideName(perfilPrincipal.nome) : null;
  const profileLabel = perfilPrincipal ? profileConfig.label : null;

  // Barra pulsante
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(progress, { toValue: 1,    duration: 1400, ...ND }),
        Animated.timing(progress, { toValue: 0.12, duration: 1400, ...ND }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [progress]);

  // Anel pulsante
  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.parallel([
          Animated.timing(pulseAnim,    { toValue: 1.22, duration: 1100, ...ND }),
          Animated.timing(pulseOpacity, { toValue: 0.10, duration: 1100, ...ND }),
        ]),
        Animated.parallel([
          Animated.timing(pulseAnim,    { toValue: 0.88, duration: 1100, ...ND }),
          Animated.timing(pulseOpacity, { toValue: 0.50, duration: 1100, ...ND }),
        ]),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [pulseAnim, pulseOpacity]);

  // Flash + crossfade + transição de paleta
  useEffect(() => {
    if (!perfilPrincipal || imageState !== "default") return;

    const nextImage =
      getProfileImageByString(perfilPrincipal.nome || "") ??
      profileConfig.image ??
      bannerImages[9];

    setImageState("transitioning");

    const timer = setTimeout(() => {
      setProfileImg(nextImage);

      Animated.sequence([
        Animated.timing(flashAnim, { toValue: 0.55, duration: 130, ...ND }),
        Animated.timing(flashAnim, { toValue: 0,    duration: 600, ...ND }),
      ]).start();

      Animated.timing(themeProgress, { toValue: 1, duration: 1400, ...ND }).start(() => {
        setImageState("profile");
        Animated.timing(guideReveal, { toValue: 1, duration: 450, ...ND }).start();
      });
    }, 400);

    return () => clearTimeout(timer);
  }, [imageState, perfilPrincipal, themeProgress, profileConfig, flashAnim, guideReveal]);

  useEffect(() => {
    if (!usuario || perfilPrincipal || imageState !== "default") return;
    setImageState("profile");
  }, [imageState, perfilPrincipal, usuario]);

  useEffect(() => {
    if (imageState !== "profile" || canHide) return;
    const t = setTimeout(() => setCanHide(true), 1000);
    return () => clearTimeout(t);
  }, [canHide, imageState]);

  if (!forceShow && canHide) return null;

  // ── Interpolações (todas JS) ──────────────────────────────────────────────
  const ip = (out: [string, string]) =>
    themeProgress.interpolate({ inputRange: [0, 1], outputRange: out });

  const backgroundColor    = ip([defaultPalette.background,      targetPalette.background]);
  const shellColor         = ip([defaultPalette.surfaceElevated, targetPalette.surfaceElevated]);
  const borderColorAnim    = ip([defaultPalette.borderStrong,    targetPalette.borderStrong]);
  const progressTrackColor = ip([defaultPalette.progressTrack,   targetPalette.progressTrack]);
  const progressFillColor  = ip([defaultPalette.accent,          targetPalette.accent]);
  const textColor          = ip([defaultPalette.text,            targetPalette.text]);
  const subtleTextColor    = ip([defaultPalette.textMuted,       targetPalette.textMuted]);
  const accentColor        = ip([defaultPalette.accent,          targetPalette.accent]);

  const defaultImageOpacity = themeProgress.interpolate({
    inputRange: [0, 0.6, 1], outputRange: [1, 0.2, 0], extrapolate: "clamp",
  });
  const profileImageOpacity = themeProgress.interpolate({
    inputRange: [0, 0.3, 1], outputRange: [0, 0.4, 1], extrapolate: "clamp",
  });

  // Barra: largura em pixels (JS driver suporta, native driver não suporta)
  const progressWidth = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [BAR_MAX * 0.08, BAR_MAX],
  });

  // Anel: scale + opacity (JS driver)
  const ringScale   = pulseAnim;
  const ringOpacity = pulseOpacity;

  // Guia: slide-up + fade (JS driver)
  const guideOpacity = guideReveal;
  const guideSlide   = guideReveal.interpolate({ inputRange: [0, 1], outputRange: [10, 0] });

  const loadingText =
    imageState === "transitioning"
      ? "Perfil identificado"
      : imageState === "profile" && perfilPrincipal
      ? `${profileLabel} detectado`
      : "Preparando sua sessão";

  const loadingHint =
    imageState === "profile"
      ? "Identidade visual e recursos sendo adaptados ao seu perfil."
      : "Carregando seu ambiente de estudo.";

  return (
    <Animated.View style={[styles.container, { backgroundColor }]}>

      {/* Textura medieval */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none">
        <HallBackground palette={defaultPalette} />
      </View>

      {/* Gradiente candelabro */}
      <LinearGradient
        colors={[
          tinycolor(defaultPalette.accent).setAlpha(0.35).toRgbString(),
          tinycolor(defaultPalette.accent).setAlpha(0.08).toRgbString(),
          "transparent",
        ]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={[StyleSheet.absoluteFill, { height: "55%" }]}
        pointerEvents="none"
      />

      {/* Flash místico (JS driver, opacity) */}
      <Animated.View
        style={[StyleSheet.absoluteFill, styles.flash, { opacity: flashAnim }]}
        pointerEvents="none"
      />

      {/* Ícone do guia */}
      <View style={styles.iconContainer}>

        {/* Anel pulsante — scale + opacity, JS driver */}
        <Animated.View
          style={[
            styles.pulseRing,
            { transform: [{ scale: ringScale }], opacity: ringOpacity },
          ]}
        />

        {/* Glow — views estáticas, sem props animadas */}
        <View style={styles.glowOuter}>
          <View style={styles.glowMiddle}>

            {/* Círculo do ícone — JS driver (backgroundColor + borderColor) */}
            <Animated.View
              style={[
                styles.iconCircle,
                { backgroundColor: shellColor, borderColor: borderColorAnim },
              ]}
            >
              <Animated.View style={[StyleSheet.absoluteFill, { opacity: defaultImageOpacity }]}>
                <Image source={defaultImg} style={styles.icon} resizeMode="cover" />
              </Animated.View>

              {profileImg && (
                <Animated.View style={[StyleSheet.absoluteFill, { opacity: profileImageOpacity }]}>
                  <Image source={profileImg} style={styles.icon} resizeMode="cover" />
                </Animated.View>
              )}
            </Animated.View>

          </View>
        </View>
      </View>

      {/* Nome do guia — slide-up + fade, JS driver */}
      {guideName && (
        <Animated.View
          style={[
            styles.guideRow,
            { opacity: guideOpacity, transform: [{ translateY: guideSlide }] },
          ]}
        >
          <Animated.Text style={[styles.guideLabel, { color: accentColor }]}>
            {profileLabel}  ·  {guideName}
          </Animated.Text>
        </Animated.View>
      )}

      {/* Ornamento */}
      <View style={styles.ornamentWrap}>
        <OrnamentDivider color={defaultGold} />
      </View>

      {/* Texto de status */}
      <Animated.Text style={[styles.loadingText, { color: textColor }]}>
        {loadingText}
      </Animated.Text>
      <Animated.Text style={[styles.loadingHint, { color: subtleTextColor }]}>
        {loadingHint}
      </Animated.Text>

      {/* Barra — width em pixels, JS driver */}
      <View style={[styles.barOuter, { width: BAR_MAX }]}>
        <Animated.View style={[styles.barTrack, { backgroundColor: progressTrackColor }]}>
          <Animated.View
            style={[styles.barFill, { width: progressWidth, backgroundColor: progressFillColor }]}
          />
        </Animated.View>
      </View>

    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: 0, left: 0, right: 0, bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
    zIndex: 9999,
    elevation: 9999,
  },
  flash: {
    backgroundColor: "#b8b0ff",
    zIndex: 1,
  },
  iconContainer: {
    marginBottom: 12,
    alignItems: "center",
    justifyContent: "center",
    width: 224,
    height: 224,
  },
  pulseRing: {
    position: "absolute",
    width: 214,
    height: 214,
    borderRadius: 107,
    borderWidth: 2,
    borderColor: defaultPalette.accent,  // cor estática, não animada
  },
  // glowOuter / glowMiddle: Views estáticas (sem Animated) — shadowColor é estático
  glowOuter: {
    width: 200,
    height: 200,
    borderRadius: 100,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: defaultPalette.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.55,
    shadowRadius: 50,
    elevation: 24,
  },
  glowMiddle: {
    width: 174,
    height: 174,
    borderRadius: 87,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: defaultPalette.accent,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.35,
    shadowRadius: 30,
  },
  iconCircle: {
    width: 148,
    height: 148,
    borderRadius: 74,
    overflow: "hidden",
    borderWidth: 1.5,
  },
  icon: {
    width: 148,
    height: 148,
  },
  guideRow: {
    marginBottom: 6,
    alignItems: "center",
  },
  guideLabel: {
    fontFamily: FontFamily.inikaBold,
    fontSize: 13,
    letterSpacing: 2.5,
    textTransform: "uppercase",
    textShadowColor: "rgba(0,0,0,0.7)",
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 6,
  },
  ornamentWrap: {
    width: "68%",
    marginVertical: 10,
    opacity: 0.72,
  },
  loadingText: {
    fontSize: 17,
    fontFamily: FontFamily.inknutAntiquaMedium,
    letterSpacing: 0.8,
    marginBottom: 8,
    textAlign: "center",
  },
  loadingHint: {
    fontFamily: FontFamily.interMedium,
    fontSize: 13,
    marginBottom: 26,
    textAlign: "center",
    maxWidth: 300,
    lineHeight: 20,
  },
  barOuter: {
    height: 10,
    borderRadius: 999,
    overflow: "hidden",
  },
  barTrack: {
    flex: 1,
    borderRadius: 999,
  },
  barFill: {
    height: "100%",
    borderRadius: 999,
  },
});

export default LoadingScreen;
