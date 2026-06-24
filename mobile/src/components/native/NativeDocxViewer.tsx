import { ContentDisplayMode } from "@/interfaces/componentes_simples/IContentBlock";
import { Color, FontFamily } from "@/styles/GlobalStyle";
import { NativeDocBlock } from "@/utils/nativeDocumentParsers";
import { getProfileShellPalette, ProfileShellPalette } from "@/utils/profileShellTheme";
import React, { useEffect, useMemo } from "react";
import {
  Image,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";

type Props = {
  blocks: NativeDocBlock[];
  displayMode: ContentDisplayMode;
  currentPage: number;
  height: number;
  onPageChange: (page: number) => void;
  onPageCountChange: (count: number) => void;
  palette?: ProfileShellPalette;
};

const fallbackPalette = getProfileShellPalette("mastermind");

function estimateBlockUnits(block: NativeDocBlock) {
  switch (block.type) {
    case "heading":
      return 90 + block.text.length * 0.32;
    case "paragraph":
    case "quote":
      return 54 + block.text.length * 0.4;
    case "list":
      return 52 + block.items.reduce((sum, item) => sum + 26 + item.length * 0.25, 0);
    case "image":
      return 240;
    case "table":
      return 56 + block.rows.length * 64;
    default:
      return 80;
  }
}

function paginateBlocks(blocks: NativeDocBlock[], height: number) {
  const pageBudget = Math.max(760, Math.round(height * 1.25));
  const pages: NativeDocBlock[][] = [];
  let currentPage: NativeDocBlock[] = [];
  let currentBudget = 0;

  for (const block of blocks) {
    const blockUnits = estimateBlockUnits(block);
    if (currentPage.length > 0 && currentBudget + blockUnits > pageBudget) {
      pages.push(currentPage);
      currentPage = [];
      currentBudget = 0;
    }

    currentPage.push(block);
    currentBudget += blockUnits;
  }

  if (currentPage.length > 0) {
    pages.push(currentPage);
  }

  return pages.length ? pages : [[]];
}

function renderBlock(
  block: NativeDocBlock,
  index: number,
  palette: ProfileShellPalette
) {
  switch (block.type) {
    case "heading": {
      const headingStyle =
        block.level <= 1
          ? styles.h1
          : block.level === 2
          ? styles.h2
          : styles.h3;

      return (
        <Text key={`heading-${index}`} style={[styles.heading, headingStyle]}>
          {block.text}
        </Text>
      );
    }
    case "paragraph":
      return (
        <Text key={`paragraph-${index}`} style={styles.paragraph}>
          {block.text}
        </Text>
      );
    case "quote":
      return (
        <View
          key={`quote-${index}`}
          style={[
            styles.quoteBox,
            {
              borderLeftColor: palette.accent,
              backgroundColor: palette.accentMuted,
            },
          ]}
        >
          <Text style={styles.quoteText}>{block.text}</Text>
        </View>
      );
    case "list":
      return (
        <View key={`list-${index}`} style={styles.listBox}>
          {block.items.map((item, itemIndex) => (
            <View key={`item-${itemIndex}`} style={styles.listItem}>
              <Text style={styles.listBullet}>
                {block.ordered ? `${itemIndex + 1}.` : "*"}
              </Text>
              <Text style={styles.listText}>{item}</Text>
            </View>
          ))}
        </View>
      );
    case "image":
      return (
        <View
          key={`image-${index}`}
          style={[
            styles.imageBox,
            {
              backgroundColor: palette.surface,
              borderColor: palette.border,
            },
          ]}
        >
          <Image source={{ uri: block.src }} style={styles.image} resizeMode="contain" />
        </View>
      );
    case "table":
      return (
        <ScrollView
          key={`table-${index}`}
          horizontal
          nestedScrollEnabled
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.tableScrollerContent}
        >
          <View style={[styles.table, { borderColor: palette.border }]}>
            {block.rows.map((row: string[], rowIndex: number) => (
              <View
                key={`row-${rowIndex}`}
                style={[
                  styles.tableRow,
                  rowIndex === 0 && styles.tableRowHeader,
                  rowIndex === 0 && { backgroundColor: palette.accentMuted },
                ]}
              >
                {row.map((cell: string, cellIndex: number) => (
                  <View
                    key={`cell-${cellIndex}`}
                    style={[styles.tableCell, { borderColor: palette.border }]}
                  >
                    <Text style={styles.tableText}>{cell}</Text>
                  </View>
                ))}
              </View>
            ))}
          </View>
        </ScrollView>
      );
    default:
      return null;
  }
}

