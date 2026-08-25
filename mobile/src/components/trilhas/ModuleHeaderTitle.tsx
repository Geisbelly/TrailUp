import {
  BrainHexProfile,
  getBrainHexConfig,
  getBrainHexGuideName,
  normalizeBrainHexProfile,
} from "@/constants/profileImages";
import { Color, FontFamily } from "@/styles/GlobalStyle";
import { getProfileShellPalette } from "@/utils/profileShellTheme";
import {
  buildTrilhaGuideContent,
  TrilhaGuideScope,
  TrilhaGuideTarget,
} from "@/utils/trilhaGuide";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import React, { useEffect, useMemo, useState } from "react";
import {
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";

type GuideVisibleElements = {
  visualMode?: "mapa" | "arvore" | "lista" | null;
  hasChat?: boolean;
  hasTimer?: boolean;
  hasBattle?: boolean;
  hasProgress?: boolean;
};

type Props = {
  title: string;
  description?: string | null;
  profile: BrainHexProfile | string | null | undefined;
  totalBlocks?: number | null;
  completedBlocks?: number | null;
  hideGuideButton?: boolean;
  guideVariant?: "personalizado" | "mock_modulo" | "padrao_trilha" | null;
  visibleElements?: GuideVisibleElements;
  perfis?: { nome?: string | null; afinidade?: number | null }[] | null;
};

function resolveSpotlightStyle(
  target: TrilhaGuideTarget,
  scope: TrilhaGuideScope,
  screenWidth: number,
  screenHeight: number,
) {
  if (scope === "trilha") {
    switch (target) {
      case "progress":
        return { top: 88, left: 14, width: screenWidth - 28, height: 94 };
      case "map":
      case "tree":
      case "list":
      case "journey":
        return {
          top: 176,
          left: 12,
          width: screenWidth - 24,
          height: Math.min(332, screenHeight * 0.44),
        };
      case "chat":
        return { right: 10, bottom: 52, width: 86, height: 86 };
      default:
        return { top: 110, left: 16, width: screenWidth - 32, height: 80 };
    }
  }

  switch (target) {
    case "guide_button":
      return { top: 54, right: 14, width: 48, height: 48 };
    case "progress":
      return { top: 104, left: 14, width: screenWidth - 28, height: 88 };
    case "timer":
      return {
        top: 104,
        right: 14,
        width: Math.min(196, screenWidth * 0.46),
        height: 64,
      };
    case "battle":
      return {
        top: 104,
        right: 14,
        width: Math.min(206, screenWidth * 0.5),
        height: 70,
      };
    case "chat":
      return { right: 10, bottom: 112, width: 86, height: 86 };
    default:
      return { top: 110, left: 16, width: screenWidth - 32, height: 80 };
  }
}

export function ModuleHeaderTitle({
  title,
  description,
  profile,
  totalBlocks = 0,
  completedBlocks = 0,
  hideGuideButton = false,
  guideVariant,
  visibleElements,
  perfis,
}: Props) {
  const [open, setOpen] = useState(false);
  const normalizedProfile = useMemo(
    () => normalizeBrainHexProfile(profile) ?? "mastermind",
    [profile],
  );
  const guide = useMemo(
    () =>
      buildTrilhaGuideContent(
        normalizedProfile,
        {
          topicTitle: title,
          totalBlocks,
          completedBlocks,
          guideVariant,
          visibleElements,
          perfis,
        },
        "modulo",
      ),
    [
      completedBlocks,
      guideVariant,
      normalizedProfile,
      perfis,
      title,
      totalBlocks,
      visibleElements,
    ],
  );
  const palette = useMemo(
    () => getProfileShellPalette(normalizedProfile),
    [normalizedProfile],
  );

  return (
    <>
      <View style={styles.container}>
        <View style={styles.copy}>
          <Text
            style={[styles.title, { color: palette.text }]}
            numberOfLines={1}
          >
            {title}
          </Text>
          {description ? (
            <Text
              style={[styles.description, { color: palette.textSubtle }]}
              numberOfLines={1}
            >
              {description}
            </Text>
          ) : null}
        </View>

        {!hideGuideButton ? (
          <Pressable
            style={[
              styles.helpButton,
              {
                borderColor: guide.borderColor,
                backgroundColor: palette.surface,
              },
            ]}
            onPress={() => setOpen(true)}
          >
            <MaterialCommunityIcons
              name="help-circle-outline"
              size={18}
              color={guide.accentColor}
            />
          </Pressable>
        ) : null}
      </View>

      <Modal
        transparent
        animationType="fade"
        visible={open}
        onRequestClose={() => setOpen(false)}
      >
        <GuideModalContent
          guide={guide}
          palette={palette}
          profile={normalizedProfile}
          scope="modulo"
          onClose={() => setOpen(false)}
        />
      </Modal>
    </>
  );
}

export function ModuleHeaderGuideButton({
  profile,
  title,
  totalBlocks = 0,
  completedBlocks = 0,
  scope = "modulo",
  variant = "icon",
  guideVariant,
  visibleElements,
  perfis,
}: {
  profile: BrainHexProfile | string | null | undefined;
  title: string;
  totalBlocks?: number | null;
  completedBlocks?: number | null;
  scope?: TrilhaGuideScope;
  variant?: "icon" | "chip";
  guideVariant?: "personalizado" | "mock_modulo" | "padrao_trilha" | null;
  visibleElements?: GuideVisibleElements;
  perfis?: { nome?: string | null; afinidade?: number | null }[] | null;
}) {
  const [open, setOpen] = useState(false);
  const normalizedProfile = useMemo(
    () => normalizeBrainHexProfile(profile) ?? "mastermind",
    [profile],
  );
  const guide = useMemo(
    () =>
      buildTrilhaGuideContent(
        normalizedProfile,
        {
          topicTitle: title,
          totalBlocks,
          completedBlocks,
          guideVariant,
          visibleElements,
          perfis,
        },
        scope,
      ),
    [
      completedBlocks,
      guideVariant,
      normalizedProfile,
      perfis,
      scope,
      title,
      totalBlocks,
      visibleElements,
    ],
  );
  const palette = useMemo(
    () => getProfileShellPalette(normalizedProfile),
    [normalizedProfile],
  );

  return (
    <>
      <Pressable
        style={[
          styles.helpButton,
          variant === "icon"
            ? styles.helpButtonStandalone
            : styles.helpButtonChip,
          {
            borderColor: guide.borderColor,
            backgroundColor: palette.surface,
          },
        ]}
        onPress={() => setOpen(true)}
      >
        <MaterialCommunityIcons
          name="help-circle-outline"
          size={18}
          color={guide.accentColor}
        />
        {variant === "chip" ? (
          <View style={styles.helpButtonCopy}>
            <Text
              style={[styles.helpButtonLabel, { color: guide.accentColor }]}
              numberOfLines={1}
            >
              {guide.profileLabel}
            </Text>
            <Text
              style={[styles.helpButtonSubLabel, { color: palette.textMuted }]}
              numberOfLines={1}
            >
              {guide.headline}
            </Text>
          </View>
        ) : null}
      </Pressable>

      <Modal
        transparent
        animationType="fade"
        visible={open}
        onRequestClose={() => setOpen(false)}
      >
        <GuideModalContent
          guide={guide}
          palette={palette}
          profile={normalizedProfile}
          scope={scope}
          onClose={() => setOpen(false)}
        />
      </Modal>
    </>
  );
}

function GuideModalContent({
  guide,
  palette,
  profile,
  scope,
  onClose,
}: {
  guide: ReturnType<typeof buildTrilhaGuideContent>;
  palette: ReturnType<typeof getProfileShellPalette>;
  profile: BrainHexProfile;
  scope: TrilhaGuideScope;
  onClose: () => void;
}) {
  const guideProfile = useMemo(() => getBrainHexConfig(profile), [profile]);
  const guideName = useMemo(() => getBrainHexGuideName(profile), [profile]);
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const [tutorialActive, setTutorialActive] = useState(false);
  const [tutorialIndex, setTutorialIndex] = useState(0);
  const currentStep = guide.tutorialSteps[tutorialIndex] ?? null;
  const prefersTopTourCard = currentStep?.target === "chat";
  const spotlightStyle = useMemo(
    () =>
      currentStep
        ? resolveSpotlightStyle(
            currentStep.target,
            scope,
            screenWidth,
            screenHeight,
          )
        : null,
    [currentStep, scope, screenHeight, screenWidth],
  );

  useEffect(() => {
    setTutorialActive(false);
    setTutorialIndex(0);
  }, [guide.badge, guide.headline, scope]);

  if (tutorialActive && currentStep) {
    return (
      <View
        style={[
          styles.tourBackdrop,
          { backgroundColor: `${palette.background}e8` },
        ]}
      >
        {spotlightStyle ? (
          <View
            pointerEvents="none"
            style={[
              styles.spotlight,
              spotlightStyle,
              {
                borderColor: guide.accentColor,
                backgroundColor: palette.accentMuted,
                shadowColor: guide.accentColor,
              },
            ]}
          />
        ) : null}

        <View
          style={[
            styles.tourCard,
            {
              backgroundColor: palette.surfaceElevated,
              borderColor: palette.borderStrong,
              top: prefersTopTourCard
                ? Math.max(28, screenHeight * 0.08)
                : undefined,
              bottom: prefersTopTourCard
                ? undefined
                : Math.max(28, screenHeight * 0.06),
            },
          ]}
        >
          <View style={styles.tourHeader}>
            <View
              style={[
                styles.tourIconWrap,
                {
                  backgroundColor: palette.accentMuted,
                  borderColor: palette.borderStrong,
                },
              ]}
            >
              <MaterialCommunityIcons
                name={currentStep.icon as never}
                size={18}
                color={guide.accentColor}
              />
            </View>
            <View style={styles.tourCopy}>
              <Text style={[styles.tourEyebrow, { color: guide.accentColor }]}>
                {guideName}
              </Text>
              <Text style={[styles.tourTitle, { color: palette.text }]}>
                {currentStep.title}
              </Text>
              <Text style={[styles.tourBody, { color: palette.textMuted }]}>
                {currentStep.description}
              </Text>
            </View>
          </View>

          <View style={styles.tourFooter}>
            <Text style={[styles.tourCounter, { color: palette.textSubtle }]}>
              Passo {tutorialIndex + 1} de {guide.tutorialSteps.length}
            </Text>
            <View style={styles.tourActions}>
              <Pressable
                style={[
                  styles.tourSecondaryButton,
                  {
                    backgroundColor: palette.surface,
                    borderColor: palette.border,
                  },
                ]}
                onPress={() => {
                  if (tutorialIndex <= 0) {
                    setTutorialActive(false);
                    return;
                  }
                  setTutorialIndex((prev) => Math.max(0, prev - 1));
                }}
              >
                <Text
                  style={[
                    styles.tourSecondaryButtonText,
                    { color: palette.textMuted },
                  ]}
                >
                  {tutorialIndex <= 0 ? "Resumo" : "Voltar"}
                </Text>
              </Pressable>

              <Pressable
                style={[
                  styles.tourPrimaryButton,
                  {
                    backgroundColor: guide.accentColor,
                    borderColor: guide.accentColor,
                  },
                ]}
                onPress={() => {
                  if (tutorialIndex >= guide.tutorialSteps.length - 1) {
                    setTutorialIndex(0);
                    setTutorialActive(false);
                    return;
                  }
                  setTutorialIndex((prev) => prev + 1);
                }}
              >
                <Text
                  style={[
                    styles.tourPrimaryButtonText,
                    { color: palette.background },
                  ]}
                >
                  {tutorialIndex >= guide.tutorialSteps.length - 1
                    ? "Concluir"
                    : "Próximo"}
                </Text>
              </Pressable>
            </View>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View
      style={[styles.backdrop, { backgroundColor: `${palette.background}f2` }]}
    >
      <View
        style={[
          styles.cardShell,
          {
            height: Math.min(screenHeight * 0.86, 720),
            width: Math.min(screenWidth - 24, 520),
          },
        ]}
      >
        <View
          style={[
            styles.card,
            {
              borderColor: palette.borderStrong,
              backgroundColor: palette.surfaceElevated,
            },
          ]}
        >
          <ScrollView
            style={styles.cardScroll}
            contentContainerStyle={styles.cardScrollContent}
            showsVerticalScrollIndicator={false}
          >
            <View
              style={[
                styles.avatarRow,
                {
                  backgroundColor: palette.surface,
                  borderColor: palette.border,
                },
              ]}
            >
              <View
                style={[
                  styles.iconWrap,
                  {
                    backgroundColor: palette.accentSoft,
                    borderColor: palette.borderStrong,
                  },
                ]}
              >
                <Image
                  source={guideProfile.image}
                  style={styles.avatarImage}
                  resizeMode="cover"
                />
              </View>
              <View style={styles.avatarCopy}>
                <Text
                  style={[styles.avatarEyebrow, { color: guide.accentColor }]}
                >
                  {guide.profileLabel}
                </Text>
                <Text style={[styles.avatarHeadline, { color: palette.text }]}>
                  {guideName}
                </Text>
                <Text
                  style={[
                    styles.avatarSubheadline,
                    { color: palette.textMuted },
                  ]}
                >
                  {scope === "trilha"
                    ? "Guia tutorial da trilha"
                    : "Guia tutorial do módulo"}
                </Text>
              </View>
            </View>

            <View
              style={[
                styles.badge,
                {
                  borderColor: guide.borderColor,
                  backgroundColor: palette.accentMuted,
                },
              ]}
            >
              <Text style={[styles.badgeText, { color: guide.accentColor }]}>
                {guide.badge}
              </Text>
            </View>

            {guide.modeLabel ? (
              <View
                style={[
                  styles.modeChip,
                  {
                    backgroundColor: palette.surface,
                    borderColor: palette.border,
                  },
                ]}
              >
                <Text style={[styles.modeChipText, { color: palette.textMuted }]}>
                  {guide.modeLabel}
                </Text>
              </View>
            ) : null}

            <View style={styles.sectionWrap}>
              <View
                style={[
                  styles.personalizationHero,
                  {
                    backgroundColor: palette.surface,
                    borderColor: palette.borderStrong,
                  },
                ]}
              >
                <View style={styles.personalizationHeroHeader}>
                  <MaterialCommunityIcons
                    name={guide.icon as never}
                    size={18}
                    color={guide.accentColor}
                  />
                  <Text
                    style={[
                      styles.personalizationHeroEyebrow,
                      { color: guide.accentColor },
                    ]}
                  >
                    Resumo personalizado do seu perfil
                  </Text>
                </View>
                <Text
                  style={[
                    styles.personalizationHeroContext,
                    { color: palette.textSubtle },
                  ]}
                >
                  {scope === "trilha"
                    ? "Este guia resume como a trilha aparece para o seu perfil hoje."
                    : "Este guia resume como este módulo foi apresentado para o seu perfil."}
                </Text>
                <Text
                  style={[
                    styles.personalizationHeroTitle,
                    { color: palette.text },
                  ]}
                >
                  {guide.headline}
                </Text>
                <Text
                  style={[
                    styles.personalizationHeroBody,
                    { color: palette.textMuted },
                  ]}
                >
                  {guide.summary}
                </Text>
              </View>
            </View>

            <View style={styles.sectionWrap}>
              <Text style={[styles.sectionTitle, { color: palette.text }]}>
                O que está personalizado para você aqui
              </Text>
              <View style={styles.listContent}>
                {guide.personalizedDetails.map((detail) => (
                  <View key={detail} style={styles.bulletRow}>
                    <MaterialCommunityIcons
                      name="compass-rose"
                      size={15}
                      color={guide.accentColor}
                    />
                    <Text
                      style={[styles.bulletText, { color: palette.textMuted }]}
                    >
                      {detail}
                    </Text>
                  </View>
                ))}
              </View>
            </View>

            <View style={styles.sectionWrap}>
              <Text style={[styles.sectionTitle, { color: palette.text }]}>
                Leitura personalizada do seu perfil
              </Text>
              <View style={styles.listContent}>
                {guide.bullets.map((bullet) => (
                  <View key={bullet} style={styles.bulletRow}>
                    <MaterialCommunityIcons
                      name="star-four-points"
                      size={15}
                      color={guide.accentColor}
                    />
                    <Text
                      style={[styles.bulletText, { color: palette.textMuted }]}
                    >
                      {bullet}
                    </Text>
                  </View>
                ))}
              </View>
            </View>

            <View style={styles.sectionWrap}>
              <Text style={[styles.sectionTitle, { color: palette.text }]}>
                {guide.tutorialTitle}
              </Text>
              <View style={styles.tutorialList}>
                {guide.tutorialSteps.map((step) => (
                  <View
                    key={step.id}
                    style={[
                      styles.tutorialCard,
                      {
                        backgroundColor: palette.surface,
                        borderColor: palette.border,
                      },
                    ]}
                  >
                    <View
                      style={[
                        styles.tutorialIcon,
                        {
                          backgroundColor: palette.accentMuted,
                          borderColor: palette.borderStrong,
                        },
                      ]}
                    >
                      <MaterialCommunityIcons
                        name={step.icon as never}
                        size={16}
                        color={guide.accentColor}
                      />
                    </View>
                    <View style={styles.tutorialCopy}>
                      <Text
                        style={[
                          styles.tutorialCardTitle,
                          { color: palette.text },
                        ]}
                      >
                        {step.title}
                      </Text>
                      <Text
                        style={[
                          styles.tutorialCardText,
                          { color: palette.textMuted },
                        ]}
                      >
                        {step.description}
                      </Text>
                    </View>
                  </View>
                ))}
              </View>
            </View>
          </ScrollView>

          <View style={styles.bottomActions}>
            <Pressable
              style={[
                styles.closeButtonSoft,
                {
                  backgroundColor: palette.surface,
                  borderColor: palette.border,
                },
              ]}
              onPress={onClose}
            >
              <Text
                style={[
                  styles.closeButtonSoftText,
                  { color: palette.textMuted },
                ]}
              >
                Fechar
              </Text>
            </Pressable>

            <Pressable
              style={[
                styles.closeButton,
                {
                  backgroundColor: guide.accentColor,
                  borderColor: guide.accentColor,
                },
              ]}
              onPress={() => {
                setTutorialIndex(0);
                setTutorialActive(true);
              }}
            >
              <Text
                style={[styles.closeButtonText, { color: palette.background }]}
              >
                Iniciar tutorial
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    maxWidth: 276,
  },
  copy: {
    flexShrink: 1,
    alignItems: "center",
    gap: 1,
  },
  title: {
    color: Color.colorWhite,
    fontFamily: FontFamily.poppinsExtraBold,
    fontSize: 18,
  },
  description: {
    color: "#BBB",
    fontFamily: FontFamily.interMedium,
    fontSize: 11,
    marginTop: 1,
  },
  helpButton: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
  },
  helpButtonStandalone: {
    marginRight: 4,
  },
  helpButtonChip: {
    width: undefined,
    height: undefined,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    maxWidth: 220,
  },
  helpButtonCopy: {
    flexShrink: 1,
    gap: 1,
  },
  helpButtonLabel: {
    fontFamily: FontFamily.inikaBold,
    fontSize: 11,
  },
  helpButtonSubLabel: {
    fontFamily: FontFamily.interMedium,
    fontSize: 10,
  },
  backdrop: {
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 20,
    justifyContent: "center",
    alignItems: "center",
  },
  cardShell: {
    alignSelf: "center",
    minHeight: 320,
  },
  card: {
    flex: 1,
    borderRadius: 24,
    borderWidth: 1,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 16,
    gap: 14,
    shadowColor: "#000",
    shadowOpacity: 0.32,
    shadowRadius: 22,
    shadowOffset: { width: 0, height: 8 },
    elevation: 20,
  },
  cardScroll: {
    flexGrow: 0,
  },
  cardScrollContent: {
    gap: 14,
    paddingBottom: 6,
  },
  iconWrap: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    overflow: "hidden",
  },
  avatarRow: {
    alignSelf: "stretch",
    borderRadius: 20,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  avatarImage: {
    width: "100%",
    height: "100%",
  },
  avatarCopy: {
    flex: 1,
    gap: 3,
  },
  avatarEyebrow: {
    fontFamily: FontFamily.interMedium,
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  avatarHeadline: {
    fontFamily: FontFamily.inikaBold,
    fontSize: 18,
  },
  avatarSubheadline: {
    fontFamily: FontFamily.interMedium,
    fontSize: 12,
  },
  badge: {
    alignSelf: "flex-start",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
  },
  badgeText: {
    fontFamily: FontFamily.interMedium,
    fontSize: 11,
  },
  modeChip: {
    alignSelf: "flex-start",
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderWidth: 1,
  },
  modeChipText: {
    fontFamily: FontFamily.interMedium,
    fontSize: 11,
  },
  sectionWrap: {
    alignSelf: "stretch",
    gap: 10,
  },
  personalizationHero: {
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 14,
    gap: 8,
  },
  personalizationHeroHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  personalizationHeroEyebrow: {
    fontFamily: FontFamily.interMedium,
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  personalizationHeroContext: {
    fontFamily: FontFamily.interMedium,
    fontSize: 12,
    lineHeight: 18,
  },
  personalizationHeroTitle: {
    fontFamily: FontFamily.inikaBold,
    fontSize: 17,
    lineHeight: 23,
  },
  personalizationHeroBody: {
    fontFamily: FontFamily.interMedium,
    fontSize: 13,
    lineHeight: 20,
  },
  sectionTitle: {
    fontFamily: FontFamily.inikaBold,
    fontSize: 16,
  },
  tutorialList: {
    gap: 10,
  },
  tutorialCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    borderRadius: 16,
    borderWidth: 1,
    padding: 12,
  },
  tutorialIcon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  tutorialCopy: {
    flex: 1,
    gap: 4,
  },
  tutorialCardTitle: {
    fontFamily: FontFamily.inikaBold,
    fontSize: 14,
  },
  tutorialCardText: {
    fontFamily: FontFamily.interMedium,
    fontSize: 13,
    lineHeight: 18,
  },
  listContent: {
    gap: 12,
  },
  bulletRow: {
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-start",
  },
  bulletText: {
    flex: 1,
    fontFamily: FontFamily.interMedium,
    fontSize: 14,
    lineHeight: 21,
  },
  bottomActions: {
    flexDirection: "row",
    gap: 10,
    marginTop: 8,
  },
  closeButton: {
    flex: 1,
    minHeight: 50,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  closeButtonText: {
    fontFamily: FontFamily.inikaBold,
    fontSize: 15,
  },
  closeButtonSoft: {
    minWidth: 110,
    minHeight: 50,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  closeButtonSoftText: {
    fontFamily: FontFamily.interMedium,
    fontSize: 14,
  },
  tourBackdrop: {
    flex: 1,
  },
  spotlight: {
    position: "absolute",
    borderRadius: 22,
    borderWidth: 2,
    shadowOpacity: 0.44,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 0 },
  },
  tourCard: {
    position: "absolute",
    left: 16,
    right: 16,
    borderRadius: 24,
    borderWidth: 1,
    padding: 16,
    gap: 14,
    shadowColor: "#000",
    shadowOpacity: 0.34,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 8 },
    elevation: 18,
  },
  tourHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  tourIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  tourCopy: {
    flex: 1,
    gap: 4,
  },
  tourEyebrow: {
    fontFamily: FontFamily.interMedium,
    fontSize: 11,
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  tourTitle: {
    fontFamily: FontFamily.inikaBold,
    fontSize: 18,
  },
  tourBody: {
    fontFamily: FontFamily.interMedium,
    fontSize: 14,
    lineHeight: 21,
  },
  tourFooter: {
    gap: 10,
  },
  tourCounter: {
    fontFamily: FontFamily.interMedium,
    fontSize: 12,
  },
  tourActions: {
    flexDirection: "row",
    gap: 10,
  },
  tourPrimaryButton: {
    flex: 1,
    minHeight: 48,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  tourPrimaryButtonText: {
    fontFamily: FontFamily.inikaBold,
    fontSize: 15,
  },
  tourSecondaryButton: {
    minWidth: 110,
    minHeight: 48,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 14,
  },
  tourSecondaryButtonText: {
    fontFamily: FontFamily.interMedium,
    fontSize: 14,
  },
});
