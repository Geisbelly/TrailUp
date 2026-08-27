import {
  ContentBlockPayload,
  RichPresentationSlide,
} from "@/interfaces/componentes_simples/IContentBlock";
import { getBrainHexConfig, getBrainHexGuideName } from "@/constants/profileImages";
import { useUsuario } from "@/context/SessaoContext";
import { Color, FontFamily } from "@/styles/GlobalStyle";
import { getProfileShellPalette } from "@/utils/profileShellTheme";
import { buildContentResumeKey, loadContentResume, saveContentResume } from "@/utils/contentResume";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect, useMemo, useState } from "react";
import {
  Image,
  Modal,
  Pressable,
  SafeAreaView,
  StyleSheet,
  Text,
  View,
} from "react-native";

type Props = {
  payload: ContentBlockPayload;
  progressKey?: string;
};

export function normalizePayload(payload: ContentBlockPayload): {
  title?: string | null;
  abertura?: string | null;
  slides: RichPresentationSlide[];
} {
  if (!payload || typeof payload !== "object") {
    return { title: null, abertura: null, slides: [] };
  }
  const rawSlides: RichPresentationSlide[] = Array.isArray(payload.slides) ? payload.slides : [];
  // Descarta slides sem nenhum conteudo substantivo (titulo generico
  // "Slide N" sozinho nao conta - ver comentario em personalization.ts
  // sobre por que isso pode acontecer). Protege a UI de mostrar cards
  // vazios mesmo se algum caminho upstream produzir um RichPresentationSlide
  // degenerado.
  const slides = rawSlides.filter(
    (slide) =>
      (slide.points?.length ?? 0) > 0 ||
      Boolean(slide.explanation) ||
      Boolean(slide.characterQuote) ||
      Boolean(slide.imagemReferencia)
  );
  return {
    title: payload.title ?? null,
    abertura: payload.abertura ?? null,
    slides,
  };
}

