import VideoPlayer from "@/components/funcionais/VideoPlayer";
import { useTrilha } from "@/context/TrilhaContext";
import { Color, FontFamily } from "@/styles/GlobalStyle";
import { useLocalSearchParams } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import {
  Image,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LoadingState } from "@/components/LoadingState";
import CardSemDados from "@/components/CardSemDados";


/* ============================================================
   WEBVIEW (PDF e outras)
============================================================ */

function loadWebView() {
  if (Platform.OS === "web") return null;
  const RNWebView = require("react-native-webview");
  return RNWebView.default || RNWebView.WebView;
}

const WebView = loadWebView();

/* ============================================================
   HELPERS
============================================================ */

function parseNumericId(rawId: string | string[] | undefined): number | null {
  const value = Array.isArray(rawId) ? rawId[0] : rawId;
  if (!value) return null;

  const direct = Number(value);
  if (!Number.isNaN(direct)) return direct;

  const match = String(value).match(/(\d+)(?!.*\d)/);
  return match ? Number(match[1]) : null;
}

function isUrl(value: unknown): value is string {
  return typeof value === "string" && /^https?:\/\//i.test(value.trim());
}

function getYouTubeId(rawUrl: string): string | null {
  try {
    const url = rawUrl.split("#")[0];

    let match = url.match(/[?&]v=([^&]+)/);
    if (match && match[1]) return match[1];

    match = url.match(/youtu\.be\/([^?]+)/);
    if (match && match[1]) return match[1];

    match = url.match(/\/embed\/([^?]+)/);
    if (match && match[1]) return match[1];

    match = url.match(/\/v\/([^?]+)/);
    if (match && match[1]) return match[1];
  } catch {}
  return null;
}

/* ============================================================
   TELA PRINCIPAL
============================================================ */

