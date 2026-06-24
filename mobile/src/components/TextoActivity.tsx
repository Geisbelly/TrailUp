import { ContentRenderer } from "@/components/ContentRenderer";
import { useUsuario } from "@/context/SessaoContext";
import { ContentBlock } from "@/interfaces/componentes_simples/IContentBlock";
import { FontFamily } from "@/styles/GlobalStyle";
import { normalizeContentBlock } from "@/utils/contentBlocks";
import { getProfileShellPalette } from "@/utils/profileShellTheme";
import React, { useMemo } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";

type Props = {
  atividade: any;
  onComplete?: () => void;
};

function buildMediaCandidates(source: any) {
  return [
    source?.midia,
    source?.midia_url,
    source?.audio_url,
    source?.video_url,
    source?.imagem_url,
    source?.image_url,
    source?.pdf_url,
    source?.arquivo_url,
    source?.file_url,
    source?.document_url,
    source?.documento_url,
    source?.apresentacao_url,
    source?.embed_html,
    source?.html,
    ...(Array.isArray(source?.midias) ? source.midias : []),
    ...(Array.isArray(source?.media) ? source.media : []),
    ...(Array.isArray(source?.anexos) ? source.anexos : []),
    ...(Array.isArray(source?.arquivos) ? source.arquivos : []),
    ...(Array.isArray(source?.fontes) ? source.fontes : []),
    ...(Array.isArray(source?.materiais) ? source.materiais : []),
  ].filter(Boolean);
}

function normalizeMediaBlocks(atividade: any): ContentBlock[] {
  const seen = new Set<string>();

  return buildMediaCandidates(atividade)
    .map((item, index) => normalizeContentBlock(item, `atividade-texto-media-${index}`))
    .filter((block): block is ContentBlock => Boolean(block && block.tipo !== "texto"))
    .filter((block) => {
      const signature = `${block.tipo}:${JSON.stringify(block.payload)}`;
      if (seen.has(signature)) return false;
      seen.add(signature);
      return true;
    });
}

export default function TextoActivity({ atividade }: Props) {
  const { usuario } = useUsuario();
  const palette = useMemo(
    () => getProfileShellPalette(usuario?.perfis?.[0]?.nome ?? null),
    [usuario?.perfis]
  );
  const mediaBlocks = useMemo(() => normalizeMediaBlocks(atividade), [atividade]);

  return (
    <ScrollView
      style={{ padding: 20 }}
      contentContainerStyle={{ gap: 14, paddingBottom: 24 }}
      showsVerticalScrollIndicator={false}
    >
      <Text style={[styles.title, { color: palette.text }]}>{atividade.titulo}</Text>

      {atividade.descricao || atividade.conteudo ? (
        <Text style={[styles.description, { color: palette.textMuted }]}>
          {atividade.descricao ?? atividade.conteudo}
        </Text>
      ) : null}

      {mediaBlocks.length > 0 ? (
        <View
          style={[
            styles.mediaCard,
            {
              backgroundColor: palette.surface,
              borderColor: palette.border,
            },
          ]}
        >
          <ContentRenderer blocks={mediaBlocks} />
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  title: {
    fontSize: 24,
    fontFamily: FontFamily.inikaBold,
  },
  description: {
    marginTop: 2,
    fontSize: 15,
    lineHeight: 22,
    fontFamily: FontFamily.interMedium,
  },
  mediaCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 12,
  },
});
