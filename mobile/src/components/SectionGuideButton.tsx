import {
  getBrainHexConfig,
  getBrainHexGuideName,
  normalizeBrainHexProfile,
} from "@/constants/profileImages";
import { getProfileShellPalette } from "@/utils/profileShellTheme";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Image,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";

export type SectionGuideStep = {
  id: string;
  target: string;
  title: string;
  description: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
};

export type SectionGuideTargetRefs = Record<
  string,
  React.RefObject<View | null> | undefined
>;

type SpotlightRect = { top: number; left: number; width: number; height: number };

export function SectionGuideButton({
  profile,
  sectionTitle,
  steps,
  targetRefs,
  onStepFocus,
  style,
}: {
  profile?: string | null;
  sectionTitle: string;
  steps: SectionGuideStep[];
  targetRefs: SectionGuideTargetRefs;
  onStepFocus?: (step: SectionGuideStep, index: number) => void | Promise<void>;
  style?: object;
}) {
  const buttonRef = useRef<View | null>(null);
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState<SpotlightRect | null>(null);
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const activeProfile = normalizeBrainHexProfile(profile) ?? "seeker";
  const palette = useMemo(() => getProfileShellPalette(activeProfile), [activeProfile]);
  const guide = useMemo(() => getBrainHexConfig(activeProfile), [activeProfile]);
  const guideName = useMemo(() => getBrainHexGuideName(activeProfile), [activeProfile]);
  const currentStep = steps[index] ?? null;

  useEffect(() => {
    if (!open || !currentStep) {
      setRect(null);
      return;
    }

    setRect(null);

    let active = true;
    let timer: ReturnType<typeof setTimeout> | null = null;
    void Promise.resolve(onStepFocus?.(currentStep, index)).then(() => {
      if (!active) return;
      const ref =
        currentStep.target === "guide_button"
          ? buttonRef
          : targetRefs[currentStep.target];
      if (!ref?.current?.measureInWindow) return;

      timer = setTimeout(() => {
        ref.current?.measureInWindow((x, y, width, height) => {
          if (!active || width < 2 || height < 2) return;
          const padding = 6;
          setRect({
            top: Math.max(0, y - padding),
            left: Math.max(0, x - padding),
            width: Math.min(screenWidth, width + padding * 2),
            height: Math.min(screenHeight, height + padding * 2),
          });
        });
      }, 100);
    });

    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [currentStep, index, onStepFocus, open, screenHeight, screenWidth, targetRefs]);

  useEffect(() => {
    setIndex(0);
    setOpen(false);
  }, [activeProfile, sectionTitle, steps]);

  const close = () => {
    setIndex(0);
    setOpen(false);
  };

  return (
    <>
      <Pressable
        ref={buttonRef}
        collapsable={false}
        onPress={() => {
          setIndex(0);
          setOpen(true);
        }}
        accessibilityRole="button"
        accessibilityLabel={`Abrir guia de ${sectionTitle}`}
        style={[
          styles.helpButton,
          {
            backgroundColor: palette.surfaceElevated,
            borderColor: palette.borderStrong,
          },
          style,
        ]}
      >
        <MaterialCommunityIcons
          name="help-circle-outline"
          size={19}
          color={palette.accent}
        />
      </Pressable>

      <Modal transparent animationType="fade" visible={open} onRequestClose={close}>
        <View style={styles.modalRoot}>
          {rect ? (
            <SpotlightMask
              rect={rect}
              screenWidth={screenWidth}
              screenHeight={screenHeight}
              scrim={`${palette.background}e8`}
              accent={palette.accent}
            />
          ) : (
            <View
              pointerEvents="none"
              style={[StyleSheet.absoluteFill, { backgroundColor: `${palette.background}e8` }]}
            />
          )}

          {currentStep ? (
            <View
              style={[
                styles.card,
                rect && rect.top > screenHeight * 0.52 ? styles.cardTop : styles.cardBottom,
                {
                  backgroundColor: palette.surfaceElevated,
                  borderColor: palette.borderStrong,
                },
              ]}
            >
              <View style={styles.headingRow}>
                <Image source={guide.image} style={styles.avatar} />
                <View style={styles.headingCopy}>
                  <Text style={[styles.eyebrow, { color: palette.accent }]}>
                    {guideName} · {sectionTitle}
                  </Text>
                  <Text style={[styles.title, { color: palette.text }]}>
                    {currentStep.title}
                  </Text>
                </View>
                <MaterialCommunityIcons
                  name={currentStep.icon}
                  size={22}
                  color={palette.accent}
                />
              </View>

              <Text style={[styles.description, { color: palette.textMuted }]}>
                {currentStep.description}
              </Text>

              <View style={styles.footer}>
                <Text style={[styles.counter, { color: palette.textSubtle }]}>
                  Passo {index + 1} de {steps.length}
                </Text>
                <View style={styles.actions}>
                  <Pressable
                    onPress={() => (index === 0 ? close() : setIndex((value) => value - 1))}
                    style={[styles.secondary, { borderColor: palette.border }]}
                  >
                    <Text style={[styles.secondaryText, { color: palette.textMuted }]}>
                      {index === 0 ? "Fechar" : "Voltar"}
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => {
                      if (index >= steps.length - 1) close();
                      else setIndex((value) => value + 1);
                    }}
                    style={[styles.primary, { backgroundColor: palette.accent }]}
                  >
                    <Text style={[styles.primaryText, { color: palette.background }]}>
                      {index >= steps.length - 1 ? "Concluir" : "Próximo"}
                    </Text>
                  </Pressable>
                </View>
              </View>
            </View>
          ) : null}
        </View>
      </Modal>
    </>
  );
}