export default function TrilhaConteudoScreen() {
  const params = useLocalSearchParams<{ id?: string | string[] }>();
  const { carregando, erro, grafo, classeAtual } = useTrilha();

  const rawId = Array.isArray(params.id) ? params.id[0] : params.id ?? "";

  const trilhaNode = useMemo(
    () => grafo.nodes.find((node) => String(node.id) === String(rawId)) ?? null,
    [grafo.nodes, rawId]
  );

  const topicoId = useMemo(() => parseNumericId(rawId), [rawId]);

  const topico = useMemo(
    () =>
      topicoId != null && classeAtual
        ? classeAtual.topicos.find((t) => t.id === topicoId) ?? null
        : null,
    [classeAtual, topicoId]
  );

  const [conteudoIndex, setConteudoIndex] = useState(0);

  useEffect(() => {
    setConteudoIndex(0);
  }, [topicoId]);

  if (carregando && !trilhaNode) {
    return (
      <SafeAreaView style={styles.screen}>
        <LoadingState title="Carregando trilha" message="Organizando conteúdos..." />
      </SafeAreaView>
    );
  }

  if (erro) {
    return (
      <SafeAreaView style={styles.screen}>
        <View style={styles.center}>
          <Text style={styles.errorTitle}>Erro ao carregar trilha</Text>
          <Text style={styles.helperText}>{erro.message}</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!trilhaNode || !topico) {
    return (
      <SafeAreaView style={styles.screen}>
        <CardSemDados
          title="Trilha não encontrada"
          description="Não foi possível localizar os conteúdos desta trilha."
        />
      </SafeAreaView>
    );
  }

  const conteudos = topico.conteudos ?? [];
  const total = conteudos.length;
  const atual =
    total > 0 ? conteudos[Math.min(conteudoIndex, total - 1)] : null;

  const canContinue = total > 0 && conteudoIndex < total - 1;
  const canBack = total > 0 && conteudoIndex > 0;

  const progresso = total > 0 ? (conteudoIndex + 1) / total : 0;

  /* ============================================================
      RENDER
  ============================================================ */

  return (
    <View style={styles.screen}>
      <ScrollView showsVerticalScrollIndicator={false}>
        {/* HEADER */}
        <View style={styles.header}>

          {/* PROGRESSO + % */}
          {total > 0 && (
            <View style={{ marginTop: 6 }}>
              <View style={styles.progressHeaderRow}>
                <Text style={styles.progressLabel}>Progresso</Text>
                <Text style={styles.progressPercent}>
                  {Math.round(progresso * 100)}%
                </Text>
              </View>

              <View style={styles.progressBarContainer}>
                <View
                  style={[
                    styles.progressBarFill,
                    { width: `${progresso * 100}%` },
                  ]}
                />
              </View>
            </View>
          )}
        </View>

        {/* CONTEÚDO */}
        {total === 0 || !atual ? (
          <View style={styles.emptyBox}>
            <Text style={styles.emptyTitle}>Sem conteúdos</Text>
            <Text style={styles.helperText}>
              Esta trilha ainda não possui conteúdos cadastrados.
            </Text>
          </View>
        ) : (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>{atual.titulo}</Text>
            {atual.tipo ? (
              <Text style={styles.cardType}>{atual.tipo}</Text>
            ) : null}

            {(() => {
              const tipo = (atual.tipo || "").toLowerCase();
              const midias: any[] = (atual as any).midias ?? [];
              const conteudoTexto = (atual.conteudo ?? "") as string;
              const textoEhUrl = isUrl(conteudoTexto);

              let mediaPrincipal: any = null;

              if (midias.length) {
                mediaPrincipal =
                  midias.find(
                    (m) => (m.tipo || "").toLowerCase() === tipo
                  ) ?? midias[0];
              } else if (
                textoEhUrl &&
                ["imagem", "video", "vídeo", "pdf"].includes(tipo)
              ) {
                mediaPrincipal = {
                  id: "conteudo-url",
                  tipo,
                  url: conteudoTexto,
                };
              }

              const blocks: React.ReactNode[] = [];

              // TEXTO
              if (tipo === "texto" || !tipo) {
                if (conteudoTexto && !textoEhUrl) {
                  blocks.push(
                    <Text key="texto" style={styles.cardBody}>
                      {conteudoTexto}
                    </Text>
                  );
                }
              }

              // IMAGEM
              else if (tipo === "imagem" && mediaPrincipal?.url) {
                blocks.push(
                  <Image
                    key="imagem"
                    source={{ uri: mediaPrincipal.url }}
                    style={styles.image}
                    resizeMode="contain"
                  />
                );

                if (!textoEhUrl && conteudoTexto) {
                  blocks.push(
                    <Text key="legenda" style={styles.cardBody}>
                      {conteudoTexto}
                    </Text>
                  );
                }
              }

              // VÍDEO / YOUTUBE
              else if (
                (tipo === "video" || tipo === "vídeo") &&
                mediaPrincipal?.url
              ) {
                blocks.push(
                  <VideoPlayer key="video" url={mediaPrincipal.url} />
                );

                if (!textoEhUrl && conteudoTexto) {
                  blocks.push(
                    <Text key="video-texto" style={styles.cardBody}>
                      {conteudoTexto}
                    </Text>
                  );
                }
              }

              // PDF
              else if (tipo === "pdf" && mediaPrincipal?.url) {
                const url = mediaPrincipal.url;

                if (Platform.OS === "web") {
                  blocks.push(
                    <iframe
                      key="pdf-web"
                      src={url}
                      style={{
                        width: "100%",
                        height: 360,
                        border: "none",
                        borderRadius: 12,
                        marginTop: 12,
                      }}
                    />
                  );
                } else {
                  blocks.push(
                    <View key="pdf" style={styles.pdfBox}>
                      {WebView && (
                        <WebView
                          originWhitelist={["*"]}
                          source={{ uri: url }}
                          style={styles.pdfWebview}
                        />
                      )}
                    </View>
                  );
                }
              }

              return <>{blocks}</>;
            })()}
          </View>
        )}
      </ScrollView>

      {/* NAVEGAÇÃO */}
      {total > 0 && (
        <View style={styles.footer}>
          <View style={styles.footerRow}>
            <Pressable
              style={[styles.secondaryButton, !canBack && styles.buttonDisabled]}
              disabled={!canBack}
              onPress={() =>
                setConteudoIndex((prev) => (prev > 0 ? prev - 1 : prev))
              }
            >
              <Text style={styles.secondaryButtonText}>Voltar</Text>
            </Pressable>

            <Pressable
              style={[styles.button, !canContinue && styles.buttonDisabled]}
              disabled={!canContinue}
              onPress={() =>
                setConteudoIndex((prev) =>
                  prev < total - 1 ? prev + 1 : prev
                )
              }
            >
              <Text style={styles.buttonText}>
                {canContinue ? "Continuar" : "Fim dos conteúdos"}
              </Text>
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}

/* ============================================================
   STYLES
============================================================ */

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: Color.background,
  },

  /* HEADER */
  header: {
    paddingHorizontal: 16,
    paddingTop: 4,
    paddingBottom: 4,
  },

  progressHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 4,
    marginBottom: 4,
  },
  progressLabel: {
    fontFamily: FontFamily.interMedium,
    fontSize: 13,
    color: Color.colorAliceblue300,
  },
  progressPercent: {
    fontFamily: FontFamily.poppinsExtraBold,
    fontSize: 13,
    color: Color.colorAliceblue,
  },

  progressBarContainer: {
    width: "100%",
    height: 12,
    backgroundColor: Color.colorDarkslategray100,
    borderRadius: 999,
    overflow: "hidden",
  },
  progressBarFill: {
    height: "100%",
    backgroundColor: Color.colorAliceblue100,
  },

  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  helperText: {
    fontFamily: FontFamily.interMedium,
    fontSize: 14,
    color: Color.colorSlategray,
    textAlign: "center",
  },
  errorTitle: {
    fontFamily: FontFamily.inikaBold,
    fontSize: 18,
    color: "salmon",
    marginBottom: 6,
  },

  card: {
    marginHorizontal: 16,
    marginTop: 12,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Color.colorDarkslategray100,
    backgroundColor: Color.background,
  },
  cardTitle: {
    fontFamily: FontFamily.inikaBold,
    fontSize: 16,
    color: Color.colorAliceblue,
    marginBottom: 4,
  },
  cardType: {
    fontFamily: FontFamily.interMedium,
    fontSize: 12,
    color: Color.colorSlategray,
    marginBottom: 8,
  },
  cardBody: {
    marginTop: 8,
    fontFamily: FontFamily.interMedium,
    fontSize: 14,
    color: Color.colorAliceblue300,
  },

  image: {
    marginTop: 12,
    width: "100%",
    height: 220,
    borderRadius: 12,
    backgroundColor: Color.colorDarkslategray200,
  },

  pdfBox: {
    marginTop: 12,
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: Color.colorDarkslategray100,
  },
  pdfWebview: {
    width: "100%",
    height: 360,
  },

  emptyBox: {
    marginHorizontal: 16,
    marginTop: 16,
    padding: 16,
    borderRadius: 12,
    backgroundColor: Color.colorDarkslategray200,
    borderWidth: 1,
    borderColor: Color.colorDarkslategray100,
  },
  emptyTitle: {
    fontFamily: FontFamily.inikaBold,
    fontSize: 16,
    color: Color.colorAliceblue,
    marginBottom: 4,
  },

  /* FOOTER */
  footer: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: Color.background,
    borderTopWidth: 1,
    borderTopColor: Color.colorDarkslategray100,
  },
  footerRow: {
    flexDirection: "row",
    gap: 12,
  },
  button: {
    flex: 1,
    paddingVertical: 12,
    backgroundColor: Color.colorBlueviolet100,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  secondaryButton: {
    flex: 1,
    paddingVertical: 12,
    backgroundColor: Color.colorDarkslategray200,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    fontFamily: FontFamily.inikaBold,
    fontSize: 15,
    color: Color.colorWhite,
  },
  secondaryButtonText: {
    fontFamily: FontFamily.inikaBold,
    fontSize: 15,
    color: Color.colorAliceblue,
  },
});
