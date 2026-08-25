import { ContentDisplayMode } from "@/interfaces/componentes_simples/IContentBlock";
import { getProfileShellPalette, ProfileShellPalette } from "@/utils/profileShellTheme";
import Constants from "expo-constants";
import React, { useEffect, useRef } from "react";
import { ActivityIndicator, Platform, StyleSheet, Text, View } from "react-native";

type Props = {
  uri: string;
  height: number;
  displayMode: ContentDisplayMode;
  currentPage: number;
  onPageChange: (page: number) => void;
  onPageCountChange: (count: number) => void;
  palette?: ProfileShellPalette;
};

type NativePdfComponent = React.ComponentType<any>;

let cachedPdfComponent: NativePdfComponent | null | undefined;
const fallbackPalette = getProfileShellPalette("mastermind");

function loadNativePdfComponent() {
  if (Platform.OS === "web") {
    cachedPdfComponent = null;
    return null;
  }

  if (Constants.executionEnvironment === "storeClient") {
    cachedPdfComponent = null;
    return null;
  }

  if (cachedPdfComponent !== undefined) {
    return cachedPdfComponent;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require("react-native-pdf");
    cachedPdfComponent = (mod.default ?? mod) as NativePdfComponent;
  } catch {
    cachedPdfComponent = null;
  }

  return cachedPdfComponent;
}

export function isNativePdfViewerAvailable() {
  return Boolean(loadNativePdfComponent());
}

export function NativePdfViewer({
  uri,
  height,
  displayMode,
  currentPage,
  onPageChange,
  onPageCountChange,
  palette = fallbackPalette,
}: Props) {
  const pdfRef = useRef<any>(null);
  const PdfComponent = loadNativePdfComponent();

  useEffect(() => {
    if (displayMode !== "pagina") return;
    if (!pdfRef.current?.setPage || currentPage <= 0) return;

    pdfRef.current.setPage(currentPage);
  }, [currentPage, displayMode, uri]);

  if (!PdfComponent) {
    return (
      <View
        style={[
          styles.unavailableBox,
          { minHeight: height, backgroundColor: palette.surface },
        ]}
      >
        <Text style={[styles.unavailableText, { color: palette.textMuted }]}>
          O leitor nativo de PDF precisa de um development build ou build instalada no
          dispositivo. No Expo Go ele fica desativado.
        </Text>
      </View>
    );
  }

  return (
    <View style={[styles.wrapper, { height, backgroundColor: palette.surface }]}>
      <PdfComponent
        ref={pdfRef}
        source={{ uri }}
        style={styles.pdf}
        page={Math.max(1, currentPage)}
        horizontal={false}
        enablePaging={false}
        singlePage={displayMode === "pagina"}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={displayMode === "rolagem"}
        spacing={displayMode === "pagina" ? 0 : 10}
        fitPolicy={displayMode === "pagina" ? 2 : 0}
        minScale={1}
        maxScale={3}
        onLoadComplete={(pages: number) => onPageCountChange(Math.max(1, pages))}
        onPageChanged={(page: number, pages: number) => {
          onPageCountChange(Math.max(1, pages));
          onPageChange(Math.max(1, page));
        }}
        renderActivityIndicator={() => (
          <View style={[styles.loadingBox, { backgroundColor: palette.surface }]}>
            <ActivityIndicator size="small" color={palette.accent} />
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
  },
  pdf: {
    flex: 1,
  },
  loadingBox: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  unavailableBox: {
    alignItems: "center",
    justifyContent: "center",
    padding: 18,
  },
  unavailableText: {
    textAlign: "center",
    lineHeight: 20,
  },
});
