import { ContentDisplayMode } from "@/interfaces/componentes_simples/IContentBlock";
import { FontFamily } from "@/styles/GlobalStyle";
import { NativePptxSlide } from "@/utils/nativeDocumentParsers";
import { getProfileShellPalette, ProfileShellPalette } from "@/utils/profileShellTheme";
import React, { useEffect, useMemo, useRef } from "react";
import {
  Image,
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from "react-native";

type Props = {
  slides: NativePptxSlide[];
  displayMode: ContentDisplayMode;
  currentPage: number;
  height: number;
  onPageChange: (page: number) => void;
  onPageCountChange: (count: number) => void;
  palette?: ProfileShellPalette;
};

const EMU_PER_POINT = 12700;
const HORIZONTAL_PADDING = 4; // minimal margin — maximize slide real estate
const fallbackPalette = getProfileShellPalette("mastermind");

function getReadableTextColor(backgroundColor?: string | null) {
  const hex = String(backgroundColor ?? "")
    .replace(/^#/, "")
    .slice(0, 6);

  if (!/^[0-9a-f]{6}$/i.test(hex)) {
    return "#111936";
  }

  const red = Number.parseInt(hex.slice(0, 2), 16);
  const green = Number.parseInt(hex.slice(2, 4), 16);
  const blue = Number.parseInt(hex.slice(4, 6), 16);
  const luminance = (red * 299 + green * 587 + blue * 114) / 1000;

  return luminance < 150 ? "#f8faff" : "#111936";
}

function renderSlide(
  slide: NativePptxSlide,
  index: number,
  slideWidthPx: number,
  fontScale: number,
  borderColor: string
) {
  const aspectRatio = slide.width / slide.height;
  const fallbackTextColor = getReadableTextColor(slide.backgroundColor);

  return (
    <View key={`${slide.id}-${index}`} style={[styles.slideFrame, { width: slideWidthPx, borderColor }]}>
      <View
        style={[
          styles.slideCanvas,
          {
            aspectRatio,
            backgroundColor: slide.backgroundColor ?? "#ffffff",
          },
        ]}
      >
        {slide.elements.map((element) => {
          if (element.type === "shape") {
            return (
              <View
                key={element.id}
                pointerEvents="none"
                style={[
                  styles.absoluteShape,
                  {
                    left: `${element.leftPct}%`,
                    top: `${element.topPct}%`,
                    width: `${element.widthPct}%`,
                    height: `${element.heightPct}%`,
                    backgroundColor: element.fillColor ?? "transparent",
                    borderColor: element.strokeColor ?? "transparent",
                    borderWidth: element.strokeColor ? element.strokeWidth ?? 1 : 0,
                    borderRadius: element.radius ?? 0,
                    opacity: element.opacity ?? 1,
                  },
                ]}
              />
            );
          }

          if (element.type === "image") {
            return (
              <Image
                key={element.id}
                source={{ uri: element.src }}
                resizeMode="contain"
                style={[
                  styles.absoluteImage,
                  {
                    left: `${element.leftPct}%`,
                    top: `${element.topPct}%`,
                    width: `${element.widthPct}%`,
                    height: `${element.heightPct}%`,
                  },
                ]}
              />
            );
          }

          const fontSize = Math.max(8, Math.min(52, element.fontSize * fontScale));

          return (
            <View
              key={element.id}
              style={[
                styles.absoluteTextBox,
                {
                  left: `${element.leftPct}%`,
                  top: `${element.topPct}%`,
                  width: `${element.widthPct}%`,
                  height: `${element.heightPct}%`,
                },
              ]}
            >
              <Text
                style={[
                  styles.slideText,
                  {
                    fontSize,
                    lineHeight: Math.max(10, Math.round(fontSize * 1.18)),
                    textAlign: element.align,
                    color: element.color ?? fallbackTextColor,
                    fontFamily: element.bold
                      ? FontFamily.inikaBold
                      : FontFamily.interMedium,
                  },
                ]}
              >
                {element.text}
              </Text>
            </View>
          );
        })}
      </View>
    </View>
  );
}

export function NativePptxViewer({
  slides,
  displayMode,
  currentPage,
  height,
  onPageChange,
  onPageCountChange,
  palette = fallbackPalette,
}: Props) {
  const { width: windowWidth } = useWindowDimensions();
  const pagerRef = useRef<ScrollView | null>(null);
  const pageViewportWidth = Math.max(240, windowWidth - HORIZONTAL_PADDING);

  useEffect(() => {
    onPageCountChange(Math.max(1, slides.length));
  }, [onPageCountChange, slides.length]);

  useEffect(() => {
    if (currentPage > slides.length) {
      onPageChange(Math.max(1, slides.length));
    }
  }, [currentPage, onPageChange, slides.length]);

  useEffect(() => {
    if (displayMode !== "pagina") return;
    pagerRef.current?.scrollTo({
      x: Math.max(0, currentPage - 1) * pageViewportWidth,
      animated: false,
    });
  }, [currentPage, displayMode, pageViewportWidth]);

  const maxSlideWidth = Math.max(240, windowWidth - HORIZONTAL_PADDING);

  const horizontalSlideWidth = useMemo(() => {
    const currentSlide = slides[Math.max(0, currentPage - 1)] ?? slides[0];
    if (!currentSlide) return maxSlideWidth;
    const aspectRatio = currentSlide.width / currentSlide.height;
    // Use (height - 56) because DocumentBlock reserves 56px for nav controls.
    // Cap at pageViewportWidth to never exceed the visible area.
    return Math.min(pageViewportWidth, Math.max(240, (height - 56) * aspectRatio));
  }, [currentPage, height, maxSlideWidth, pageViewportWidth, slides]);

  const handlePagerEnd = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const nextPage = Math.round(event.nativeEvent.contentOffset.x / pageViewportWidth) + 1;
    onPageChange(Math.min(Math.max(1, nextPage), Math.max(1, slides.length)));
  };

  if (displayMode === "rolagem") {
    return (
      <ScrollView
        style={[styles.scrollView, { height, backgroundColor: palette.background }]}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled
      >
        {slides.map((slide, index) => {
          const originalWidthInPoints = Math.max(1, slide.width / EMU_PER_POINT);
          const fontScale = maxSlideWidth / originalWidthInPoints;
          return renderSlide(slide, index, maxSlideWidth, fontScale, palette.border);
        })}
      </ScrollView>
    );
  }

  if (!slides.length) {
    return (
      <View
        style={[
          styles.emptyState,
          { minHeight: height, backgroundColor: palette.background },
        ]}
      >
        <Text style={[styles.emptyText, { color: palette.textMuted }]}>
          Não foi possível montar os slides desta apresentação.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      ref={pagerRef}
      horizontal
      pagingEnabled
      decelerationRate="fast"
      snapToInterval={pageViewportWidth}
      snapToAlignment="start"
      showsHorizontalScrollIndicator={false}
      onMomentumScrollEnd={handlePagerEnd}
      style={[styles.pageView, { height, backgroundColor: palette.background }]}
      contentContainerStyle={styles.pageScrollContent}
    >
      {slides.map((slide, index) => {
        const originalWidthInPoints = Math.max(1, slide.width / EMU_PER_POINT);
        const fontScale = horizontalSlideWidth / originalWidthInPoints;
        return (
          <View
            key={`${slide.id}-page-${index}`}
            style={[styles.pageShell, { width: pageViewportWidth }]}
          >
            {renderSlide(slide, index, horizontalSlideWidth, fontScale, palette.border)}
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollView: {},
  scrollContent: {
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 4,
    paddingVertical: 8,
  },
  pageView: {
    paddingVertical: 4,
  },
  pageScrollContent: {
    alignItems: "stretch",
  },
  pageShell: {
    alignItems: "center",
    justifyContent: "flex-start",
    paddingHorizontal: 2,
    paddingTop: 4,
  },
  slideFrame: {
    borderRadius: 18,
    overflow: "hidden",
    borderWidth: 1,
    backgroundColor: "#ffffff",
  },
  slideCanvas: {
    width: "100%",
    backgroundColor: "#ffffff",
  },
  absoluteShape: {
    position: "absolute",
  },
  absoluteImage: {
    position: "absolute",
  },
  absoluteTextBox: {
    position: "absolute",
    justifyContent: "flex-start",
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  slideText: {
    color: "#111936",
    includeFontPadding: false,
  },
  emptyState: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 18,
  },
  emptyText: {
    textAlign: "center",
    lineHeight: 20,
    fontFamily: FontFamily.interMedium,
  },
});
