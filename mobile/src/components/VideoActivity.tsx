import { useUsuario } from "@/context/SessaoContext";
import { getProfileShellPalette } from "@/utils/profileShellTheme";
import React from "react";
import { Text, View } from "react-native";

import { ContentRenderer } from "./ContentRenderer";
import VideoPlayer from "./funcionais/VideoPlayer";
import { normalizeContentBlock } from "@/utils/contentBlocks";

type Props = {
  atividade: any;
  onComplete?: () => void;
};

export default function VideoActivity({ atividade }: Props) {
  const { usuario } = useUsuario();
  const palette = getProfileShellPalette(usuario?.perfis?.[0]?.nome ?? null);
  const url =
    atividade?.conteudos?.[0]?.conteudo ??
    atividade?.url ??
    atividade?.video_url ??
    atividade?.midia_url;
  const anexos = [
    ...(Array.isArray(atividade?.arquivos) ? atividade.arquivos : []),
    ...(Array.isArray(atividade?.anexos) ? atividade.anexos : []),
    ...(Array.isArray(atividade?.midias) ? atividade.midias : []),
  ]
    .map((item, index) => normalizeContentBlock(item, `atividade-video-anexo-${index}`))
    .filter(Boolean);

  return (
    <View style={{ flex: 1, gap: 12 }}>
      {url ? <VideoPlayer url={url} title={atividade?.titulo ?? "Vídeo"} /> : null}

      <View
        style={{
          paddingHorizontal: 15,
          paddingTop: url ? 0 : 15,
          gap: 10,
        }}
      >
        <Text
          style={{
            color: palette.text,
            fontSize: 20,
            fontWeight: "700",
          }}
        >
          {atividade?.titulo}
        </Text>
        {atividade?.descricao || atividade?.conteudo ? (
          <Text
            style={{
              color: palette.textMuted,
              lineHeight: 20,
            }}
          >
            {atividade.descricao ?? atividade.conteudo}
          </Text>
        ) : null}
      </View>

      {anexos.length > 0 ? (
        <View
          style={{
            borderWidth: 1,
            borderColor: palette.border,
            borderRadius: 16,
            backgroundColor: palette.surface,
            padding: 12,
            marginHorizontal: 12,
          }}
        >
          <ContentRenderer blocks={anexos} />
        </View>
      ) : null}
    </View>
  );
}
