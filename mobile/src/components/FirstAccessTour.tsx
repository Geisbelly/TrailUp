import AsyncStorage from "@react-native-async-storage/async-storage";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";
import tinycolor from "tinycolor2";

import {
  getBrainHexConfig,
  getBrainHexGuideName,
  guardianFullImages,
  normalizeBrainHexProfile,
} from "@/constants/profileImages";
import { getProfileShellPalette } from "@/utils/profileShellTheme";
import {
  buildFirstAccessTourSteps,
  buildFirstAccessTourStorageKey,
} from "@/utils/firstAccessTour";

type StoredTourState = {
  completed?: boolean;
  step?: number;
};

export function FirstAccessTour({
  userId,
  profile,
}: {
  userId?: string | null;
  profile?: string | null;
}) {
  const router = useRouter();
  const { width, height } = useWindowDimensions();
  const normalizedProfile = normalizeBrainHexProfile(profile);
  const storageKey = userId ? buildFirstAccessTourStorageKey(userId) : null;
  const steps = useMemo(() => buildFirstAccessTourSteps(profile), [profile]);
  const palette = useMemo(() => getProfileShellPalette(profile), [profile]);
  const guideConfig = useMemo(() => getBrainHexConfig(profile ?? undefined), [profile]);
  const guideName = useMemo(() => getBrainHexGuideName(profile), [profile]);
  const [visible, setVisible] = useState(false);
  const [index, setIndex] = useState(0);
  const loadedKeyRef = useRef<string | null>(null);
  const persistQueueRef = useRef<Promise<void>>(Promise.resolve());
  const currentStep = steps[index] ?? steps[0];

  useEffect(() => {
    if (!storageKey || !normalizedProfile || loadedKeyRef.current === storageKey) return;

    loadedKeyRef.current = storageKey;
    let active = true;
    void AsyncStorage.getItem(storageKey)
      .then((raw) => {
        if (!active) return;
        let stored: StoredTourState = {};
        if (raw) {
          try {
            stored = JSON.parse(raw) as StoredTourState;
          } catch {
            stored = {};
          }
        }
        if (stored.completed) return;

        const resumeAt = Math.max(
          0,
          Math.min(steps.length - 1, Number(stored.step ?? 0) || 0),
        );
        setIndex(resumeAt);
        setVisible(true);
      })
      .catch((error) => {
        console.warn("[FirstAccessTour] Falha ao consultar tutorial:", error);
      });

    return () => {
      active = false;
    };
  }, [normalizedProfile, steps.length, storageKey]);

  useEffect(() => {
    if (!visible || !currentStep || !storageKey) return;
    router.replace(currentStep.route as never);
    persistQueueRef.current = persistQueueRef.current
      .then(() =>
        AsyncStorage.setItem(
          storageKey,
          JSON.stringify({ completed: false, step: index } satisfies StoredTourState),
        ),
      )
      .catch((error) => {
        console.warn("[FirstAccessTour] Falha ao salvar etapa:", error);
      });
  }, [currentStep, index, router, storageKey, visible]);

  const finish = useCallback(async () => {
    if (storageKey) {
      try {
        await persistQueueRef.current;
        await AsyncStorage.setItem(
          storageKey,
          JSON.stringify({ completed: true, step: steps.length - 1 } satisfies StoredTourState),
        );
      } catch (error) {
        console.warn("[FirstAccessTour] Falha ao concluir tutorial:", error);
      }
    }
    setVisible(false);
    setIndex(0);
    router.replace("/(tabs)" as never);
  }, [router, steps.length, storageKey]);

  if (!normalizedProfile || !currentStep) return null;

  const isLast = index >= steps.length - 1;
  const compact = height < 720;
  const guideOnRight = index % 2 === 1;
  const imageHeight = Math.min(height * (compact ? 0.39 : 0.46), 430);
  const imageWidth = Math.min(width * 0.64, 310);
  const accent = guideConfig.color;
  const bubbleBorder = tinycolor(accent).lighten(12).setAlpha(0.75).toRgbString();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={() => void finish()}
    >
      <View style={styles.root}>
        <View style={[StyleSheet.absoluteFill, { backgroundColor: `${palette.background}dc` }]} />

        {currentStep.highlight === "navigation" ? (
          <View
            pointerEvents="none"
            style={[
              styles.navigationHighlight,
              {
                borderColor: accent,
                shadowColor: accent,
                bottom: 8,
                height: Math.min(108, height * 0.15),
              },
            ]}
          />
        ) : null}

        <View style={[styles.topBar, { paddingTop: Math.max(18, height * 0.025) }]}>
          <View style={[styles.pageChip, { backgroundColor: palette.surfaceElevated, borderColor: bubbleBorder }]}>
            <MaterialCommunityIcons name="map-marker-path" size={15} color={accent} />
            <Text style={[styles.pageChipText, { color: palette.text }]}>{currentStep.page}</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Pular tutorial inicial"
            onPress={() => void finish()}
            style={[styles.skipButton, { borderColor: palette.border }]}
          >
            <Text style={[styles.skipText, { color: palette.textMuted }]}>Pular</Text>
          </Pressable>
        </View>

        <View
          style={[
            styles.speechBubble,
            {
              top: compact ? 76 : 92,
              backgroundColor: palette.surfaceElevated,
              borderColor: bubbleBorder,
            },
          ]}
        >
          <View style={styles.speakerRow}>
            <Text style={[styles.speaker, { color: accent }]}>{guideName}</Text>
            <Text style={[styles.counter, { color: palette.textSubtle }]}>
              {index + 1}/{steps.length}
            </Text>
          </View>
          <Text style={[styles.title, { color: palette.text }]}>{currentStep.title}</Text>
          <Text style={[styles.description, { color: palette.textMuted }]}>
            {currentStep.description}
          </Text>

          <View style={styles.progressRow}>
            {steps.map((step, stepIndex) => (
              <View
                key={step.id}
                style={[
                  styles.progressDot,
                  {
                    backgroundColor:
                      stepIndex <= index ? accent : palette.border,
                  },
                ]}
              />
            ))}
          </View>

          <View style={styles.actions}>
            <Pressable
              disabled={index === 0}
              onPress={() => setIndex((value) => Math.max(0, value - 1))}
              style={[
                styles.backButton,
                { borderColor: palette.border, opacity: index === 0 ? 0.35 : 1 },
              ]}
            >
              <Text style={[styles.backText, { color: palette.textMuted }]}>Voltar</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                if (isLast) void finish();
                else setIndex((value) => Math.min(steps.length - 1, value + 1));
              }}
              style={[styles.nextButton, { backgroundColor: accent }]}
            >
              <Text style={styles.nextText}>{isLast ? "Começar" : "Próximo"}</Text>
            </Pressable>
          </View>

          <View
            style={[
              styles.bubbleTail,
              guideOnRight ? styles.tailRight : styles.tailLeft,
              { borderTopColor: bubbleBorder },
            ]}
          />
        </View>

        <Image
          source={guardianFullImages[normalizedProfile]}
          resizeMode="contain"
          accessibilityLabel={`${guideName}, guia do perfil`}
          style={[
            styles.guideImage,
            {
              width: imageWidth,
              height: imageHeight,
              bottom: currentStep.highlight === "navigation" ? 96 : 18,
            },
            guideOnRight ? styles.guideRight : styles.guideLeft,
          ]}
        />
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  topBar: {
    position: "absolute",
    left: 18,
    right: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    zIndex: 4,
  },
  pageChip: {
    minHeight: 34,
    maxWidth: "72%",
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },
  pageChipText: { fontSize: 12, fontWeight: "700" },
  skipButton: {
    minHeight: 34,
    paddingHorizontal: 14,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  skipText: { fontSize: 12, fontWeight: "700" },
  speechBubble: {
    position: "absolute",
    left: 16,
    right: 16,
    zIndex: 3,
    borderWidth: 1.5,
    borderRadius: 24,
    padding: 18,
    shadowColor: "#000",
    shadowOpacity: 0.42,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 20,
  },
  speakerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  speaker: { fontSize: 12, fontWeight: "900", letterSpacing: 1.2, textTransform: "uppercase" },
  counter: { fontSize: 12, fontWeight: "700" },
  title: { marginTop: 7, fontSize: 21, lineHeight: 26, fontWeight: "800" },
  description: { marginTop: 9, fontSize: 15, lineHeight: 21 },
  progressRow: { flexDirection: "row", gap: 4, marginTop: 14 },
  progressDot: { flex: 1, height: 3, borderRadius: 2 },
  actions: { flexDirection: "row", gap: 10, marginTop: 15 },
  backButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  nextButton: {
    flex: 1.45,
    minHeight: 44,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  backText: { fontSize: 14, fontWeight: "700" },
  nextText: { color: "#FFFFFF", fontSize: 14, fontWeight: "900" },
  bubbleTail: {
    position: "absolute",
    bottom: -15,
    width: 0,
    height: 0,
    borderLeftWidth: 13,
    borderRightWidth: 13,
    borderTopWidth: 16,
    borderLeftColor: "transparent",
    borderRightColor: "transparent",
  },
  tailLeft: { left: 64 },
  tailRight: { right: 64 },
  guideImage: { position: "absolute", zIndex: 2 },
  guideLeft: { left: 2 },
  guideRight: { right: 2 },
  navigationHighlight: {
    position: "absolute",
    left: 8,
    right: 8,
    borderWidth: 2,
    borderRadius: 24,
    shadowOpacity: 0.9,
    shadowRadius: 16,
    elevation: 3,
  },
});
