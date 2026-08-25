import { ContentBlockPayload } from "@/interfaces/componentes_simples/IContentBlock";
import { Color, FontFamily } from "@/styles/GlobalStyle";
import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useMemo, useState } from "react";

import { assinaturaDoDeck } from "./studyCardsDeck";
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
import { useUsuario } from "@/context/SessaoContext";
import { getProfileShellPalette } from "@/utils/profileShellTheme";

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
  const { usuario } = useUsuario();
  const palette = useMemo(
    () => getProfileShellPalette(usuario?.perfis?.[0]?.nome ?? null),
    [usuario?.perfis]
  );
  const cards = useMemo(() => normalizeCards(payload), [payload]);
  const [index, setIndex] = useState(0);
  const [showBack, setShowBack] = useState(false);

  // Baralho novo comeca do primeiro card e pela FRENTE. Sem isto, um baralho
  // regenerado herdava a face virada do anterior e abria com a resposta a
  // mostra -- e, se o novo tivesse menos cards que o indice guardado, o bloco
  // simplesmente nao renderizava nada.
  const assinatura = useMemo(() => assinaturaDoDeck(cards), [cards]);
  useEffect(() => {
    setIndex(0);
    setShowBack(false);
  }, [assinatura]);

  // Clamp defensivo: entre a troca de baralho e o efeito acima existe um render
  // com o indice antigo, e e nele que a tela ficava em branco.
  const card = cards.length > 0 ? cards[Math.min(index, cards.length - 1)] : null;

  if (!card) return null;

  const media = buildCardMediaBlock(card);

  return (
    <View style={styles.wrapper}>
      <View style={styles.header}>
        <View>
          <Text style={[styles.label, { color: palette.text }]}>Cards de estudo</Text>
          <Text style={[styles.counter, { color: palette.textMuted }]}>
            Card {index + 1} de {cards.length}
          </Text>
        </View>

        <Pressable
          onPress={() => {
            setIndex(0);
            setShowBack(false);
          }}
          style={[
            styles.iconButton,
            { backgroundColor: palette.surface, borderColor: palette.border },
          ]}
        >
          <Ionicons name="refresh" size={18} color={palette.text} />
        </Pressable>
      </View>

      <Pressable
        onPress={() => setShowBack((value) => !value)}
        style={[
          styles.card,
          { backgroundColor: palette.surfaceElevated, borderColor: palette.borderStrong },
        ]}
      >
        <Text style={[styles.faceLabel, { backgroundColor: palette.accentMuted, color: palette.accent }]}>
          {showBack ? "Verso" : "Frente"}
        </Text>

        {card.imagemUrl ? (
          <Image
            source={{ uri: card.imagemUrl }}
            style={styles.image}
            resizeMode="cover"
          />
        ) : null}

        {card.titulo ? <Text style={[styles.title, { color: palette.text }]}>{card.titulo}</Text> : null}

        <Text style={[styles.content, { color: palette.text }]}>
          {showBack ? card.verso : card.frente}
        </Text>

        {card.descricao && !showBack ? (
          <Text style={[styles.description, { color: palette.textMuted }]}>{card.descricao}</Text>
        ) : null}

        {media ? (
          <View style={styles.mediaContainer}>
            {media.kind === "audio" ? (
              <AudioPlayer url={media.url} />
            ) : media.kind === "video" ? (
              <VideoPlayer url={media.url} />
            ) : media.kind === "pdf" || media.kind === "documento" || media.kind === "apresentacao" ? (
              <DocumentBlock tipo={media.kind} payload={{ url: media.url }} WebView={WebView} />
            ) : media.kind === "embed" ? (
              <DocumentBlock tipo="embed" payload={{ html: media.html }} WebView={WebView} />
            ) : null}
          </View>
        ) : null}

        <Text style={[styles.hint, { color: palette.textMuted }]}>Toque no card para virar.</Text>
      </Pressable>

      <View style={styles.footer}>
        <Pressable
          disabled={index === 0}
          onPress={() => {
            setIndex((value) => Math.max(0, value - 1));
            setShowBack(false);
          }}
          style={[
            styles.navButton,
            { borderColor: palette.border, backgroundColor: palette.surface },
            index === 0 && styles.navButtonDisabled,
          ]}
        >
          <Ionicons name="chevron-back" size={18} color={palette.text} />
          <Text style={[styles.navText, { color: palette.text }]}>Anterior</Text>
        </Pressable>

        <Pressable
          onPress={() => setShowBack((value) => !value)}
          style={[styles.flipButton, { backgroundColor: palette.accent }]}
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
            { borderColor: palette.border, backgroundColor: palette.surface },
            index >= cards.length - 1 && styles.navButtonDisabled,
          ]}
        >
          <Text style={[styles.navText, { color: palette.text }]}>Próximo</Text>
          <Ionicons name="chevron-forward" size={18} color={palette.text} />
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
    fontFamily: FontFamily.inikaBold,
    fontSize: 16,
  },
  counter: {
    marginTop: 2,
    fontFamily: FontFamily.interMedium,
    fontSize: 12,
  },
  iconButton: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 999,
    borderWidth: 1,
  },
  card: {
    minHeight: 240,
    borderRadius: 20,
    borderWidth: 1,
    padding: 18,
    gap: 12,
  },
  faceLabel: {
    alignSelf: "flex-start",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    fontFamily: FontFamily.interMedium,
    fontSize: 12,
  },
  image: {
    width: "100%",
    height: 140,
    borderRadius: 14,
  },
  title: {
    fontFamily: FontFamily.inikaBold,
    fontSize: 18,
  },
  content: {
    fontFamily: FontFamily.interMedium,
    fontSize: 15,
    lineHeight: 23,
  },
  description: {
    fontFamily: FontFamily.interMedium,
    fontSize: 13,
    lineHeight: 19,
  },
  mediaContainer: {
    marginTop: 4,
  },
  hint: {
    marginTop: "auto",
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
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
  navButtonDisabled: {
    opacity: 0.45,
  },
  navText: {
    fontFamily: FontFamily.interMedium,
    fontSize: 13,
  },
  flipButton: {
    minWidth: 110,
    minHeight: 44,
    borderRadius: 14,
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
