import { Color } from "@/styles/GlobalStyle";
import { getProfileShellPalette, ProfileShellPalette } from "@/utils/profileShellTheme";
import { parseDeckProgressMessage, type DeckProgressEvent } from "@/utils/deckProgressMessage";
import React, { useEffect, useRef } from "react";
import {
  ActivityIndicator,
  Linking,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";

type Props = {
  title?: string;
  height: number;
  html?: string | null;
  uri?: string | null;
  scrollEnabled?: boolean;
  palette?: ProfileShellPalette;
  WebView?: React.ComponentType<any> | null;
  onProgressEvent?: (event: DeckProgressEvent) => void;
};

const fallbackPalette = getProfileShellPalette("mastermind");

const webFrameStyle = {
  width: "100%",
  border: "none",
  borderRadius: "16px",
  overflow: "hidden",
  backgroundColor: fallbackPalette.surface,
};

export function WebContentFrame({
  title,
  height,
  html,
  uri,
  scrollEnabled = true,
  palette = fallbackPalette,
  WebView,
  onProgressEvent,
}: Props) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  // Escuta postMessage do deck (ver reportProgressToHost em
  // BrainHexPDF/src/utils/deckExportUtils.ts). window.addEventListener('message')
  // recebe mensagem de QUALQUER origem por padrao - o check de
  // event.source === iframeRef.current.contentWindow garante que a
  // mensagem veio especificamente do nosso proprio iframe, nao de outra
  // aba/origem arbitraria.
  useEffect(() => {
    if (Platform.OS !== "web" || !onProgressEvent) return;

    function handleMessage(event: MessageEvent) {
      if (!iframeRef.current || event.source !== iframeRef.current.contentWindow) return;
      const raw = typeof event.data === "string" ? event.data : "";
      const parsed = parseDeckProgressMessage(raw);
      if (parsed) onProgressEvent!(parsed);
    }

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [onProgressEvent]);

  if (Platform.OS === "web") {
    return html ? (
      <iframe
        title={title ?? "Visualizador"}
        srcDoc={html}
        style={{ ...webFrameStyle, height, backgroundColor: palette.surface }}
        allowFullScreen
      />
    ) : uri ? (
      <iframe
        ref={iframeRef}
        title={title ?? "Visualizador"}
        src={uri}
        style={{ ...webFrameStyle, height, backgroundColor: palette.surface }}
        allowFullScreen
      />
    ) : null;
  }

  if (WebView) {
    const Comp = WebView;
    return (
      <View style={[styles.webViewShell, { height, backgroundColor: palette.surface }]}>
        <Comp
          originWhitelist={["*"]}
          source={html ? { html, baseUrl: uri ?? undefined } : { uri: uri ?? "" }}
          style={[styles.webView, { backgroundColor: palette.surface }]}
          containerStyle={[styles.webView, { backgroundColor: palette.surface }]}
          onMessage={
            onProgressEvent
              ? (event: any) => {
                  const parsed = parseDeckProgressMessage(event?.nativeEvent?.data ?? "");
                  if (parsed) onProgressEvent(parsed);
                }
              : undefined
          }
          javaScriptEnabled
          domStorageEnabled
          nestedScrollEnabled={scrollEnabled}
          scrollEnabled={scrollEnabled}
          allowsFullscreenVideo
          setSupportMultipleWindows={false}
          cacheEnabled={false}
          showsVerticalScrollIndicator={false}
          showsHorizontalScrollIndicator={false}
          overScrollMode="never"
          bounces={false}
          startInLoadingState
          renderLoading={() => (
            <View
              style={[
                styles.loadingBox,
                { minHeight: height, backgroundColor: palette.surface },
              ]}
            >
              <ActivityIndicator size="small" color={palette.accent} />
              <Text style={[styles.loadingText, { color: palette.textMuted }]}>
                Carregando visualização...
              </Text>
            </View>
          )}
        />
      </View>
    );
  }

  if (!uri) return null;

  return (
    <View
      style={[
        styles.fallbackBox,
        {
          minHeight: Math.max(180, height),
          borderColor: palette.border,
          backgroundColor: palette.surface,
        },
      ]}
    >
      <Text style={[styles.fallbackText, { color: palette.textMuted }]}>
        Não foi possível exibir este conteúdo dentro do aplicativo.
      </Text>
      <Pressable
        style={[
          styles.fallbackButton,
          {
            backgroundColor: palette.accent,
          },
        ]}
        onPress={() => Linking.openURL(uri)}
      >
        <Text style={[styles.fallbackButtonText, { color: palette.background }]}>
          Abrir arquivo
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  fallbackBox: {
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
  },
  fallbackText: {
    textAlign: "center",
  },
  fallbackButton: {
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: Color.colorBlueviolet100,
  },
  fallbackButtonText: {
    color: Color.colorWhite,
    fontWeight: "700",
  },
  webViewShell: {
    flex: 1,
  },
  webView: {
    flex: 1,
  },
  loadingBox: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    padding: 18,
  },
  loadingText: {
    textAlign: "center",
  },
});