export function NativeDocxViewer({
  blocks,
  displayMode,
  currentPage,
  height,
  onPageChange,
  onPageCountChange,
  palette = fallbackPalette,
}: Props) {
  const pages = useMemo(() => paginateBlocks(blocks, height), [blocks, height]);

  useEffect(() => {
    onPageCountChange(Math.max(1, pages.length));
  }, [onPageCountChange, pages.length]);

  useEffect(() => {
    if (currentPage > pages.length) {
      onPageChange(Math.max(1, pages.length));
    }
  }, [currentPage, onPageChange, pages.length]);

  if (displayMode === "rolagem") {
    return (
      <ScrollView
        style={[styles.scrollView, { height, backgroundColor: palette.background }]}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled
        bounces={false}
      >
        <View style={[styles.pageSheet, { borderColor: palette.border }]}>
          {blocks.map((block, index) => renderBlock(block, index, palette))}
        </View>
      </ScrollView>
    );
  }

  const pageBlocks = pages[Math.max(0, currentPage - 1)] ?? [];

  return (
    <ScrollView
      style={[styles.pageViewport, { height, backgroundColor: palette.background }]}
      contentContainerStyle={styles.pageViewportContent}
      showsVerticalScrollIndicator={false}
      nestedScrollEnabled
      bounces={false}
    >
      <View style={[styles.pageSheet, { borderColor: palette.border }]}>
        {pageBlocks.map((block, index) => renderBlock(block, index, palette))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollView: {
    backgroundColor: "#0f1733",
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 12,
    paddingVertical: 12,
    paddingBottom: 20,
  },
  pageViewport: {
    backgroundColor: "#0f1733",
  },
  pageViewportContent: {
    flexGrow: 1,
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 14,
  },
  pageSheet: {
    width: "100%",
    backgroundColor: "#ffffff",
    borderRadius: 18,
    borderWidth: 1,
    paddingHorizontal: 22,
    paddingVertical: 24,
    gap: 14,
  },
  heading: {
    color: "#111936",
    fontFamily: FontFamily.inikaBold,
  },
  h1: {
    fontSize: 24,
    lineHeight: 30,
  },
  h2: {
    fontSize: 20,
    lineHeight: 26,
  },
  h3: {
    fontSize: 17,
    lineHeight: 23,
  },
  paragraph: {
    color: "#1e2746",
    fontFamily: FontFamily.interMedium,
    fontSize: 14,
    lineHeight: 22,
  },
  quoteBox: {
    borderLeftWidth: 4,
    borderLeftColor: Color.colorBlueviolet100,
    paddingLeft: 14,
    paddingVertical: 4,
    backgroundColor: "#f7f4ff",
    borderRadius: 10,
  },
  quoteText: {
    color: "#1e2746",
    fontFamily: FontFamily.interMedium,
    fontSize: 14,
    lineHeight: 22,
    fontStyle: "italic",
  },
  listBox: {
    gap: 10,
  },
  listItem: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  listBullet: {
    width: 20,
    color: "#111936",
    fontFamily: FontFamily.inikaBold,
    fontSize: 14,
    lineHeight: 22,
  },
  listText: {
    flex: 1,
    color: "#1e2746",
    fontFamily: FontFamily.interMedium,
    fontSize: 14,
    lineHeight: 22,
  },
  imageBox: {
    minHeight: 220,
    borderRadius: 14,
    overflow: "hidden",
    borderWidth: 1,
  },
  image: {
    width: "100%",
    height: 220,
  },
  tableScrollerContent: {
    minWidth: "100%",
  },
  table: {
    minWidth: 640,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#d6ddf5",
    overflow: "hidden",
  },
  tableRow: {
    flexDirection: "row",
    backgroundColor: "#ffffff",
  },
  tableRowHeader: {
    backgroundColor: "#eef2ff",
  },
  tableCell: {
    flex: 1,
    minWidth: 160,
    borderRightWidth: 1,
    borderBottomWidth: 1,
    borderColor: "#d6ddf5",
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  tableText: {
    color: "#1e2746",
    fontFamily: FontFamily.interMedium,
    fontSize: 13,
    lineHeight: 19,
  },
});
