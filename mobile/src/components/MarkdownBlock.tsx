import { useUsuario } from "@/context/SessaoContext";
import { FontFamily } from "@/styles/GlobalStyle";
import {
  isDocumentUrl,
  isPdfUrl,
  isPresentationUrl,
} from "@/utils/contentBlocks";
import { getProfileShellPalette } from "@/utils/profileShellTheme";
import { resolveSupabaseStorageUrl } from "@/utils/supabaseStorage";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Markdown, { MarkdownIt } from "react-native-markdown-display";
import FitImage from "react-native-fit-image";
import { SvgXml } from "react-native-svg";
import { decodeInlineSvgDataUri } from "@/utils/inlineSvgDataUri";
import { conteudoDeBloco, liberarImagensEmbutidas } from "@/utils/markdownDataUri";
import tinycolor from "tinycolor2";
import { resolveMediaUrl } from "@/utils/mediaPayload";

// Fora do componente: a biblioteca memoiza o parser pela IDENTIDADE da
// instancia (`useMemo(() => markdownit, [markdownit])`), entao uma instancia
// nova a cada render refaria o parse do material inteiro toda vez.
// `typographer: true` e' o mesmo default da biblioteca — so a politica de data
// URI muda, para o diagrama em SVG nao ser descartado no parser
// (ver utils/markdownDataUri.ts).
const parserComDiagramas = liberarImagensEmbutidas(new MarkdownIt({ typographer: true }));

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

// Diagrama de fluxo chega no markdown como SVG embutido em data URI (ver
// microservice/src/utils/flowDiagram.ts). O <Image> do React Native nao
// renderiza SVG, entao esta regra desenha com react-native-svg; qualquer outra
// imagem (foto do professor, png/jpeg) segue pelo renderizador padrao da
// biblioteca, sem mudanca de comportamento.
function criarMarkdownRules(palette: ReturnType<typeof getProfileShellPalette>) {
  // Moldura do perfil em volta da imagem do professor - mesma ideia do console
  // (frontend/src/lib/profileImageFrame.ts): a imagem entra na estetica do
  // perfil sem ninguem tocar nos pixels dela, entao gif continua animando.
  const moldura = {
    borderColor: tinycolor(palette.accent).setAlpha(0.55).toRgbString(),
    backgroundColor: tinycolor(palette.accent).setAlpha(0.06).toRgbString(),
  };

  return {
  image: (
    node: any,
    children: any,
    parent: any,
    estilos: any,
    allowedImageHandlers: string[],
    defaultImageHandler: string,
  ) => {
    const inline = decodeInlineSvgDataUri(node?.attributes?.src);
    if (!inline) {
      const src = node?.attributes?.src ?? "";
      const alt = node?.attributes?.alt;
      const permitido = allowedImageHandlers.some((handler) =>
        src.toLowerCase().startsWith(handler.toLowerCase()),
      );
      if (!permitido && defaultImageHandler === null) return null;
      const imageProps = {
        indicator: true,
        style: estilos._VIEW_SAFE_image,
        source: { uri: permitido ? src : `${defaultImageHandler}${src}` },
        ...(alt ? { accessible: true, accessibilityLabel: alt } : {}),
      };
      return (
        <View key={node.key} style={[styles.imagemEmoldurada, moldura]}>
          <FitImage key={node.key} {...imageProps} />
        </View>
      );
    }
    return (
      <View key={node.key} style={[styles.diagrama, { aspectRatio: inline.aspectRatio }]}>
        <SvgXml xml={inline.xml} width="100%" height="100%" />
      </View>
    );
  },

  // Bloco cercado por ``` e tabela sao desenhados por POSICAO horizontal: arte
  // ASCII emoldurada ("+-----+"), arvore de diretorio, codigo indentado, coluna
  // de tabela. A biblioteca poe o bloco num <Text> comum, que quebra linha na
  // largura da tela — e quebra de linha em desenho alinhado nao degrada, destroi.
  //
  // O microservice converte em SVG so o que consegue LER como fluxo ou raia; o
  // resto ele devolve intacto de proposito (ver microservice/src/utils/
  // asciiDiagram.ts: bloco emoldurado e linguagem de codigo real nunca viram
  // imagem). Tudo isso chega aqui, e e' aqui que precisa caber.
  //
  // `flexGrow: 1` no conteudo mantem a moldura ocupando a largura toda quando o
  // bloco e' estreito; quando e' largo, rola em vez de quebrar.
  fence: (node: any, _children: any, _parent: any, estilos: any) => (
    <ScrollView
      key={node.key}
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.blocoRolavel}
      contentContainerStyle={styles.blocoRolavelConteudo}
    >
      <Text style={estilos.fence}>{conteudoDeBloco(node.content)}</Text>
    </ScrollView>
  ),
  code_block: (node: any, _children: any, _parent: any, estilos: any) => (
    <ScrollView
      key={node.key}
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.blocoRolavel}
      contentContainerStyle={styles.blocoRolavelConteudo}
    >
      <Text style={estilos.code_block}>{conteudoDeBloco(node.content)}</Text>
    </ScrollView>
  ),
  table: (node: any, children: any, _parent: any, estilos: any) => (
    <ScrollView
      key={node.key}
      horizontal
      showsHorizontalScrollIndicator={false}
      style={styles.blocoRolavel}
      contentContainerStyle={styles.blocoRolavelConteudo}
    >
      <View style={estilos._VIEW_SAFE_table}>{children}</View>
    </ScrollView>
  ),
  };
}