function SpotlightMask({
  rect,
  screenWidth,
  screenHeight,
  scrim,
  accent,
}: {
  rect: SpotlightRect;
  screenWidth: number;
  screenHeight: number;
  scrim: string;
  accent: string;
}) {
  const top = Math.max(0, Math.min(screenHeight, rect.top));
  const left = Math.max(0, Math.min(screenWidth, rect.left));
  const width = Math.max(0, Math.min(screenWidth - left, rect.width));
  const height = Math.max(0, Math.min(screenHeight - top, rect.height));

  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <View style={[styles.scrim, { top: 0, left: 0, right: 0, height: top, backgroundColor: scrim }]} />
      <View style={[styles.scrim, { top, left: 0, width: left, height, backgroundColor: scrim }]} />
      <View style={[styles.scrim, { top, left: left + width, right: 0, height, backgroundColor: scrim }]} />
      <View style={[styles.scrim, { top: top + height, left: 0, right: 0, bottom: 0, backgroundColor: scrim }]} />
      <View style={[styles.spotlight, { top, left, width, height, borderColor: accent, shadowColor: accent }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  helpButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 30,
    opacity: 0.82,
  },
  modalRoot: { flex: 1 },
  scrim: { position: "absolute" },
  spotlight: {
    position: "absolute",
    borderWidth: 2,
    borderRadius: 18,
    shadowOpacity: 0.8,
    shadowRadius: 12,
    elevation: 12,
  },
  card: {
    position: "absolute",
    left: 16,
    right: 16,
    borderRadius: 24,
    borderWidth: 1,
    padding: 18,
    elevation: 20,
  },
  cardTop: { top: 34 },
  cardBottom: { bottom: 34 },
  headingRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  headingCopy: { flex: 1 },
  avatar: { width: 46, height: 46, borderRadius: 23 },
  eyebrow: { fontSize: 11, fontWeight: "700", textTransform: "uppercase" },
  title: { marginTop: 2, fontSize: 21, fontWeight: "700" },
  description: { marginTop: 14, fontSize: 16, lineHeight: 23 },
  footer: { marginTop: 18, gap: 12 },
  counter: { fontSize: 13 },
  actions: { flexDirection: "row", gap: 10 },
  secondary: {
    minHeight: 48,
    flex: 1,
    borderRadius: 15,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  primary: {
    minHeight: 48,
    flex: 1.5,
    borderRadius: 15,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryText: { fontSize: 15, fontWeight: "700" },
  primaryText: { fontSize: 15, fontWeight: "800" },
});