export default function PresentationSlidesBlock({ payload: rawPayload, progressKey }: Props) {
  const { usuario } = useUsuario();
  const perfilNome = usuario?.perfilAtivo ?? usuario?.perfis?.[0]?.nome ?? null;
  const palette = useMemo(() => getProfileShellPalette(perfilNome), [perfilNome]);
  const brainHexConfig = useMemo(() => getBrainHexConfig(perfilNome ?? undefined), [perfilNome]);
  const guideName = useMemo(() => getBrainHexGuideName(perfilNome), [perfilNome]);

  const payload = useMemo(() => normalizePayload(rawPayload), [rawPayload]);
  const slides = payload.slides;
  const [visible, setVisible] = useState(false);
  const [index, setIndex] = useState(0);
  const [resumeLoaded, setResumeLoaded] = useState(false);
  const storageKey = useMemo(
    () => buildContentResumeKey(usuario?.id, "slides", progressKey ?? payload.title ?? "slides"),
    [payload.title, progressKey, usuario?.id]
  );

  useEffect(() => {
    let active = true;
    setResumeLoaded(false);
    void loadContentResume(storageKey).then((saved) => {
      if (!active) return;
      setIndex(Math.max(0, Math.min(slides.length - 1, Math.round(saved?.slide ?? 0))));
      setResumeLoaded(true);
    });
    return () => { active = false; };
  }, [slides.length, storageKey]);

  useEffect(() => {
    if (!resumeLoaded) return;
    void saveContentResume(storageKey, { slide: index });
  }, [index, resumeLoaded, storageKey]);

  if (slides.length === 0) return null;

  const current = slides[index] ?? slides[0];
  const isFirst = index === 0;
  const isLast = index === slides.length - 1;

  const openViewer = () => {
    setVisible(true);
  };

  const goNext = () => {
    if (!isLast) setIndex((value) => value + 1);
  };

  const goPrev = () => {
    if (!isFirst) setIndex((value) => value - 1);
  };

  return (
    <View style={styles.wrapper}>
      <Pressable
        onPress={openViewer}
        style={[
          styles.previewCard,
          { backgroundColor: palette.surfaceElevated, borderColor: palette.borderStrong },
        ]}
      >
        <View style={styles.previewHeader}>
          <Text style={[styles.previewLabel, { color: palette.accent }]}>Apresentação</Text>
          <Text style={[styles.previewCount, { color: palette.textMuted }]}>
            {slides.length} {slides.length === 1 ? "slide" : "slides"}
          </Text>
        </View>
        <Text style={[styles.previewTitle, { color: palette.text }]} numberOfLines={2}>
          {payload.title ?? "Apresentação personalizada"}
        </Text>
        {payload.abertura ? (
          <Text style={[styles.previewSubtitle, { color: palette.textMuted }]} numberOfLines={3}>
            {payload.abertura}
          </Text>
        ) : null}
        <View style={[styles.previewButton, { backgroundColor: palette.accent }]}>
          <Ionicons name="play" size={16} color={Color.colorWhite} />
          <Text style={styles.previewButtonText}>
            {index > 0 ? `Continuar do slide ${index + 1}` : "Ver apresentação"}
          </Text>
        </View>
      </Pressable>

      <Modal visible={visible} animationType="fade" onRequestClose={() => setVisible(false)}>
        <View style={styles.modalRoot}>
          {current.imagemReferencia ? (
            <Image
              source={{ uri: current.imagemReferencia }}
              style={StyleSheet.absoluteFill}
              resizeMode="cover"
            />
          ) : (
            <LinearGradient
              colors={[palette.background, palette.surfaceElevated]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
          )}

          <LinearGradient
            colors={["transparent", "rgba(3,7,13,0.55)", "rgba(3,7,13,0.92)"]}
            start={{ x: 0.5, y: 0 }}
            end={{ x: 0.5, y: 1 }}
            style={StyleSheet.absoluteFill}
          />

          <SafeAreaView style={styles.modalSafeArea}>
            <View style={styles.modalTopBar}>
              <View
                style={[
                  styles.guideBadge,
                  { borderColor: palette.accent, backgroundColor: palette.surface },
                ]}
              >
                <Image source={brainHexConfig.image} style={styles.guideImage} />
                <Text style={[styles.guideName, { color: palette.text }]}>{guideName}</Text>
              </View>
              <Pressable onPress={() => setVisible(false)} style={styles.closeButton}>
                <Ionicons name="close" size={22} color={Color.colorWhite} />
              </Pressable>
            </View>

            <View style={styles.modalBody}>
              <Text style={styles.slideTitle}>{current.title}</Text>

              {current.points.length > 0 ? (
                <View style={styles.pointsList}>
                  {current.points.map((point, pointIndex) => (
                    <View key={pointIndex} style={styles.pointRow}>
                      <View style={[styles.pointDot, { backgroundColor: palette.accent }]} />
                      <Text style={styles.pointText}>{point}</Text>
                    </View>
                  ))}
                </View>
              ) : null}

              {current.explanation ? (
                <Text style={styles.explanationText}>{current.explanation}</Text>
              ) : null}

              {current.characterQuote ? (
                <View
                  style={[
                    styles.quoteBubble,
                    { backgroundColor: palette.accentMuted, borderColor: palette.border },
                  ]}
                >
                  <Text style={[styles.quoteText, { color: palette.text }]}>
                    &quot;{current.characterQuote}&quot;
                  </Text>
                  <Text style={[styles.quoteAuthor, { color: palette.accent }]}>
                    — {guideName}
                  </Text>
                </View>
              ) : null}
            </View>

            <View style={styles.modalFooter}>
              <Pressable
                onPress={goPrev}
                disabled={isFirst}
                style={[styles.navButton, isFirst && styles.navButtonDisabled]}
              >
                <Ionicons name="chevron-back" size={22} color={Color.colorWhite} />
              </Pressable>

              <Text style={styles.progressText}>
                {index + 1} de {slides.length}
              </Text>

              <Pressable
                onPress={goNext}
                disabled={isLast}
                style={[styles.navButton, isLast && styles.navButtonDisabled]}
              >
                <Ionicons name="chevron-forward" size={22} color={Color.colorWhite} />
              </Pressable>
            </View>
          </SafeAreaView>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginTop: 10,
  },
  previewCard: {
    borderRadius: 18,
    borderWidth: 1,
    padding: 16,
    gap: 10,
  },
  previewHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  previewLabel: {
    fontFamily: FontFamily.interMedium,
    fontSize: 12,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  previewCount: {
    fontFamily: FontFamily.interMedium,
    fontSize: 12,
  },
  previewTitle: {
    fontFamily: FontFamily.inikaBold,
    fontSize: 18,
  },
  previewSubtitle: {
    fontFamily: FontFamily.interMedium,
    fontSize: 13,
    lineHeight: 19,
  },
  previewButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    minHeight: 44,
    borderRadius: 14,
    marginTop: 4,
  },
  previewButtonText: {
    color: Color.colorWhite,
    fontFamily: FontFamily.inikaBold,
    fontSize: 14,
  },
  modalRoot: {
    flex: 1,
    backgroundColor: "#03070d",
  },
  modalSafeArea: {
    flex: 1,
    justifyContent: "space-between",
  },
  modalTopBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  guideBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  guideImage: {
    width: 28,
    height: 28,
    borderRadius: 14,
  },
  guideName: {
    fontFamily: FontFamily.interMedium,
    fontSize: 13,
  },
  closeButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.12)",
  },
  modalBody: {
    flex: 1,
    justifyContent: "flex-end",
    paddingHorizontal: 20,
    paddingBottom: 16,
    gap: 14,
  },
  slideTitle: {
    color: Color.colorWhite,
    fontFamily: FontFamily.inikaBold,
    fontSize: 26,
    lineHeight: 32,
  },
  pointsList: {
    gap: 8,
  },
  pointRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  pointDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 8,
  },
  pointText: {
    flex: 1,
    color: Color.colorWhite,
    fontFamily: FontFamily.interMedium,
    fontSize: 15,
    lineHeight: 22,
  },
  explanationText: {
    color: "rgba(255,255,255,0.82)",
    fontFamily: FontFamily.interMedium,
    fontSize: 14,
    lineHeight: 21,
  },
  quoteBubble: {
    borderWidth: 1,
    borderRadius: 14,
    padding: 12,
    gap: 4,
  },
  quoteText: {
    fontFamily: FontFamily.interMedium,
    fontSize: 14,
    fontStyle: "italic",
    lineHeight: 20,
  },
  quoteAuthor: {
    fontFamily: FontFamily.interMedium,
    fontSize: 12,
  },
  modalFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingBottom: 20,
    paddingTop: 8,
  },
  navButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.14)",
  },
  navButtonDisabled: {
    opacity: 0.35,
  },
  progressText: {
    color: "rgba(255,255,255,0.72)",
    fontFamily: FontFamily.interMedium,
    fontSize: 13,
  },
});