function splitByH2(content: string): string[] {
  const parts = content.split(/(?=^##\s)/m);
  return parts.filter((p) => p.trim().length > 0);
}

export function MarkdownBlock({ payload }: Props) {
  const { usuario } = useUsuario();
  const palette = useMemo(
    () => getProfileShellPalette(usuario?.perfilAtivo ?? usuario?.perfis?.[0]?.nome ?? null),
    [usuario?.perfilAtivo, usuario?.perfis]
  );
  const markdownRules = useMemo(() => criarMarkdownRules(palette), [palette]);

  const inlineMarkdown =
    typeof payload === "string"
      ? payload
      : readString(payload, "markdown", "texto", "conteudo", "text");
  // resolveMediaUrl e nao readString: o material do banco vem com
  // "arquivo_url" (e material multi-parte guarda a parte 1 em "partes"), e a
  // lista antiga so conhecia url/uri/src - markdown gravado assim nao
  // carregava e o bloco ficava vazio. Ver utils/mediaPayload.ts.
  const sourceUrl = resolveMediaUrl(payload);
  const bucketHint =
    typeof payload === "object" && payload?.metadata && typeof payload.metadata === "object"
      ? readString(
          payload.metadata,
          "bucket",
          "bucketName",
          "storageBucket",
          "storage_bucket"
        ) ?? "conteudo_aluno"
      : "conteudo_aluno";

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
      setErro("Este arquivo não é markdown e deve ser aberto no visualizador de documentos.");
      return () => { ativo = false; };
    }

    setCarregando(true);
    setErro(null);
    resolveSupabaseStorageUrl(sourceUrl, { bucket: bucketHint })
      .then((resolvedUrl) => fetch(resolvedUrl))
      .then((r) => {
        if (!r.ok) throw new Error("Não foi possível carregar o conteúdo.");
        return r.text();
      })
      .then((text) => { if (ativo) setMarkdown(text); })
      .catch((e) => { if (ativo) setErro(e instanceof Error ? e.message : "Falha ao carregar."); })
      .finally(() => { if (ativo) setCarregando(false); });
    return () => { ativo = false; };
  }, [inlineMarkdown, sourceUrl, bucketHint]);

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
    // A biblioteca da `flex: 1` a toda celula. Numa tela de celular isso divide
    // a largura em partes iguais e some com a tabela: quatro colunas viram
    // quatro tiras de ~80px, cada palavra numa linha. Dentro da rolagem
    // horizontal nao ha largura a dividir, entao o piso e o teto e que mandam —
    // o piso impede coluna espremida, o teto impede que uma celula com frase
    // longa estique a tabela a ponto de ninguem achar o fim.
    th: {
      backgroundColor: palette.surface,
      color: palette.text,
      padding: 8,
      minWidth: 96,
      maxWidth: 260,
    },
    td: {
      color: palette.textMuted,
      padding: 8,
      borderTopWidth: 1,
      borderTopColor: palette.border,
      minWidth: 96,
      maxWidth: 260,
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
      <Markdown style={mdStyles} rules={markdownRules} markdownit={parserComDiagramas}>
        {currentPage}
      </Markdown>

      {totalPages > 1 && (
        <View style={[styles.pagination, { borderTopColor: palette.border }]}>
          <Pressable
            onPress={() => setPageIndex((i) => Math.max(0, i - 1))}
            disabled={pageIndex === 0}
            accessibilityRole="button"
            accessibilityState={{ disabled: pageIndex === 0 }}
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
            accessibilityRole="button"
            accessibilityState={{ disabled: pageIndex === totalPages - 1 }}
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
  // Largura total com altura reservada pela proporcao do viewBox: sem isso o
  // SVG entra com altura zero e o diagrama nao aparece.
  diagrama: {
    width: "100%",
    marginVertical: 12,
  },
  imagemEmoldurada: {
    marginVertical: 12,
    padding: 6,
    borderWidth: 1,
    borderRadius: 14,
  },
  blocoRolavel: {
    marginVertical: 8,
  },
  blocoRolavelConteudo: {
    flexGrow: 1,
  },
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
