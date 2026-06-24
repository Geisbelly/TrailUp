import { ContentDisplayMode } from "@/interfaces/componentes_simples/IContentBlock";
import { NativeDocxViewer } from "@/components/native/NativeDocxViewer";
import {
  isNativePdfViewerAvailable,
  NativePdfViewer,
} from "@/components/native/NativePdfViewer";
import { NativePptxViewer } from "@/components/native/NativePptxViewer";
import { useUsuario } from "@/context/SessaoContext";
import { Color, FontFamily } from "@/styles/GlobalStyle";
import {
  NativeDocBlock,
  NativePptxSlide,
  parseDocxBlocks,
  parsePptxSlides,
} from "@/utils/nativeDocumentParsers";
import { ensureCachedNativeContent } from "@/utils/nativeContentCache";
import { getProfileShellPalette } from "@/utils/profileShellTheme";
import { looksLikeStorageObjectPath, resolveSupabaseStorageUrl } from "@/utils/supabaseStorage";
import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { WebContentFrame } from "./WebContentFrame";

type Props = {
  tipo: "pdf" | "documento" | "apresentacao" | "embed";
  payload: any;
  WebView?: React.ComponentType<any> | null;
};

type ViewerSource = {
  html?: string | null;
  uri?: string | null;
  height: number;
  title: string;
};

type ViewerTheme = {
  accent: string;
  background: string;
  border: string;
  surface: string;
  surfaceElevated: string;
  text: string;
  textMuted: string;
  textSubtle: string;
};

const PDFJS_SCRIPT_URL =
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
const PDFJS_WORKER_URL =
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";

function readString(value: any, ...keys: string[]) {
  if (!value || typeof value !== "object") return null;

  for (const key of keys) {
    const current = value[key];
    if (typeof current === "string" && current.trim()) {
      return current.trim();
    }
  }

  return null;
}

function normalizeMode(value?: string | null): ContentDisplayMode {
  const normalized = String(value ?? "").toLowerCase();
  if (normalized.includes("rola") || normalized.includes("scroll")) {
    return "rolagem";
  }
  return "pagina";
}

function wrapEmbedHtml(html: string, backgroundColor: string) {
  if (/<html[\s>]/i.test(html)) {
    return html;
  }

  return `<!DOCTYPE html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta
      name="viewport"
      content="width=device-width, initial-scale=1, maximum-scale=1"
    />
    <style>
      html, body {
        margin: 0;
        padding: 0;
        width: 100%;
        height: 100%;
        background: ${backgroundColor};
      }

      body {
        overflow: auto;
      }

      iframe, embed, object, video {
        width: 100%;
        min-height: 100vh;
        border: 0;
      }
    </style>
  </head>
  <body>${html}</body>
</html>`;
}

function appendQuery(url: string, params: Record<string, string>) {
  const separator = url.includes("?") ? "&" : "?";
  const query = Object.entries(params)
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join("&");

  return `${url}${separator}${query}`;
}

function buildOfficeViewerUrl(url: string) {
  if (/view\.officeapps\.live\.com\/op\/embed\.aspx/i.test(url)) {
    return url;
  }
  return `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(url)}`;
}

function buildOfficeViewUrl(url: string) {
  if (/view\.officeapps\.live\.com\/op\/view\.aspx/i.test(url)) {
    return url;
  }
  return `https://view.officeapps.live.com/op/view.aspx?src=${encodeURIComponent(url)}`;
}

function buildGoogleViewerUrl(url: string) {
  if (/docs\.google\.com\/gview/i.test(url)) {
    return url;
  }
  return `https://docs.google.com/gview?embedded=1&url=${encodeURIComponent(url)}`;
}

function buildGoogleSlidesUrl(url: string, mode: ContentDisplayMode) {
  const cleaned = url.replace(/\/(edit|view|preview|pub|embed)(\?.*)?$/i, "");
  if (mode === "pagina") {
    return appendQuery(`${cleaned}/embed`, {
      start: "false",
      loop: "false",
      delayms: "3000",
      rm: "minimal",
    });
  }

  return appendQuery(`${cleaned}/preview`, { rm: "demo" });
}

function buildEmbeddedOfficeViewerUrl(
  url: string,
  mode: ContentDisplayMode,
  tipo: "documento" | "apresentacao",
  pageIndex = 1
) {
  if (tipo === "apresentacao" && /docs\.google\.com\/presentation/i.test(url)) {
    return buildGoogleSlidesUrl(url, mode);
  }

  if (mode === "pagina") {
    const officeUrl = appendQuery(buildOfficeViewerUrl(url), {
      wdPrint: "0",
    });

    if (tipo === "apresentacao") {
      return appendQuery(officeUrl, {
        wdSlideIndex: String(Math.max(1, Math.round(pageIndex))),
        wdAr: "1.7777777778",
      });
    }

    return appendQuery(buildOfficeViewUrl(url), {
      wdPrint: "0",
    });
  }

  return buildGoogleViewerUrl(url);
}

