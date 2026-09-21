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
import { designStar, profileEmblems } from "@/constants/designAssets";
import { ProfileArtwork } from "@/components/ProfileArtwork";
import { normalizeBrainHexProfile } from "@/constants/brainHexProfiles";
import { Design } from "@/styles/design";
import {
  getBrainHexConfig,
  getBrainHexGuideName,
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
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
import tinycolor from "tinycolor2";

interface LoadingScreenProps {
  forceShow?: boolean;
}

const defaultPalette = buildProfileShellPaletteFromAccent(Design.primary, "magica");

// ─── driver: false em TUDO ────────────────────────────────────────────────────
const ND = { useNativeDriver: false } as const;

const LoadingScreen = ({ forceShow = false }: LoadingScreenProps) => {
  const { usuario, autenticado } = useUsuario();
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
  const [imageState, setImageState] = useState<"default" | "transitioning" | "profile">("default");
  const [canHide, setCanHide] = useState(false);

  // Segurança: garante que o loading sempre fecha mesmo em caso de falha
  useEffect(() => {
    const t = setTimeout(() => setCanHide(true), 6000);
    return () => clearTimeout(t);
  }, []);

  const activeProfile = autenticado
    ? normalizeBrainHexProfile(usuario?.perfilAtivo ?? usuario?.perfis?.[0]?.nome)
    : null;
  const profileImg = activeProfile ? profileEmblems[activeProfile] : null;

  const targetPalette = useMemo(
    () => activeProfile ? getProfileShellPalette(activeProfile) : defaultPalette,
    [activeProfile]
  );

  const profileConfig = useMemo(
    () => getBrainHexConfig(activeProfile ?? undefined),
    [activeProfile]
  );

  const guideName    = activeProfile ? getBrainHexGuideName(activeProfile) : null;
  const profileLabel = activeProfile ? profileConfig.label : null;

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

  // Reveal the active profile emblem without flashing the public purple theme.
  useEffect(() => {
    themeProgress.setValue(0);
    guideReveal.setValue(0);
    if (!activeProfile) {
      setImageState("default");
      return;
    }
    setImageState("transitioning");

    const timer = setTimeout(() => {
      Animated.sequence([
        Animated.timing(flashAnim, { toValue: 0.55, duration: 130, ...ND }),
        Animated.timing(flashAnim, { toValue: 0,    duration: 600, ...ND }),
      ]).start();

      Animated.timing(themeProgress, { toValue: 1, duration: 1400, ...ND }).start(({ finished }) => {
        if (!finished) return;
        setImageState("profile");
        Animated.timing(guideReveal, { toValue: 1, duration: 450, ...ND }).start();
      });
    }, 400);

    return () => {
      clearTimeout(timer);
      themeProgress.stopAnimation();
      flashAnim.stopAnimation();
      guideReveal.stopAnimation();
    };
  }, [activeProfile, themeProgress, flashAnim, guideReveal]);

  useEffect(() => {
    if (!usuario || activeProfile || imageState !== "default") return;
    setImageState("profile");
  }, [imageState, activeProfile, usuario]);

  useEffect(() => {
    if (imageState !== "profile" || canHide) return;
    const t = setTimeout(() => setCanHide(true), 1000);
    return () => clearTimeout(t);
  }, [canHide, imageState]);

  if (!forceShow && canHide) return null;

  const backgroundColor    = targetPalette.background;
  const shellColor         = targetPalette.surfaceElevated;
  const borderColorAnim    = targetPalette.borderStrong;
  const progressTrackColor = targetPalette.progressTrack;
  const progressFillColor  = targetPalette.accent;
  const textColor          = targetPalette.text;
  const subtleTextColor    = targetPalette.textMuted;
  const accentColor        = targetPalette.accent;

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
      : imageState === "profile" && activeProfile
      ? `${profileLabel} detectado`
      : "Preparando sua sessão";

  const loadingHint =
    imageState === "profile"
      ? "Identidade visual e recursos sendo adaptados ao seu perfil."
      : "Carregando seu ambiente de estudo.";

  return (
    <Animated.View style={[styles.container, { backgroundColor }]}>

      {/* Textura medieval */}
      <View style={[StyleSheet.absoluteFill, { pointerEvents: "none" }]}>
        <HallBackground palette={targetPalette} />
      </View>

      {/* Gradiente candelabro */}
      <LinearGradient
        colors={[
          tinycolor(targetPalette.accent).setAlpha(0.35).toRgbString(),
          tinycolor(targetPalette.accent).setAlpha(0.08).toRgbString(),
          "transparent",
        ]}
        start={{ x: 0.5, y: 0 }}
        end={{ x: 0.5, y: 1 }}
        style={[StyleSheet.absoluteFill, { height: "55%", pointerEvents: "none" }]}
      />

      {/* Flash místico (JS driver, opacity) */}
      <Animated.View
        style={[StyleSheet.absoluteFill, styles.flash, { backgroundColor: targetPalette.accent, opacity: flashAnim, pointerEvents: "none" }]}
      />

      {/* Ícone do guia */}
      <View style={styles.iconContainer}>

        {/* Anel pulsante — scale + opacity, JS driver */}
        <Animated.View
          style={[
            styles.pulseRing,
            { transform: [{ scale: ringScale }], opacity: ringOpacity, borderColor: targetPalette.accent },
          ]}
        />

        {/* Glow — views estáticas, sem props animadas */}
        <View style={[styles.glowOuter, { shadowColor: targetPalette.accent }]}>
          <View style={[styles.glowMiddle, { shadowColor: targetPalette.accent }]}>

            {/* Círculo do ícone — JS driver (backgroundColor + borderColor) */}
            <Animated.View
              style={[
                styles.iconCircle,
                { backgroundColor: shellColor, borderColor: borderColorAnim },
              ]}
            >
              <Animated.View style={[StyleSheet.absoluteFill, { opacity: defaultImageOpacity }]}>
                <ProfileArtwork source={designStar} profile={activeProfile} width={148} />
              </Animated.View>

              {autenticado && profileImg && (
                <Animated.View style={[StyleSheet.absoluteFill, { opacity: profileImageOpacity }]}>
                  <ProfileArtwork source={profileImg} profile={activeProfile} width={148} />
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
        <OrnamentDivider color={targetPalette.accent} />
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
