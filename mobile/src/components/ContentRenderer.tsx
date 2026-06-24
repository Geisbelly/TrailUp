import {
  ContentBlock,
  ContentBlockPayload,
} from "@/interfaces/componentes_simples/IContentBlock";
import { useUsuario } from "@/context/SessaoContext";
import { Color, FontFamily } from "@/styles/GlobalStyle";
import { getProfileShellPalette } from "@/utils/profileShellTheme";
import {
  isDocumentUrl,
  isPdfUrl,
  isPresentationUrl,
} from "@/utils/contentBlocks";
import React from "react";
import { Image, Platform, StyleSheet, Text, View } from "react-native";
import { DocumentBlock } from "./DocumentBlock";
import { MarkdownBlock } from "./MarkdownBlock";
import StudyCardsBlock from "./StudyCardsBlock";
import AudioPlayer from "./funcionais/AudioPlayer";
import VideoPlayer from "./funcionais/VideoPlayer";

function loadWebView(): React.ComponentType<any> | null {
  if (Platform.OS === "web") return null;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const RNWebView = require("react-native-webview");
    return RNWebView.default || RNWebView.WebView || null;
  } catch {
    return null;
  }
}
const DefaultWebView = loadWebView();

type Props = {
  blocks: ContentBlock[];
  WebView?: React.ComponentType<any> | null;
  topicoId?: number | null;
  enableItemIA?: boolean;
};

function readString(payload: ContentBlockPayload, ...keys: string[]) {
  if (!payload || typeof payload !== "object") return null;

  for (const key of keys) {
    const value = payload[key as keyof typeof payload];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return null;
}

function renderText(
  block: ContentBlock,
  palette: ReturnType<typeof getProfileShellPalette>
) {
  const text =
    typeof block.payload === "string"
      ? block.payload
      : readString(block.payload, "texto", "markdown", "legenda");

  if (!text) return null;

  return (
    <Text key={block.id} style={[styles.cardBody, { color: palette.textMuted }]}>
      {text}
    </Text>
  );
}

function renderImage(
  block: ContentBlock,
  palette: ReturnType<typeof getProfileShellPalette>
) {
  const url =
    typeof block.payload === "object"
      ? readString(block.payload, "url", "uri", "src")
      : null;

  if (!url) return null;

  return (
    <View
      key={block.id}
      style={[
        styles.mediaBox,
        { backgroundColor: palette.surface, borderColor: palette.border },
      ]}
    >
      <Image
        source={{ uri: url }}
        style={styles.image}
        resizeMode="contain"
      />
    </View>
  );
}

function renderVideo(block: ContentBlock) {
  const payload =
    typeof block.payload === "object" && block.payload ? block.payload : null;
  const url = payload
    ? readString(payload, "url", "uri", "src")
    : typeof block.payload === "string"
    ? block.payload
    : null;
  const metadata =
    payload?.metadata && typeof payload.metadata === "object"
      ? (payload.metadata as Record<string, unknown>)
      : null;
  const bucketHint = metadata
    ? readString(
        metadata,
        "bucket",
        "bucketName",
        "storageBucket",
        "storage_bucket"
      )
    : null;
  const title = payload ? readString(payload, "title", "legenda") : null;

  if (!url) return null;
  return (
    <VideoPlayer
      key={block.id}
      url={url}
      title={title ?? undefined}
      bucketHint={bucketHint}
    />
  );
}

function renderAudio(block: ContentBlock) {
  const payload =
    typeof block.payload === "object" && block.payload ? block.payload : null;
  const url = payload
    ? readString(payload, "url", "uri", "src")
    : typeof block.payload === "string"
    ? block.payload
    : null;
  const metadata =
    payload?.metadata && typeof payload.metadata === "object"
      ? (payload.metadata as Record<string, unknown>)
      : null;
  const bucketHint = metadata
    ? readString(
        metadata,
        "bucket",
        "bucketName",
        "storageBucket",
        "storage_bucket"
      )
    : null;
  const title = payload ? readString(payload, "title", "legenda") : null;

  if (!url) return null;

  return (
    <AudioPlayer
      key={block.id}
      url={url}
      title={title ?? undefined}
      bucketHint={bucketHint}
    />
  );
}

export function ContentRenderer({ blocks, WebView }: Props) {
  const { usuario } = useUsuario();
  const palette = React.useMemo(
    () => getProfileShellPalette(usuario?.perfis?.[0]?.nome ?? null),
    [usuario?.perfis]
  );
  const resolvedWebView = WebView ?? DefaultWebView;

  if (!blocks?.length) return null;

  return (
    <>
      {blocks.map((block) => {
        if (block.tipo === "texto") {
          return (
            <View key={block.id}>
              {renderText(block, palette)}
            </View>
          );
        }

        if (block.tipo === "markdown") {
          const urlFromPayload =
            typeof block.payload === "object"
              ? readString(block.payload, "url", "uri", "src")
              : null;

          if (urlFromPayload && isPdfUrl(urlFromPayload)) {
            return (
              <View key={block.id}>
                <DocumentBlock tipo="pdf" payload={block.payload} WebView={resolvedWebView} />
              </View>
            );
          }

          if (urlFromPayload && isPresentationUrl(urlFromPayload)) {
            return (
              <View key={block.id}>
                <DocumentBlock
                  tipo="apresentacao"
                  payload={block.payload}
                  WebView={resolvedWebView}
                />
              </View>
            );
          }

          if (urlFromPayload && isDocumentUrl(urlFromPayload)) {
            return (
              <View key={block.id}>
                <DocumentBlock
                  tipo="documento"
                  payload={block.payload}
                  WebView={resolvedWebView}
                />
              </View>
            );
          }

          return (
            <View key={block.id}>
              <MarkdownBlock payload={block.payload} WebView={resolvedWebView} />
            </View>
          );
        }

        if (block.tipo === "imagem") {
          return (
            <View key={block.id}>
              {renderImage(block, palette)}
            </View>
          );
        }

        if (block.tipo === "audio") {
          return (
            <View key={block.id}>
              {renderAudio(block)}
            </View>
          );
        }

        if (block.tipo === "video" || block.tipo === "youtube") {
          return (
            <View key={block.id}>
              {renderVideo(block)}
            </View>
          );
        }

        if (block.tipo === "cards") {
          return (
            <View key={block.id}>
              <StudyCardsBlock payload={block.payload} WebView={resolvedWebView} />
            </View>
          );
        }

        if (block.tipo === "pdf") {
          return (
            <View key={block.id}>
              <DocumentBlock tipo="pdf" payload={block.payload} WebView={resolvedWebView} />
            </View>
          );
        }

        if (
          block.tipo === "documento" ||
          block.tipo === "apresentacao" ||
          block.tipo === "embed"
        ) {
          return (
            <View key={block.id}>
              <DocumentBlock
                tipo={block.tipo}
                payload={block.payload}
                WebView={resolvedWebView}
              />
            </View>
          );
        }

        return null;
      })}
    </>
  );
}

const styles = StyleSheet.create({
  cardBody: {
    marginTop: 8,
    fontFamily: FontFamily.interMedium,
    fontSize: 15,
    lineHeight: 23,
    color: Color.colorAliceblue300,
  },
  mediaBox: {
    marginTop: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Color.colorDarkslategray100,
    backgroundColor: "transparent",
    overflow: "hidden",
  },
  image: {
    width: "100%",
    height: 260,
    backgroundColor: "transparent",
  },
});