function buildPdfViewerHtml(
  url: string,
  mode: ContentDisplayMode,
  theme: ViewerTheme
) {
  return `<!DOCTYPE html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=5" />
    <script src="${PDFJS_SCRIPT_URL}"></script>
    <style>
      :root {
        color-scheme: dark;
      }

      * {
        box-sizing: border-box;
      }

      html, body {
        margin: 0;
        padding: 0;
        background: ${theme.background};
        color: ${theme.textMuted};
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      }

      body {
        padding: clamp(8px, 2.2vw, 16px);
        overflow-x: hidden;
      }

      .shell {
        display: flex;
        flex-direction: column;
        gap: 12px;
        min-height: 100%;
      }

      .status {
        font-size: 14px;
        color: ${theme.textMuted};
        min-height: 20px;
      }

      .status.error {
        color: #ff9d9d;
      }

      .toolbar {
        display: flex;
        align-items: center;
        justify-content: space-between;
        flex-wrap: wrap;
        gap: 12px;
        padding: 10px 12px;
        border-radius: 14px;
        border: 1px solid ${theme.border};
        background: ${theme.surfaceElevated};
        position: sticky;
        bottom: 0;
        z-index: 20;
        backdrop-filter: blur(6px);
      }

      .toolbar.hidden {
        display: none;
      }

      .toolbar button {
        border: 0;
        border-radius: 999px;
        min-height: 40px;
        padding: 10px 16px;
        background: ${theme.accent};
        color: #fff;
        font-weight: 700;
        cursor: pointer;
      }

      .toolbar button[disabled] {
        opacity: 0.45;
      }

      .counter {
        text-align: center;
        font-weight: 700;
      }

      .toolbar-group {
        display: flex;
        align-items: center;
        gap: 8px;
      }

      .jump-group {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-left: auto;
      }

      #goPage {
        background: ${theme.surface};
        color: ${theme.text};
        border: 1px solid ${theme.border};
      }

      .jump-label {
        font-size: 12px;
        color: ${theme.textSubtle};
      }

      .page-input {
        width: 74px;
        border-radius: 10px;
        border: 1px solid ${theme.border};
        background: ${theme.surface};
        color: ${theme.text};
        padding: 9px 10px;
        text-align: center;
        font-size: 14px;
      }

      .page-input:focus {
        outline: 1px solid ${theme.accent};
        border-color: ${theme.accent};
      }

      .viewer {
        display: flex;
        flex-direction: column;
        gap: 16px;
      }

      .viewer.page-mode {
        min-height: min(78vh, 860px);
      }

      .scroll-page {
        display: flex;
        flex-direction: column;
        gap: 10px;
        padding: 14px;
        border-radius: 16px;
        border: 1px solid ${theme.border};
        background: ${theme.surface};
      }

      .page-shell {
        display: flex;
        justify-content: center;
        padding: 8px;
        border-radius: 16px;
        border: 1px solid ${theme.border};
        background: ${theme.surface};
      }

      .page-label {
        font-size: 12px;
        letter-spacing: 0.04em;
        text-transform: uppercase;
        color: ${theme.textSubtle};
      }

      canvas {
        width: min(100%, 980px);
        height: auto;
        border-radius: 12px;
        background: #fff;
      }

      @media (max-width: 640px) {
        .toolbar {
          gap: 8px;
          padding: 8px 10px;
        }

        .toolbar-group,
        .jump-group {
          width: 100%;
          justify-content: space-between;
          margin-left: 0;
        }

        .toolbar button {
          min-height: 38px;
          padding: 8px 12px;
          font-size: 13px;
        }

        .counter {
          min-width: 120px;
          text-align: center;
          font-size: 13px;
        }

        .page-input {
          width: 64px;
          padding: 7px 8px;
        }
      }
    </style>
  </head>
  <body>
    <div class="shell">
      <div id="status" class="status">Carregando PDF...</div>
      <div id="viewer" class="viewer"></div>
      <div id="toolbar" class="toolbar ${mode === "rolagem" ? "hidden" : ""}">
        <div class="toolbar-group">
          <button id="prev">Anterior</button>
          <div id="counter" class="counter">Página 1 de 1</div>
          <button id="next">Próxima</button>
        </div>
        <div class="jump-group">
          <span class="jump-label">Ir para</span>
          <input
            id="pageInput"
            class="page-input"
            type="number"
            min="1"
            step="1"
            inputmode="numeric"
            value="1"
          />
          <button id="goPage">Abrir</button>
        </div>
      </div>
    </div>

    <script>
      const pdfUrl = ${JSON.stringify(url)};
      const viewMode = ${JSON.stringify(mode)};
      const statusEl = document.getElementById("status");
      const toolbarEl = document.getElementById("toolbar");
      const viewerEl = document.getElementById("viewer");
      const counterEl = document.getElementById("counter");
      const prevButton = document.getElementById("prev");
      const nextButton = document.getElementById("next");
      const pageInput = document.getElementById("pageInput");
      const goPageButton = document.getElementById("goPage");

      let pdfDoc = null;
      let currentPage = 1;
      let lastRenderId = 0;

      function setStatus(message, isError = false) {
        statusEl.textContent = message || "";
        statusEl.className = isError ? "status error" : "status";
      }

      function getScale(page) {
        const baseViewport = page.getViewport({ scale: 1 });
        const availableWidth = Math.max(260, (viewerEl.clientWidth || 820) - 24);
        const ratio = availableWidth / baseViewport.width;
        return Math.max(0.65, Math.min(ratio, 2.2));
      }

      function clampPage(pageNumber) {
        if (!pdfDoc) return 1;
        const numeric = Number(pageNumber);
        if (!Number.isFinite(numeric)) return currentPage;
        return Math.min(pdfDoc.numPages, Math.max(1, Math.round(numeric)));
      }

      function syncControls(pageNumber) {
        if (!pdfDoc) return;
        currentPage = clampPage(pageNumber);
        counterEl.textContent = "Página " + currentPage + " de " + pdfDoc.numPages;
        pageInput.value = String(currentPage);
        prevButton.disabled = currentPage <= 1;
        nextButton.disabled = currentPage >= pdfDoc.numPages;
      }

      async function renderCanvas(page) {
        const viewport = page.getViewport({ scale: getScale(page) });
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");
        if (!context) {
          throw new Error("Nao foi possivel inicializar o canvas para renderizar o PDF.");
        }
        const pixelRatio = Math.max(1, window.devicePixelRatio || 1);
        canvas.width = Math.floor(viewport.width * pixelRatio);
        canvas.height = Math.floor(viewport.height * pixelRatio);
        canvas.style.width = Math.floor(viewport.width) + "px";
        canvas.style.height = Math.floor(viewport.height) + "px";
        context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
        await page.render({ canvasContext: context, viewport }).promise;
        return canvas;
      }

      async function renderPage(pageNumber) {
        if (!pdfDoc) return;

        const targetPage = clampPage(pageNumber);
        const renderId = ++lastRenderId;
        setStatus("Renderizando página " + targetPage + "...");
        viewerEl.innerHTML = "";
        viewerEl.className = "viewer page-mode";

        const page = await pdfDoc.getPage(targetPage);
        if (renderId !== lastRenderId) return;

        const canvas = await renderCanvas(page);
        if (renderId !== lastRenderId) return;

        const shell = document.createElement("section");
        shell.className = "page-shell";
        shell.appendChild(canvas);
        viewerEl.appendChild(shell);
        syncControls(targetPage);
        setStatus("");
      }

      async function renderAllPages() {
        if (!pdfDoc) return;

        const renderId = ++lastRenderId;
        setStatus("Montando páginas...");
        viewerEl.innerHTML = "";
        viewerEl.className = "viewer scroll-mode";

        for (let pageNumber = 1; pageNumber <= pdfDoc.numPages; pageNumber += 1) {
          const page = await pdfDoc.getPage(pageNumber);
          if (renderId !== lastRenderId) return;

          const section = document.createElement("section");
          section.className = "scroll-page";

          const label = document.createElement("div");
          label.className = "page-label";
          label.textContent = "Página " + pageNumber;
          section.appendChild(label);

          const canvas = await renderCanvas(page);
          if (renderId !== lastRenderId) return;
          section.appendChild(canvas);

          viewerEl.appendChild(section);
        }

        setStatus("");
      }

      async function mount() {
        try {
          pdfjsLib.GlobalWorkerOptions.workerSrc = ${JSON.stringify(PDFJS_WORKER_URL)};
          pdfDoc = await pdfjsLib.getDocument({ url: pdfUrl, withCredentials: false }).promise;
          syncControls(1);

          if (viewMode === "pagina") {
            toolbarEl.classList.remove("hidden");
            await renderPage(currentPage);
          } else {
            toolbarEl.classList.add("hidden");
            await renderAllPages();
          }
        } catch (error) {
          console.error(error);
          setStatus("Não foi possível renderizar o PDF nesta tela.", true);
        }
      }

      prevButton.addEventListener("click", function () {
        if (!pdfDoc || currentPage <= 1) return;
        renderPage(currentPage - 1);
      });

      nextButton.addEventListener("click", function () {
        if (!pdfDoc || currentPage >= pdfDoc.numPages) return;
        renderPage(currentPage + 1);
      });

      goPageButton.addEventListener("click", function () {
        if (!pdfDoc) return;
        renderPage(pageInput.value);
      });

      pageInput.addEventListener("keydown", function (event) {
        if (event.key === "Enter") {
          event.preventDefault();
          renderPage(pageInput.value);
        }
      });

      pageInput.addEventListener("blur", function () {
        if (!pdfDoc) return;
        pageInput.value = String(clampPage(pageInput.value));
      });

      window.addEventListener("keydown", function (event) {
        if (viewMode !== "pagina" || !pdfDoc) return;
        if (event.key === "ArrowLeft") {
          event.preventDefault();
          if (currentPage > 1) renderPage(currentPage - 1);
        }
        if (event.key === "ArrowRight") {
          event.preventDefault();
          if (currentPage < pdfDoc.numPages) renderPage(currentPage + 1);
        }
      });

      let resizeTimer = null;
      window.addEventListener("resize", function () {
        if (!pdfDoc) return;
        window.clearTimeout(resizeTimer);
        resizeTimer = window.setTimeout(function () {
          if (viewMode === "pagina") {
            renderPage(currentPage);
          } else {
            renderAllPages();
          }
        }, 120);
      });

      mount();
    </script>
  </body>
</html>`;
}

