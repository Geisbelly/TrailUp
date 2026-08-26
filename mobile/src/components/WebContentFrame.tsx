import { Color } from "@/styles/GlobalStyle";
import { getProfileShellPalette, ProfileShellPalette } from "@/utils/profileShellTheme";
import { parseDeckProgressMessage, type DeckProgressEvent } from "@/utils/deckProgressMessage";
import {
  SCRIPT_PONTE_DE_VOZ,
  parsePedidoDeFala,
  scriptDeConclusao,
} from "@/utils/webviewSpeechBridge";
import * as Speech from "expo-speech";
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
  const webViewRef = useRef<any>(null);

  // Narração do deck no TTS nativo. O WebView do Android não implementa a Web
  // Speech API, então o polyfill injetado manda o texto para cá.
  const tratarPedidoDeFala = React.useCallback(
    (pedido: ReturnType<typeof parsePedidoDeFala>) => {
      if (!pedido) return;

      if (pedido.acao === "cancel") {
        void Speech.stop();
        return;
      }

      const avisarDeck = (comErro: boolean) => {
        // A página pode ter recarregado no meio da fala; o próprio script
        // injetado checa se o callback ainda existe.
        webViewRef.current?.injectJavaScript?.(scriptDeConclusao(pedido.id, comErro));
      };

      // Uma fala por vez: sem isto, tocar "Narrar" no slide seguinte empilharia
      // as duas vozes em cima uma da outra.
      void Speech.stop();
      Speech.speak(pedido.texto, {
        language: pedido.lang ?? "pt-BR",
        ...(pedido.rate != null ? { rate: pedido.rate } : {}),
        onDone: () => avisarDeck(false),
        onStopped: () => avisarDeck(false),
        onError: () => avisarDeck(true),
      });
    },
    []
  );

  useEffect(() => {
    // Sair da tela com a narração no ar deixaria a voz tocando sobre o resto do
    // app.
    return () => {
      void Speech.stop();
    };
  }, []);

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
          ref={webViewRef}
          // ANTES do conteudo: o deck testa `'speechSynthesis' in window` e o
          // WebView do Android nao implementa a API. Ver webviewSpeechBridge.
          injectedJavaScriptBeforeContentLoaded={SCRIPT_PONTE_DE_VOZ}
          onMessage={(event: any) => {
            const raw = event?.nativeEvent?.data ?? "";

            const fala = parsePedidoDeFala(raw);
            if (fala) {
              tratarPedidoDeFala(fala);
              return;
            }

            if (onProgressEvent) {
              const parsed = parseDeckProgressMessage(raw);
              if (parsed) onProgressEvent(parsed);
            }
          }}
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
