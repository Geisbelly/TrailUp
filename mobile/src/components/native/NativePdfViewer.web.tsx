// Variante web de NativePdfViewer. Existe por causa do BUNDLER, nao do runtime.
//
// O arquivo nativo faz `require("react-native-pdf")` dentro de uma guarda de
// plataforma, e ainda assim o bundle web quebrava:
//
//   Error: Importing native-only module
//   "react-native/Libraries/Utilities/codegenNativeComponent" on web from:
//   node_modules/react-native-pdf/fabric/RNPDFPdfNativeComponent.js
//
// O Metro resolve `require()` com string literal em tempo de bundle, sem avaliar
// a condicao em volta. `react-native-webview` sobrevive ao mesmo padrao porque
// tem entrada web; `react-native-pdf` declara apenas "main"/"react-native", nao
// tem `browser`, e a resolucao falha antes de qualquer codigo rodar. Adiar a
// execucao nao resolve - e preciso o Metro nunca resolver o modulo na web.
//
// Com este `.web.tsx`, o Metro escolhe este arquivo para a plataforma web e o
// pacote nativo sai do grafo de modulos. Mesmo padrao ja usado em
// `src/hooks/use-color-scheme.web.ts`.
//
// Na pratica nada aqui e renderizado: `DocumentBlock.tsx:778` monta o leitor
// nativo so quando `Platform.OS !== "web"`, e na web o PDF segue pelo iframe de
// `WebContentFrame`. Ainda assim este stub devolve um aviso visivel em vez de
// `null`, para que um consumidor futuro que esqueca a guarda veja o motivo na
// tela em vez de um espaco vazio.

import { ContentDisplayMode } from "@/interfaces/componentes_simples/IContentBlock";
import { getProfileShellPalette, ProfileShellPalette } from "@/utils/profileShellTheme";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

type Props = {
  uri: string;
  height: number;
  displayMode: ContentDisplayMode;
  currentPage: number;
  onPageChange: (page: number) => void;
  onPageCountChange: (count: number) => void;
  palette?: ProfileShellPalette;
};

const fallbackPalette = getProfileShellPalette("mastermind");

export function isNativePdfViewerAvailable() {
  return false;
}

export function NativePdfViewer({
  height,
  palette = fallbackPalette,
}: Props) {
  return (
    <View
      style={[
        styles.unavailableBox,
        { minHeight: height, backgroundColor: palette.surface },
      ]}
    >
      <Text style={[styles.unavailableText, { color: palette.textMuted }]}>
        O leitor nativo de PDF nao existe na web. Use o visualizador em iframe.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
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