function getFileExtension(reference?: string | null) {
  const normalized = String(reference ?? "")
    .trim()
    .split("?")[0]
    .split("#")[0];
  const match = normalized.match(/\.([a-z0-9]{2,8})$/i);
  return match?.[1]?.toLowerCase() ?? null;
}

function looksLikeFileSource(value?: string | null) {
  const normalized = String(value ?? "").trim();
  if (!normalized) return false;
  if (/^https?:\/\//i.test(normalized)) return true;
  if (looksLikeStorageObjectPath(normalized)) return true;
  return /\.[a-z0-9]{2,8}($|\?)/i.test(normalized);
}

function getViewerHeight(
  tipo: Props["tipo"],
  mode: ContentDisplayMode,
  fullscreen: boolean,
  windowHeight: number,
  windowWidth = 0
) {
  if (fullscreen) {
    return Math.max(560, windowHeight - 96);
  }

  if (tipo === "pdf") {
    const aspectBased =
      windowWidth > 0 ? Math.round(Math.max(360, (windowWidth - 24) * 1.38)) : 0;
    return mode === "pagina"
      ? Math.min(
          Math.max(520, Math.round(windowHeight * 0.78)),
          aspectBased > 0 ? aspectBased : Math.round(windowHeight * 0.82)
        )
      : Math.max(760, Math.round(windowHeight * 0.84));
  }

  if (tipo === "apresentacao") {
    return mode === "pagina"
      ? Math.max(620, Math.round(windowHeight * 0.68))
      : Math.max(760, Math.round(windowHeight * 0.84));
  }

  if (tipo === "documento") {
    return mode === "pagina"
      ? Math.max(640, Math.round(windowHeight * 0.7))
      : Math.max(760, Math.round(windowHeight * 0.84));
  }

  return Math.max(520, Math.round(windowHeight * 0.62));
}

function getDocumentIconName(tipo: Props["tipo"]) {
  if (tipo === "pdf") return "document-text-outline";
  if (tipo === "documento") return "reader-outline";
  if (tipo === "apresentacao") return "easel-outline";
  return "globe-outline";
}

export function DocumentBlock({ tipo, payload, WebView }: Props) {
  const { usuario } = useUsuario();
  const { height: windowHeight, width: windowWidth } = useWindowDimensions();
  const palette = useMemo(
    () => getProfileShellPalette(usuario?.perfis?.[0]?.nome ?? null),
    [usuario?.perfis]
  );
  const viewerTheme = useMemo<ViewerTheme>(
    () => ({
      accent: palette.accent,
      background: palette.background,
      border: palette.border,
      surface: palette.surface,
      surfaceElevated: palette.surfaceElevated,
      text: palette.text,
      textMuted: palette.textMuted,
      textSubtle: palette.textSubtle,
    }),
    [palette]
  );
  const metadataSourceUrl =
    typeof payload === "object" && payload?.metadata && typeof payload.metadata === "object"
      ? readString(
          payload.metadata,
          "arquivo_url",
          "storage_path",
          "path",
          "object_path",
          "storagePath",
          "objectPath",
          "url",
          "uri",
          "src"
        )
      : null;
  const payloadFileUrl =
    typeof payload === "string"
      ? payload.trim()
      : typeof payload === "object"
      ? readString(
          payload,
          "arquivo_url",
          "storage_path",
          "path",
          "object_path",
          "storagePath",
          "objectPath",
          "url",
          "uri",
          "src",
          "pdf_url",
          "documento_url",
          "apresentacao_url"
        ) ?? metadataSourceUrl
      : null;
  const payloadTextFallback =
    typeof payload === "object"
      ? readString(payload, "texto", "text", "conteudo")
      : null;
  const rawSourceUrl =
    payloadFileUrl ?? (looksLikeFileSource(payloadTextFallback) ? payloadTextFallback : null);
  const sourceUrl = looksLikeFileSource(rawSourceUrl) ? rawSourceUrl : null;
  const sourceHtml =
    typeof payload === "string" && !looksLikeFileSource(payload)
      ? payload
      : typeof payload === "object"
      ? readString(payload, "html")
      : null;
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
  const title =
    (typeof payload === "object" && readString(payload, "title")) ||
    (tipo === "pdf"
      ? "PDF"
      : tipo === "documento"
      ? "Documento"
      : tipo === "apresentacao"
      ? "Apresentação"
      : "Embed");

  const supportsModes = tipo === "pdf" || tipo === "documento" || tipo === "apresentacao";
  const initialMode =
    typeof payload === "object" && payload?.defaultDisplayMode
      ? normalizeMode(payload.defaultDisplayMode)
      : tipo === "embed"
      ? "rolagem"
      : "pagina";
  const isNativePdfReader = tipo === "pdf" && Platform.OS !== "web" && isNativePdfViewerAvailable();
  const isNativeLocalReader =
    Platform.OS !== "web" &&
    (isNativePdfReader || tipo === "documento" || tipo === "apresentacao");

  const [displayMode, setDisplayMode] = useState<ContentDisplayMode>(initialMode);
  const [fullscreenVisible, setFullscreenVisible] = useState(false);
  const [resolvedUrl, setResolvedUrl] = useState<string | null>(sourceUrl);
  const [resolvingUrl, setResolvingUrl] = useState(false);
  const [resolveError, setResolveError] = useState<string | null>(null);
  const [nativeLoading, setNativeLoading] = useState(false);
  const [nativeError, setNativeError] = useState<string | null>(null);
  const [localUri, setLocalUri] = useState<string | null>(null);
  const [docBlocks, setDocBlocks] = useState<NativeDocBlock[]>([]);
  const [pptxSlides, setPptxSlides] = useState<NativePptxSlide[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageInput, setPageInput] = useState("1");
  const [pageCount, setPageCount] = useState(1);
  const useWebFallback = isNativeLocalReader && Boolean(nativeError) && Boolean(resolvedUrl);
  const effectiveUseNative = isNativeLocalReader && !useWebFallback;

  useEffect(() => {
    setDisplayMode(initialMode);
  }, [initialMode, sourceUrl, sourceHtml, tipo]);

  useEffect(() => {
    setCurrentPage(1);
    setPageInput("1");
    setPageCount(1);
  }, [resolvedUrl, sourceUrl, tipo]);

  useEffect(() => {
    setPageInput(String(currentPage));
  }, [currentPage]);

  useEffect(() => {
    let ativo = true;

    if (!sourceUrl) {
      setResolvedUrl(null);
      setResolvingUrl(false);
      setResolveError(null);
      return () => {
        ativo = false;
      };
    }

    setResolvedUrl(sourceUrl);
    setResolvingUrl(true);
    setResolveError(null);

    resolveSupabaseStorageUrl(sourceUrl, { bucket: bucketHint })
      .then((url) => {
        if (!ativo) return;
        setResolvedUrl(url);
      })
      .catch((error) => {
        if (!ativo) return;
        setResolveError(
          error instanceof Error
            ? error.message
            : "Não foi possível preparar o arquivo do Supabase."
        );
        setResolvedUrl(sourceUrl);
      })
      .finally(() => {
        if (!ativo) return;
        setResolvingUrl(false);
      });

    return () => {
      ativo = false;
    };
  }, [bucketHint, sourceUrl]);

  useEffect(() => {
    let ativo = true;

    if (!isNativeLocalReader || !resolvedUrl) {
      setNativeLoading(false);
      setNativeError(null);
      setLocalUri(null);
      setDocBlocks([]);
      setPptxSlides([]);
      return () => {
        ativo = false;
      };
    }

    const cacheKey = sourceUrl?.trim() || resolvedUrl;
    const extensionHint =
      getFileExtension(sourceUrl) ??
      getFileExtension(resolvedUrl) ??
      (tipo === "apresentacao"
        ? "pptx"
        : tipo === "documento"
        ? "docx"
        : tipo === "pdf"
        ? "pdf"
        : null);

    setNativeLoading(true);
    setNativeError(null);
    setLocalUri(null);
    setDocBlocks([]);
    setPptxSlides([]);

    ensureCachedNativeContent(cacheKey, resolvedUrl, { extensionHint })
      .then(async (file) => {
        if (!ativo) return;

        setLocalUri(file.localUri);

        if (tipo === "documento") {
          if (file.extension !== "docx") {
            throw new Error("O leitor nativo desta versao suporta apenas arquivos DOCX.");
          }

          const blocks = await parseDocxBlocks(file.localUri);
          if (!ativo) return;
          setDocBlocks(blocks);
          return;
        }

        if (tipo === "apresentacao") {
          if (file.extension !== "pptx") {
            throw new Error("O leitor nativo desta versao suporta apenas arquivos PPTX.");
          }

          const slides = await parsePptxSlides(file.localUri);
          if (!ativo) return;
          setPptxSlides(slides);
          setPageCount(Math.max(1, slides.length));
        }
      })
      .catch((error) => {
        if (!ativo) return;
        setNativeError(
          error instanceof Error
            ? error.message
            : "Não foi possível montar a visualização nativa do arquivo."
        );
      })
      .finally(() => {
        if (!ativo) return;
        setNativeLoading(false);
      });

    return () => {
      ativo = false;
    };
  }, [isNativeLocalReader, resolvedUrl, sourceUrl, tipo]);

  const viewer = useMemo<ViewerSource | null>(() => {
    if (effectiveUseNative) {
      return null;
    }

    if (tipo === "pdf" && resolvedUrl) {
      return {
        title,
        html: buildPdfViewerHtml(resolvedUrl, displayMode, viewerTheme),
        height: getViewerHeight(tipo, displayMode, false, windowHeight, windowWidth),
      };
    }

    if ((tipo === "apresentacao" || tipo === "documento") && resolvedUrl) {
      return {
        title,
        uri: buildEmbeddedOfficeViewerUrl(resolvedUrl, displayMode, tipo, currentPage),
        height: getViewerHeight(tipo, displayMode, false, windowHeight, windowWidth),
      };
    }

    if (tipo === "embed" && (sourceHtml || resolvedUrl)) {
      return {
        title,
        html: sourceHtml ? wrapEmbedHtml(sourceHtml, viewerTheme.background) : null,
        uri: sourceHtml ? resolvedUrl : resolvedUrl,
        height: getViewerHeight(tipo, displayMode, false, windowHeight, windowWidth),
      };
    }

    return null;
  }, [
    currentPage,
    displayMode,
    effectiveUseNative,
    resolvedUrl,
    sourceHtml,
    tipo,
    title,
    windowHeight,
    windowWidth,
    viewerTheme,
  ]);

  const fullscreenViewer = useMemo<ViewerSource | null>(() => {
    if (!viewer) return null;

    return {
      ...viewer,
      height: getViewerHeight(tipo, displayMode, true, windowHeight, windowWidth),
    };
  }, [displayMode, tipo, viewer, windowHeight, windowWidth]);

  const frameKey = `${tipo}:${displayMode}:${resolvedUrl ?? "local"}:${
    viewer?.html ? "html" : "uri"
  }${Platform.OS === "web" ? `:${currentPage}` : ""}`;
  const fullscreenFrameKey = `fullscreen:${tipo}:${displayMode}:${resolvedUrl ?? "local"}:${
    fullscreenViewer?.html ? "html" : "uri"
  }${Platform.OS === "web" ? `:${currentPage}` : ""}`;
  const fileIcon = getDocumentIconName(tipo);
  const frameScrollEnabled = displayMode === "rolagem" || tipo === "embed";
  const pagerAtBottom = tipo === "pdf";

  const clampPage = (value: string | number) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return currentPage;
    return Math.min(Math.max(1, Math.round(numeric)), Math.max(1, pageCount));
  };

  const commitPage = (value: string | number) => {
    const nextPage = clampPage(value);
    setCurrentPage(nextPage);
    setPageInput(String(nextPage));
  };

  const renderModeButtons = (compact = false) => (
    <View style={[styles.modeGroup, compact && styles.modeGroupCompact]}>
      {(["pagina", "rolagem"] as ContentDisplayMode[]).map((mode) => {
        const ativo = mode === displayMode;
        return (
          <Pressable
            key={mode}
            style={[
              styles.modeButton,
              {
                borderColor: ativo ? palette.borderStrong : palette.border,
                backgroundColor: ativo ? palette.accentMuted : palette.surface,
              },
            ]}
            onPress={() => setDisplayMode(mode)}
            accessibilityRole="button"
            accessibilityLabel={mode === "pagina" ? "Modo página" : "Modo rolagem"}
          >
            <Ionicons
              name={mode === "pagina" ? "book-outline" : "reorder-three-outline"}
              size={15}
              color={ativo ? palette.accent : palette.textMuted}
            />
            <Text
              style={[
                styles.modeButtonText,
                { color: ativo ? palette.accent : palette.textMuted },
              ]}
            >
              {mode === "pagina" ? "Página" : "Rolagem"}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );

  const renderNativePager = (compact = false) => {
    if (!effectiveUseNative || displayMode !== "pagina" || pageCount <= 1) {
      return null;
    }

    const pageLabel = tipo === "apresentacao" ? "slide" : "pagina";
    const iconName =
      tipo === "apresentacao" ? "albums-outline" : "document-text-outline";

    return (
      <View style={[styles.pageControlBar, compact && styles.pageControlBarCompact]}>
        <Pressable
          style={[
            styles.pageIconButton,
            {
              borderColor: palette.border,
              backgroundColor: palette.surface,
            },
            currentPage <= 1 && styles.pageIconButtonDisabled,
          ]}
          onPress={() => commitPage(currentPage - 1)}
          disabled={currentPage <= 1}
          accessibilityRole="button"
          accessibilityLabel={`${pageLabel} anterior`}
        >
          <Ionicons name="chevron-back" size={18} color={palette.text} />
        </Pressable>

        <View
          style={[
            styles.pageInputShell,
            {
              borderColor: palette.border,
              backgroundColor: palette.surface,
            },
          ]}
        >
          <Ionicons name={iconName} size={15} color={palette.textSubtle} />
          <TextInput
            value={pageInput}
            onChangeText={setPageInput}
            onBlur={() => commitPage(pageInput)}
            onSubmitEditing={() => commitPage(pageInput)}
            keyboardType="number-pad"
            returnKeyType="done"
            style={[styles.pageInput, { color: palette.text }]}
            placeholder="1"
            placeholderTextColor={palette.textSubtle}
          />
          <Text style={[styles.pageInputLabel, { color: palette.textSubtle }]}>
            {pageLabel} / {pageCount}
          </Text>
        </View>

        <Pressable
          style={[
            styles.pageIconButton,
            {
              borderColor: palette.border,
              backgroundColor: palette.surface,
            },
            currentPage >= pageCount && styles.pageIconButtonDisabled,
          ]}
          onPress={() => commitPage(currentPage + 1)}
          disabled={currentPage >= pageCount}
          accessibilityRole="button"
          accessibilityLabel={`próxima ${pageLabel}`}
        >
          <Ionicons name="chevron-forward" size={18} color={palette.text} />
        </Pressable>
      </View>
    );
  };

  const renderActionButton = (
    iconName: React.ComponentProps<typeof Ionicons>["name"],
    label: string,
    onPress: () => void,
    accent = false
  ) => (
    <Pressable
      style={[
        styles.iconButton,
        {
          borderColor: accent ? palette.borderStrong : palette.border,
          backgroundColor: accent ? palette.accent : palette.surface,
        },
      ]}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Ionicons
        name={iconName}
        size={18}
        color={accent ? Color.colorWhite : palette.text}
      />
    </Pressable>
  );

  const renderNativeViewer = (fullscreen = false) => {
    if (!effectiveUseNative) return null;

    let height: number;
    if (fullscreen) {
      height = Math.max(560, windowHeight - 96);
    } else if (tipo === "apresentacao" && pptxSlides.length > 0) {
      // Compute height from the slide's natural aspect ratio so it fills the
      // available width without any A4-like empty frame around it.
      const slide = pptxSlides[0];
      const ar = Math.max(0.1, slide.width / slide.height);
      const availW = Math.max(240, windowWidth - 8); // almost full screen width
      const slideH = Math.ceil(availW / ar);
      height = displayMode === "pagina"
        ? slideH + 56  // 56 px reserved for navigation controls
        : Math.min(Math.max(windowHeight * 0.85, 320), slideH * 3 + 48);
    } else {
      height = getViewerHeight(tipo, displayMode, false, windowHeight, windowWidth);
    }

    if (resolvingUrl || nativeLoading) {
      return (
        <View
          style={[
            styles.loadingBox,
            {
              minHeight: height,
              borderColor: palette.border,
              backgroundColor: palette.surface,
            },
          ]}
        >
          <ActivityIndicator size="small" color={palette.accent} />
          <Text style={[styles.loadingText, { color: palette.textMuted }]}>
            Preparando arquivo no dispositivo...
          </Text>
        </View>
      );
    }

    if (nativeError) {
      return (
        <View
          style={[
            styles.emptyBox,
            {
              minHeight: height,
              borderColor: palette.border,
              backgroundColor: palette.surface,
            },
          ]}
        >
          <Text style={[styles.emptyText, { color: palette.textMuted }]}>{nativeError}</Text>
        </View>
      );
    }

    if (!localUri) {
      return (
        <View
          style={[
            styles.emptyBox,
            {
              minHeight: height,
              borderColor: palette.border,
              backgroundColor: palette.surface,
            },
          ]}
        >
          <Text style={[styles.emptyText, { color: palette.textMuted }]}>
            Não foi encontrado um arquivo local válido para este bloco.
          </Text>
        </View>
      );
    }

    if (tipo === "pdf") {
      return (
        <NativePdfViewer
          uri={localUri}
          height={height}
          displayMode={displayMode}
          currentPage={currentPage}
          onPageChange={setCurrentPage}
          onPageCountChange={setPageCount}
          palette={palette}
        />
      );
    }

    if (tipo === "documento") {
      return (
        <NativeDocxViewer
          blocks={docBlocks}
          displayMode={displayMode}
          currentPage={currentPage}
          height={height}
          onPageChange={setCurrentPage}
          onPageCountChange={setPageCount}
          palette={palette}
        />
      );
    }

    if (tipo === "apresentacao") {
      return (
        <NativePptxViewer
          slides={pptxSlides}
          displayMode={displayMode}
          currentPage={currentPage}
          height={height}
          onPageChange={setCurrentPage}
          onPageCountChange={setPageCount}
          palette={palette}
        />
      );
    }

    return null;
  };

  const readingSubtitle =
    tipo === "pdf"
      ? "Leitura do PDF"
      : tipo === "apresentacao"
      ? "Leitura da apresentação"
      : tipo === "documento"
      ? "Leitura do documento"
      : "Visualização do arquivo";

  if (!effectiveUseNative && resolvingUrl && !viewer) {
    return (
      <View
        style={[
          styles.loadingBox,
          { borderColor: palette.border, backgroundColor: palette.surface },
        ]}
      >
        <ActivityIndicator size="small" color={palette.accent} />
        <Text style={[styles.loadingText, { color: palette.textMuted }]}>Preparando arquivo...</Text>
      </View>
    );
  }

  if (!effectiveUseNative && !viewer) {
    return (
      <View
        style={[
          styles.emptyBox,
          { borderColor: palette.border, backgroundColor: palette.surface },
        ]}
      >
        <Text style={[styles.emptyText, { color: palette.textMuted }]}>
          Não foi encontrado um arquivo válido para este bloco.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.wrapper}>
      <View style={styles.toolbar}>
        <View style={styles.toolbarTop}>
          <View style={styles.titleGroup}>
            <View style={styles.titleRow}>
              <View
                style={[
                  styles.titleIconBadge,
                  {
                    backgroundColor: palette.accentMuted,
                    borderColor: palette.borderStrong,
                  },
                ]}
              >
                <Ionicons name={fileIcon} size={16} color={palette.accent} />
              </View>
              <Text numberOfLines={1} style={[styles.title, { color: palette.text }]}>
                {title}
              </Text>
            </View>
            <Text style={[styles.helperText, { color: palette.textSubtle }]}>
              {supportsModes
                ? displayMode === "pagina"
                  ? "Leitura paginada"
                  : "Leitura continua"
                : "Visualização incorporada"}
            </Text>
          </View>

          <View style={styles.toolbarActions}>
            {supportsModes ? (
              renderActionButton(
                "expand-outline",
                "Tela cheia",
                () => setFullscreenVisible(true),
                true
              )
            ) : null}

            {resolvedUrl ? (
              renderActionButton("open-outline", "Abrir arquivo", () =>
                Linking.openURL(resolvedUrl)
              )
            ) : null}
          </View>
        </View>

        {supportsModes ? renderModeButtons() : null}
        {!pagerAtBottom ? renderNativePager() : null}
      </View>

      {resolveError ? <Text style={styles.warningText}>{resolveError}</Text> : null}
      {useWebFallback && nativeError ? (
        <Text style={styles.warningText}>
          {nativeError} Exibindo no modo de compatibilidade.
        </Text>
      ) : null}

      <View
        style={[
          styles.viewerShell,
          { borderColor: palette.border, backgroundColor: palette.surface },
        ]}
      >
        {effectiveUseNative ? (
          renderNativeViewer()
        ) : (
          <WebContentFrame
            key={frameKey}
            title={viewer?.title}
            html={viewer?.html}
            uri={viewer?.uri}
            height={viewer?.height ?? getViewerHeight(tipo, displayMode, false, windowHeight, windowWidth)}
            scrollEnabled={frameScrollEnabled}
            palette={palette}
            WebView={WebView}
          />
        )}
      </View>
      {pagerAtBottom ? renderNativePager() : null}

      <Modal
        visible={fullscreenVisible}
        animationType="fade"
        presentationStyle="fullScreen"
        onRequestClose={() => setFullscreenVisible(false)}
      >
        <SafeAreaView
          style={[
            styles.fullscreenModal,
            { backgroundColor: palette.background },
          ]}
        >
          <View style={styles.fullscreenHeader}>
            <View style={styles.fullscreenTitleGroup}>
              <View style={styles.titleRow}>
                <View
                  style={[
                    styles.titleIconBadge,
                    {
                      backgroundColor: palette.accentMuted,
                      borderColor: palette.borderStrong,
                    },
                  ]}
                >
                  <Ionicons name={fileIcon} size={18} color={palette.accent} />
                </View>
                <Text numberOfLines={1} style={[styles.fullscreenTitle, { color: palette.text }]}>
                  {title}
                </Text>
              </View>
              <Text style={[styles.fullscreenSubtitle, { color: palette.textSubtle }]}>
                {readingSubtitle}
              </Text>
            </View>

            <View style={styles.toolbarActions}>
              {resolvedUrl ? (
                renderActionButton("open-outline", "Abrir arquivo", () =>
                  Linking.openURL(resolvedUrl)
                )
              ) : null}

              {renderActionButton("close-outline", "Fechar", () =>
                setFullscreenVisible(false)
              )}
            </View>
          </View>

          {supportsModes ? renderModeButtons(true) : null}
          {!pagerAtBottom ? renderNativePager(true) : null}

          <View style={styles.fullscreenViewerShell}>
            {effectiveUseNative ? (
              renderNativeViewer(true)
            ) : fullscreenViewer ? (
              <WebContentFrame
                key={fullscreenFrameKey}
                title={fullscreenViewer.title}
                html={fullscreenViewer.html}
                uri={fullscreenViewer.uri}
                height={fullscreenViewer.height}
                scrollEnabled={frameScrollEnabled}
                palette={palette}
                WebView={WebView}
              />
            ) : null}
          </View>
          {pagerAtBottom ? renderNativePager(true) : null}
        </SafeAreaView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginTop: 4,
    gap: 4,
  },
  toolbar: {
    gap: 6,
    paddingHorizontal: 2,
  },
  toolbarTop: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  titleGroup: {
    flex: 1,
    gap: 3,
    minWidth: 0,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    minWidth: 0,
  },
  titleIconBadge: {
    width: 28,
    height: 28,
    borderRadius: 999,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(242, 247, 250, 0.08)",
    borderWidth: 1,
    borderColor: "rgba(242, 247, 250, 0.12)",
  },
  title: {
    fontFamily: FontFamily.inikaBold,
    fontSize: 13,
    color: Color.colorAliceblue,
    flex: 1,
  },
  helperText: {
    fontFamily: FontFamily.interMedium,
    fontSize: 10,
    color: Color.colorSlategray,
  },
  toolbarActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 6,
  },
  modeGroup: {
    flexDirection: "row",
    gap: 6,
  },
  modeGroupCompact: {
    paddingTop: 2,
  },
  modeButton: {
    flex: 1,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Color.colorDarkslategray100,
    backgroundColor: "#151923",
    paddingVertical: 8,
    paddingHorizontal: 10,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
  },
  modeButtonActive: {
    borderColor: "rgba(242,247,250,0.16)",
    backgroundColor: "rgba(242,247,250,0.08)",
  },
  modeButtonText: {
    fontFamily: FontFamily.interMedium,
    fontSize: 11,
    color: Color.colorAliceblue300,
  },
  modeButtonTextActive: {
    color: Color.colorAliceblue,
  },
  iconButton: {
    width: 38,
    height: 38,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Color.colorDarkslategray100,
    backgroundColor: "#151923",
    alignItems: "center",
    justifyContent: "center",
  },
  iconButtonAccent: {
    borderColor: "rgba(242,247,250,0.16)",
    backgroundColor: "rgba(242,247,250,0.08)",
  },
  pageControlBar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  pageControlBarCompact: {
    paddingTop: 2,
  },
  pageIconButton: {
    width: 36,
    height: 36,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Color.colorDarkslategray100,
    backgroundColor: "#151923",
    alignItems: "center",
    justifyContent: "center",
  },
  pageIconButtonDisabled: {
    opacity: 0.45,
  },
  pageInputShell: {
    flex: 1,
    minWidth: 0,
    height: 36,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: Color.colorDarkslategray100,
    backgroundColor: "#151923",
    paddingHorizontal: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  pageInput: {
    flex: 1,
    minWidth: 48,
    paddingVertical: 0,
    color: Color.colorAliceblue,
    fontFamily: FontFamily.interMedium,
    fontSize: 12,
  },
  pageInputLabel: {
    fontFamily: FontFamily.interMedium,
    fontSize: 11,
    color: Color.colorSlategray,
  },
  loadingBox: {
    marginTop: 12,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Color.colorDarkslategray100,
    backgroundColor: "#151923",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
  },
  loadingText: {
    fontFamily: FontFamily.interMedium,
    color: Color.colorAliceblue300,
  },
  warningText: {
    fontFamily: FontFamily.interMedium,
    fontSize: 12,
    color: "#ffb3b3",
  },
  emptyBox: {
    marginTop: 12,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Color.colorDarkslategray100,
    backgroundColor: "#151923",
  },
  emptyText: {
    fontFamily: FontFamily.interMedium,
    color: Color.colorAliceblue300,
  },
  viewerShell: {
    borderRadius: 18,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: Color.colorDarkslategray100,
    backgroundColor: "#151923",
    padding: 2,
  },
  fullscreenModal: {
    flex: 1,
    backgroundColor: Color.background,
    paddingHorizontal: 12,
    paddingTop: 4,
    paddingBottom: 10,
    gap: 8,
  },
  fullscreenHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
  },
  fullscreenTitleGroup: {
    flex: 1,
    gap: 4,
    minWidth: 0,
  },
  fullscreenTitle: {
    fontFamily: FontFamily.inikaBold,
    fontSize: 16,
    color: Color.colorAliceblue,
    flex: 1,
  },
  fullscreenSubtitle: {
    fontFamily: FontFamily.interMedium,
    fontSize: 12,
    color: Color.colorSlategray,
  },
  fullscreenViewerShell: {
    flex: 1,
    borderRadius: 18,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: Color.colorDarkslategray100,
    backgroundColor: "#151923",
    padding: 2,
  },
});
