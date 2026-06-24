import { useUsuario } from "@/context/SessaoContext";
import { FontFamily } from "@/styles/GlobalStyle";
import {
  isDocumentUrl,
  isPdfUrl,
  isPresentationUrl,
} from "@/utils/contentBlocks";
import { getProfileShellPalette } from "@/utils/profileShellTheme";
import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import Markdown from "react-native-markdown-display";

type Props = {
  payload: any;
  WebView?: React.ComponentType<any> | null;
};

function readString(value: any, ...keys: string[]) {
  if (!value || typeof value !== "object") return null;
  for (const key of keys) {
    const current = value[key];
    if (typeof current === "string" && current.trim()) return current.trim();
  }
  return null;
}

function splitByH2(content: string): string[] {
  const parts = content.split(/(?=^##\s)/m);
  return parts.filter((p) => p.trim().length > 0);
}

export function MarkdownBlock({ payload }: Props) {
  const { usuario } = useUsuario();
  const palette = useMemo(
    () => getProfileShellPalette(usuario?.perfis?.[0]?.nome ?? null),
    [usuario?.perfis]
  );

  const inlineMarkdown =
    typeof payload === "string"
      ? payload
      : readString(payload, "markdown", "texto", "conteudo", "text");
  const sourceUrl =
    typeof payload === "object" ? readString(payload, "url", "uri", "src") : null;

  const [markdown, setMarkdown] = useState<string>(inlineMarkdown ?? "");
  const [carregando, setCarregando] = useState(!inlineMarkdown && !!sourceUrl);
  const [erro, setErro] = useState<string | null>(null);
  const [pageIndex, setPageIndex] = useState(0);

  useEffect(() => {
    setPageIndex(0);
  }, [markdown]);

  useEffect(() => {
    let ativo = true;
    if (inlineMarkdown) {
      setMarkdown(inlineMarkdown);
      setCarregando(false);
      setErro(null);
      return () => { ativo = false; };
    }
    if (!sourceUrl) {
      setMarkdown("");
      setCarregando(false);
      return () => { ativo = false; };
    }

    if (isPdfUrl(sourceUrl) || isPresentationUrl(sourceUrl) || isDocumentUrl(sourceUrl)) {
      setMarkdown("");
      setCarregando(false);
      setErro("Este arquivo nao e markdown e deve ser aberto no visualizador de documentos.");
      return () => { ativo = false; };
    }

    setCarregando(true);
    setErro(null);
    fetch(sourceUrl)
      .then((r) => {
        if (!r.ok) throw new Error("Não foi possível carregar o conteúdo.");
        return r.text();
      })
      .then((text) => { if (ativo) setMarkdown(text); })
      .catch((e) => { if (ativo) setErro(e instanceof Error ? e.message : "Falha ao carregar."); })
      .finally(() => { if (ativo) setCarregando(false); });
    return () => { ativo = false; };
  }, [inlineMarkdown, sourceUrl]);

  const pages = useMemo(() => {
    if (!markdown) return [];
    const parts = splitByH2(markdown);
    return parts.length > 1 ? parts : [markdown];
  }, [markdown]);

  const currentPage = pages[pageIndex] ?? "";
  const totalPages = pages.length;

  const mdStyles = useMemo(() => ({
    body: {
      color: palette.text,
      fontFamily: FontFamily.interMedium,
      fontSize: 15,
      lineHeight: 24,
    },
    heading1: {
      color: palette.text,
      fontFamily: FontFamily.poppinsExtraBold,
      fontSize: 22,
      marginTop: 16,
      marginBottom: 8,
    },
    heading2: {
      color: palette.text,
      fontFamily: FontFamily.poppinsExtraBold,
      fontSize: 19,
      marginTop: 14,
      marginBottom: 6,
    },
    heading3: {
      color: palette.text,
      fontFamily: FontFamily.poppinsExtraBold,
      fontSize: 16,
      marginTop: 10,
      marginBottom: 4,
    },
    paragraph: {
      color: palette.textMuted,
      fontSize: 15,
      lineHeight: 24,
      marginBottom: 10,
    },
    code_inline: {
      backgroundColor: palette.surface,
      color: palette.accent,
      borderRadius: 4,
      paddingHorizontal: 4,
    },
    fence: {
      backgroundColor: palette.surface,
      borderRadius: 8,
      padding: 12,
      color: palette.text,
      fontSize: 13,
    },
    blockquote: {
      borderLeftWidth: 3,
      borderLeftColor: palette.accent,
      paddingLeft: 12,
      color: palette.textMuted,
    },
    bullet_list_icon: {
      color: palette.accent,
    },
    list_item: {
      color: palette.textMuted,
      fontSize: 15,
      lineHeight: 22,
    },
    link: {
      color: palette.accent,
    },
    table: {
      borderWidth: 1,
      borderColor: palette.border,
      borderRadius: 8,
    },
    th: {
      backgroundColor: palette.surface,
      color: palette.text,
      padding: 8,
    },
    td: {
      color: palette.textMuted,
      padding: 8,
      borderTopWidth: 1,
      borderTopColor: palette.border,
    },
  }), [palette]);

  if (carregando) {
    return (
      <View style={styles.statusBox}>
        <ActivityIndicator size="small" color={palette.accent} />
        <Text style={[styles.statusText, { color: palette.textMuted }]}>
          Carregando conteúdo...
        </Text>
      </View>
    );
  }

  if (erro && !markdown) {
    return (
      <View style={styles.statusBox}>
        <Text style={[styles.statusText, { color: "#ff9d9d" }]}>{erro}</Text>
      </View>
    );
  }

  if (!currentPage) return null;

  return (
    <View style={styles.wrapper}>
      <Markdown style={mdStyles}>{currentPage}</Markdown>

      {totalPages > 1 && (
        <View style={[styles.pagination, { borderTopColor: palette.border }]}>
          <Pressable
            onPress={() => setPageIndex((i) => Math.max(0, i - 1))}
            disabled={pageIndex === 0}
            style={[
              styles.pageBtn,
              { borderColor: palette.border, opacity: pageIndex === 0 ? 0.3 : 1 },
            ]}
          >
            <Text style={[styles.pageBtnText, { color: palette.text }]}>← Anterior</Text>
          </Pressable>

          <Text style={[styles.pageCounter, { color: palette.textMuted }]}>
            {pageIndex + 1} / {totalPages}
          </Text>

          <Pressable
            onPress={() => setPageIndex((i) => Math.min(totalPages - 1, i + 1))}
            disabled={pageIndex === totalPages - 1}
            style={[
              styles.pageBtn,
              { borderColor: palette.border, opacity: pageIndex === totalPages - 1 ? 0.3 : 1 },
            ]}
          >
            <Text style={[styles.pageBtnText, { color: palette.text }]}>Próximo →</Text>
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginTop: 6,
  },
  statusBox: {
    marginTop: 8,
    paddingVertical: 8,
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  statusText: {
    fontFamily: FontFamily.interMedium,
    textAlign: "center",
  },
  pagination: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
  },
  pageBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
  },
  pageBtnText: {
    fontFamily: FontFamily.interMedium,
    fontSize: 13,
  },
  pageCounter: {
    fontFamily: FontFamily.interMedium,
    fontSize: 13,
  },
});
