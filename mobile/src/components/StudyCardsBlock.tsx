import { ContentBlockPayload } from "@/interfaces/componentes_simples/IContentBlock";
import { Color, FontFamily } from "@/styles/GlobalStyle";
import { Ionicons } from "@expo/vector-icons";
import React, { useMemo, useState } from "react";
import {
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { DocumentBlock } from "@/components/DocumentBlock";
import AudioPlayer from "@/components/funcionais/AudioPlayer";
import VideoPlayer from "@/components/funcionais/VideoPlayer";

type StudyCard = {
  id?: string | number;
  titulo?: string | null;
  frente?: string | null;
  verso?: string | null;
  descricao?: string | null;
  imagemUrl?: string | null;
  audioUrl?: string | null;
  videoUrl?: string | null;
  pdfUrl?: string | null;
  documentoUrl?: string | null;
  apresentacaoUrl?: string | null;
  embedHtml?: string | null;
};

type Props = {
  payload: ContentBlockPayload;
  WebView?: React.ComponentType<any> | null;
};

function normalizeCards(payload: ContentBlockPayload): StudyCard[] {
  if (!payload || typeof payload !== "object") return [];

  // Tenta extrair cards do campo direto ou de JSON serializado em payload.texto
  let rawCards: any[] | null = Array.isArray((payload as any).cards)
    ? (payload as any).cards
    : null;

  if (!rawCards && typeof (payload as any).texto === "string") {
    try {
      const parsed = JSON.parse((payload as any).texto);
      if (Array.isArray(parsed)) rawCards = parsed;
      else if (parsed?.cards && Array.isArray(parsed.cards)) rawCards = parsed.cards;
    } catch {
      // não era JSON de cards — ignora
    }
  }

  if (!Array.isArray(rawCards) || rawCards.length === 0) return [];

  return rawCards
    .map((card: any) => ({
      id: card.id,
      titulo: card.titulo ?? null,
      frente: card.frente ?? null,
      verso: card.verso ?? null,
      descricao: card.descricao ?? null,
      imagemUrl: card.imagemUrl ?? card.imagem_url ?? null,
      audioUrl: card.audioUrl ?? card.audio_url ?? null,
      videoUrl: card.videoUrl ?? card.video_url ?? null,
      pdfUrl: card.pdfUrl ?? card.pdf_url ?? null,
      documentoUrl: card.documentoUrl ?? card.documento_url ?? null,
      apresentacaoUrl: card.apresentacaoUrl ?? card.apresentacao_url ?? null,
      embedHtml: card.embedHtml ?? card.embed_html ?? null,
    }))
    .filter((card) => card.frente && card.verso);
}

function buildCardMediaBlock(card: StudyCard) {
  if (card.videoUrl) return { kind: "video" as const, url: card.videoUrl };
  if (card.audioUrl) return { kind: "audio" as const, url: card.audioUrl };
  if (card.pdfUrl) return { kind: "pdf" as const, url: card.pdfUrl };
  if (card.documentoUrl) return { kind: "documento" as const, url: card.documentoUrl };
  if (card.apresentacaoUrl) return { kind: "apresentacao" as const, url: card.apresentacaoUrl };
  if (card.embedHtml) return { kind: "embed" as const, html: card.embedHtml };
  return null;
}

export default function StudyCardsBlock({ payload, WebView }: Props) {
  const cards = useMemo(() => normalizeCards(payload), [payload]);
  const [index, setIndex] = useState(0);
  const [showBack, setShowBack] = useState(false);

  const card = cards[index] ?? null;

  if (!card) return null;

  const media = buildCardMediaBlock(card);

  return (
    <View style={styles.wrapper}>
      <View style={styles.header}>
        <View>
          <Text style={styles.label}>Cards de estudo</Text>
          <Text style={styles.counter}>
            Card {index + 1} de {cards.length}
          </Text>
        </View>

        <Pressable
          onPress={() => {
            setIndex(0);
            setShowBack(false);
          }}
          style={styles.iconButton}
        >
          <Ionicons name="refresh" size={18} color={Color.colorAliceblue} />
        </Pressable>
      </View>

      <Pressable
        onPress={() => setShowBack((value) => !value)}
        style={styles.card}
      >
        <Text style={styles.faceLabel}>{showBack ? "Verso" : "Frente"}</Text>

        {card.imagemUrl ? (
          <Image
            source={{ uri: card.imagemUrl }}
            style={styles.image}
            resizeMode="cover"
          />
        ) : null}

        {card.titulo ? <Text style={styles.title}>{card.titulo}</Text> : null}

        <Text style={styles.content}>
          {showBack ? card.verso : card.frente}
        </Text>

        {card.descricao && !showBack ? (
          <Text style={styles.description}>{card.descricao}</Text>
        ) : null}

        {media ? (
          <View style={styles.mediaContainer}>
            {media.kind === "audio" ? (
              <AudioPlayer url={media.url} />
            ) : media.kind === "video" ? (
              <VideoPlayer url={media.url} WebView={WebView} />
            ) : media.kind === "pdf" || media.kind === "documento" || media.kind === "apresentacao" ? (
              <DocumentBlock tipo={media.kind} payload={{ url: media.url }} WebView={WebView} />
            ) : media.kind === "embed" ? (
              <DocumentBlock tipo="embed" payload={{ html: media.html }} WebView={WebView} />
            ) : null}
          </View>
        ) : null}

        <Text style={styles.hint}>Toque no card para virar.</Text>
      </Pressable>

      <View style={styles.footer}>
        <Pressable
          disabled={index === 0}
          onPress={() => {
            setIndex((value) => Math.max(0, value - 1));
            setShowBack(false);
          }}
          style={[styles.navButton, index === 0 && styles.navButtonDisabled]}
        >
          <Ionicons name="chevron-back" size={18} color={Color.colorAliceblue} />
          <Text style={styles.navText}>Anterior</Text>
        </Pressable>

        <Pressable
          onPress={() => setShowBack((value) => !value)}
          style={styles.flipButton}
        >
          <Ionicons name="sync" size={18} color={Color.colorWhite} />
          <Text style={styles.flipText}>{showBack ? "Ver frente" : "Virar"}</Text>
        </Pressable>

        <Pressable
          disabled={index >= cards.length - 1}
          onPress={() => {
            setIndex((value) => Math.min(cards.length - 1, value + 1));
            setShowBack(false);
          }}
          style={[
            styles.navButton,
            index >= cards.length - 1 && styles.navButtonDisabled,
          ]}
        >
          <Text style={styles.navText}>Próximo</Text>
          <Ionicons name="chevron-forward" size={18} color={Color.colorAliceblue} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginTop: 10,
    gap: 10,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  label: {
    color: Color.colorAliceblue,
    fontFamily: FontFamily.inikaBold,
    fontSize: 16,
  },
  counter: {
    marginTop: 2,
    color: Color.colorSlategray,
    fontFamily: FontFamily.interMedium,
    fontSize: 12,
  },
  iconButton: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 999,
    backgroundColor: "#1d2748",
    borderWidth: 1,
    borderColor: Color.colorDarkslategray100,
  },
  card: {
    minHeight: 240,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "rgba(164, 141, 255, 0.35)",
    backgroundColor: "#111a34",
    padding: 18,
    gap: 12,
  },
  faceLabel: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: "rgba(106,95,253,0.16)",
    color: Color.colorBlueviolet100,
    fontFamily: FontFamily.interMedium,
    fontSize: 12,
  },
  image: {
    width: "100%",
    height: 140,
    borderRadius: 14,
  },
  title: {
    color: Color.colorAliceblue,
    fontFamily: FontFamily.inikaBold,
    fontSize: 18,
  },
  content: {
    color: Color.colorAliceblue,
    fontFamily: FontFamily.interMedium,
    fontSize: 15,
    lineHeight: 23,
  },
  description: {
    color: Color.colorSlategray,
    fontFamily: FontFamily.interMedium,
    fontSize: 13,
    lineHeight: 19,
  },
  mediaContainer: {
    marginTop: 4,
  },
  hint: {
    marginTop: "auto",
    color: Color.colorSlategray,
    fontFamily: FontFamily.interMedium,
    fontSize: 12,
  },
  footer: {
    flexDirection: "row",
    gap: 8,
  },
  navButton: {
    flex: 1,
    minHeight: 44,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Color.colorDarkslategray100,
    backgroundColor: "#151f3e",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  navButtonDisabled: {
    opacity: 0.45,
  },
  navText: {
    color: Color.colorAliceblue,
    fontFamily: FontFamily.interMedium,
    fontSize: 13,
  },
  flipButton: {
    minWidth: 110,
    minHeight: 44,
    borderRadius: 14,
    backgroundColor: Color.colorBlueviolet100,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingHorizontal: 12,
  },
  flipText: {
    color: Color.colorWhite,
    fontFamily: FontFamily.inikaBold,
    fontSize: 13,
  },
});
