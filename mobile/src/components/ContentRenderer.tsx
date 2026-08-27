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
import type { DeckProgressEvent } from "@/utils/deckProgressMessage";
import { parseImageCues } from "@/utils/audioImageCues";
import React from "react";
import { Image, Platform, StyleSheet, Text, View } from "react-native";
import { DocumentBlock } from "./DocumentBlock";
import { MarkdownBlock } from "./MarkdownBlock";
import StudyCardsBlock from "./StudyCardsBlock";
import PresentationSlidesBlock from "./PresentationSlidesBlock";
import AudioPlayer from "./funcionais/AudioPlayer";
import VideoPlayer from "./funcionais/VideoPlayer";
import { resolveMediaText, resolveMediaTitle, resolveMediaUrl } from "@/utils/mediaPayload";

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
  onDeckProgressEvent?: (event: DeckProgressEvent) => void;
};

function resumeIdentity(topicoId: number | null | undefined, block: ContentBlock) {
  const mediaIdentity = resolveMediaUrl(block.payload);
  let payloadIdentity = mediaIdentity ?? "";
  if (!payloadIdentity) {
    try {
      payloadIdentity = JSON.stringify(block.payload) ?? "";
    } catch {
      payloadIdentity = String(block.payload ?? "");
    }
  }
  return `${topicoId ?? "sem-topico"}:${block.id}:${payloadIdentity}`;
}

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

/**
 * Bloco que nao pode ser exibido. Antes cada helper devolvia null quando nao
 * achava a midia, e o aluno via um ESPACO VAZIO - sem saber que ali deveria ter
 * conteudo, e sem nada pra reportar. Um aviso curto e melhor que o silencio.
 */
function MidiaIndisponivel({
  block,
  palette,
}: {
  block: ContentBlock;
  palette?: ReturnType<typeof getProfileShellPalette>;
}) {
  const titulo = resolveMediaTitle(block.payload);
  const cor = palette?.textMuted ?? "#a1a1aa";
  const borda = palette?.border ?? "rgba(255,255,255,0.12)";

  return (
    <View key={block.id} style={[styles.midiaIndisponivel, { borderColor: borda }]}>
      <Text style={[styles.midiaIndisponivelTexto, { color: cor }]}>
        {titulo ? `"${titulo}" não pôde ser exibido aqui.` : "Este material não pôde ser exibido aqui."}
      </Text>
    </View>
  );
}

function renderText(
  block: ContentBlock,
  palette: ReturnType<typeof getProfileShellPalette>
) {
  const text = resolveMediaText(block.payload);

  if (!text) return <MidiaIndisponivel block={block} palette={palette} />;

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
  const url = resolveMediaUrl(block.payload);

  if (!url) return <MidiaIndisponivel block={block} palette={palette} />;

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

function renderVideo(block: ContentBlock, topicoId?: number | null) {
  const payload =
    typeof block.payload === "object" && block.payload ? block.payload : null;
  const url = resolveMediaUrl(block.payload);
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
  const fallbackText = metadata ? readString(metadata, "fallbackText") : null;

  if (!url) return <MidiaIndisponivel block={block} />;
  return (
    <VideoPlayer
      key={block.id}
      url={url}
      title={title ?? undefined}
      bucketHint={bucketHint}
      fallbackText={fallbackText ?? undefined}
      progressKey={resumeIdentity(topicoId, block)}
    />
  );
}

function renderAudio(block: ContentBlock, topicoId?: number | null) {
  const payload =
    typeof block.payload === "object" && block.payload ? block.payload : null;
  const url = resolveMediaUrl(block.payload);
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
  const fallbackText = metadata ? readString(metadata, "fallbackText") : null;
  const capaUrl = metadata ? readString(metadata, "capaUrl") : null;
  const rawImageCues = metadata && Array.isArray((metadata as Record<string, unknown>).imageCues)
    ? (metadata as Record<string, unknown>).imageCues
    : null;
  const imageCues = rawImageCues ? parseImageCues(rawImageCues) : null;

  if (!url) return null;

  return (
    <AudioPlayer
      key={block.id}
      url={url}
      title={title ?? undefined}
      bucketHint={bucketHint}
      fallbackText={fallbackText ?? undefined}
      capaUrl={capaUrl ?? undefined}
      imageCues={imageCues ?? undefined}
      progressKey={resumeIdentity(topicoId, block)}
    />
  );
}

export function ContentRenderer({ blocks, WebView, topicoId, onDeckProgressEvent }: Props) {
  const { usuario } = useUsuario();
  const palette = React.useMemo(
    () => getProfileShellPalette(usuario?.perfilAtivo ?? usuario?.perfis?.[0]?.nome ?? null),
    [usuario?.perfilAtivo, usuario?.perfis]
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
                <DocumentBlock tipo="pdf" payload={block.payload} WebView={resolvedWebView} progressKey={resumeIdentity(topicoId, block)} />
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
                  progressKey={resumeIdentity(topicoId, block)}
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
                  progressKey={resumeIdentity(topicoId, block)}
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
              {renderAudio(block, topicoId)}
            </View>
          );
        }

        if (block.tipo === "video" || block.tipo === "youtube") {
          return (
            <View key={block.id}>
              {renderVideo(block, topicoId)}
            </View>
          );
        }

        if (block.tipo === "cards") {
          return (
            <View key={block.id}>
              <StudyCardsBlock payload={block.payload} WebView={resolvedWebView} progressKey={resumeIdentity(topicoId, block)} />
            </View>
          );
        }

        if (block.tipo === "apresentacao-slides") {
          return (
            <View key={block.id}>
              <PresentationSlidesBlock payload={block.payload} progressKey={resumeIdentity(topicoId, block)} />
            </View>
          );
        }

        if (block.tipo === "pdf") {
          return (
            <View key={block.id}>
              <DocumentBlock tipo="pdf" payload={block.payload} WebView={resolvedWebView} progressKey={resumeIdentity(topicoId, block)} />
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
                onDeckProgressEvent={onDeckProgressEvent}
                progressKey={resumeIdentity(topicoId, block)}
              />
            </View>
          );
        }

        // Tipo que o renderizador nao conhece: avisa em vez de sumir. O
        // "return null" daqui era a outra metade do problema - qualquer tipo
        // novo vindo do banco desaparecia sem deixar rastro.
        return (
          <View key={block.id}>
            <MidiaIndisponivel block={block} palette={palette} />
          </View>
        );
      })}
    </>
  );
}

const styles = StyleSheet.create({
  midiaIndisponivel: {
    marginVertical: 8,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderRadius: 12,
    borderStyle: "dashed",
  },
  midiaIndisponivelTexto: {
    fontSize: 12,
    textAlign: "center",
  },
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
