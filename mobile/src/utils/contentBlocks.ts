import {
  ContentBlock,
  ContentBlockPayload,
  ContentBlockType,
  ContentDisplayMode,
} from "@/interfaces/componentes_simples/IContentBlock";
import {
  buildSupabasePublicStorageUrl,
  looksLikeStorageObjectPath,
} from "./supabaseStorage";

type LooseRecord = Record<string, any>;

function normalizeDisplayText(raw?: string | null) {
  return String(raw ?? "").trim();
}

function normalizeComparisonText(raw?: string | null) {
  return normalizeDisplayText(raw)
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
}

function asObject(value: unknown): LooseRecord | null {
  if (!value) return null;

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed || (!trimmed.startsWith("{") && !trimmed.startsWith("["))) {
      return null;
    }

    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as LooseRecord;
      }
    } catch {}

    return null;
  }

  if (typeof value === "object" && !Array.isArray(value)) {
    return value as LooseRecord;
  }

  return null;
}

function pickFirstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }

  return null;
}

function normalizeDisplayMode(value?: string | null): ContentDisplayMode | undefined {
  const normalized = normalizeComparisonText(value);
  if (!normalized) return undefined;

  if (
    normalized.includes("pagina") ||
    normalized.includes("page") ||
    normalized.includes("slide")
  ) {
    return "pagina";
  }

  if (
    normalized.includes("rola") ||
    normalized.includes("scroll") ||
    normalized.includes("continuous")
  ) {
    return "rolagem";
  }

  return undefined;
}

function getMetadataSource(metadata: LooseRecord | null) {
  const viewer = asObject(metadata?.viewer);
  const embed = asObject(metadata?.embed);

  return {
    tipo: pickFirstString(
      metadata?.tipo,
      metadata?.formato,
      metadata?.format,
      metadata?.mimeType,
      metadata?.mime,
      metadata?.viewerType,
      viewer?.tipo,
      viewer?.type
    ),
    url: pickFirstString(
      metadata?.url,
      metadata?.uri,
      metadata?.src,
      metadata?.link,
      metadata?.arquivoUrl,
      metadata?.fileUrl,
      metadata?.documentUrl,
      metadata?.embedUrl,
      metadata?.viewerUrl,
      viewer?.url,
      viewer?.src,
      embed?.url,
      embed?.src
    ),
    html: pickFirstString(
      metadata?.html,
      metadata?.embedHtml,
      metadata?.iframe,
      metadata?.iframeHtml,
      viewer?.html,
      embed?.html
    ),
    markdown: pickFirstString(
      metadata?.markdown,
      metadata?.md,
      viewer?.markdown
    ),
    defaultDisplayMode: normalizeDisplayMode(
      pickFirstString(
        metadata?.defaultDisplayMode,
        metadata?.viewerMode,
        metadata?.modoVisualizacao,
        metadata?.modoLeitura,
        viewer?.defaultDisplayMode,
        viewer?.mode
      )
    ),
  };
}

export function isUrl(value: unknown): value is string {
  return typeof value === "string" && /^https?:\/\//i.test(value.trim());
}

function looksLikeFileReference(value: unknown) {
  if (typeof value !== "string") return false;

  const trimmed = value.trim();
  if (!trimmed || trimmed.includes("\n")) return false;
  if (trimmed.startsWith("{") || trimmed.startsWith("<")) return false;

  return (
    looksLikeStorageObjectPath(trimmed) ||
    /(^|[\\/]).+\.[a-z0-9]{2,5}($|\?)/i.test(trimmed)
  );
}

export function isEmbedHtml(value: unknown) {
  if (typeof value !== "string") return false;
  const trimmed = value.trim();
  return /<(iframe|embed|object|video|audio|script)\b/i.test(trimmed);
}

export function looksLikeMarkdown(value: unknown) {
  if (typeof value !== "string") return false;

  const text = value.trim();
  if (!text) return false;

  const signals = [
    /^#{1,6}\s+/m.test(text),
    /^\s*[-*+]\s+/m.test(text),
    /^\s*\d+\.\s+/m.test(text),
    /```/m.test(text),
    /\[[^\]]+\]\([^)]+\)/m.test(text),
    /^>\s+/m.test(text),
    /^\|.+\|$/m.test(text),
  ].filter(Boolean).length;

  return signals >= 2 || /^#{1,6}\s+/m.test(text) || /```/m.test(text);
}

function cleanUrl(url: string) {
  return url.split("?")[0].split("#")[0].toLowerCase();
}

export function isPdfUrl(url: string) {
  return /\.pdf$/i.test(cleanUrl(url)) || normalizeComparisonText(url).includes("application/pdf");
}

export function isDocumentUrl(url: string) {
  const normalized = cleanUrl(url);
  return (
    /\.(doc|docx|odt|rtf|xls|xlsx|csv)$/i.test(normalized) ||
    normalized.includes("docs.google.com/document") ||
    normalized.includes("application/msword") ||
    normalized.includes("wordprocessingml.document") ||
    normalized.includes("spreadsheetml.sheet")
  );
}

export function isPresentationUrl(url: string) {
  const normalized = cleanUrl(url);
  return (
    /\.(ppt|pptx|pps|ppsx|odp|key)$/i.test(normalized) ||
    normalized.includes("docs.google.com/presentation") ||
    normalized.includes("view.officeapps.live.com/op/embed.aspx") ||
    normalized.includes("powerpoint.live.com") ||
    normalized.includes("slides.com")
  );
}

export function isImageUrl(url: string) {
  return /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(cleanUrl(url));
}

export function isAudioUrl(url: string) {
  const normalized = cleanUrl(url);
  return (
    /\.(mp3|wav|ogg|m4a|aac|flac|opus|oga)$/i.test(normalized) ||
    normalized.includes("audio/") ||
    normalized.includes("spotify.com") ||
    normalized.includes("soundcloud.com")
  );
}

export function isVideoUrl(url: string) {
  const normalized = cleanUrl(url);
  return (
    /\.(mp4|webm|mov|m4v|avi|m3u8)$/i.test(normalized) ||
    normalized.includes("youtube.com") ||
    normalized.includes("youtu.be") ||
    normalized.includes("vimeo.com")
  );
}

export function isMarkdownUrl(url: string) {
  return /\.(md|markdown)$/i.test(cleanUrl(url)) || cleanUrl(url).includes("/raw/");
}

export function looksLikeEmbedUrl(url: string) {
  const normalized = normalizeComparisonText(url);
  return (
    normalized.includes("/embed/") ||
    normalized.includes("embedded=") ||
    normalized.includes("embed=true") ||
    normalized.includes("miro.com") ||
    normalized.includes("figma.com") ||
    normalized.includes("canva.com") ||
    normalized.includes("docs.google.com")
  );
}

export function inferBlockType(input: {
  declaredType?: string | null;
  url?: string | null;
  text?: string | null;
  html?: string | null;
  mimeType?: string | null;
}): ContentBlockType {
  const declared = normalizeComparisonText(input.declaredType ?? input.mimeType);

  if (
    declared.includes("markdown") ||
    declared === "md" ||
    declared.includes("text/markdown")
  ) {
    return "markdown";
  }

  if (
    declared.includes("card") ||
    declared.includes("flashcard")
  ) {
    return "cards";
  }

  if (
    declared.includes("apresenta") ||
    declared.includes("slide") ||
    declared.includes("ppt")
  ) {
    return "apresentacao";
  }

  if (
    declared.includes("documento") ||
    declared.includes("document") ||
    declared.includes("docs") ||
    declared.includes("word") ||
    declared.includes("docx") ||
    declared.includes("doc") ||
    declared.includes("msword") ||
    declared.includes("wordprocessingml") ||
    declared.includes("spreadsheet")
  ) {
    return "documento";
  }

  if (declared.includes("pdf")) return "pdf";
  if (declared.includes("youtube")) return "video";
  if (
    declared.includes("audio") ||
    declared.includes("mp3") ||
    declared.includes("wav") ||
    declared.includes("m4a") ||
    declared.includes("aac") ||
    declared.includes("ogg") ||
    declared.includes("flac") ||
    declared.includes("opus")
  ) {
    return "audio";
  }
  if (declared.includes("video") || declared.includes("mp4")) return "video";
  if (declared.includes("image") || declared.includes("imagem")) return "imagem";
  if (
    declared.includes("embed") ||
    declared.includes("iframe") ||
    declared.includes("html")
  ) {
    return "embed";
  }

  if (input.html || isEmbedHtml(input.text)) {
    return "embed";
  }

  if (input.url) {
    if (isPdfUrl(input.url)) return "pdf";
    if (isDocumentUrl(input.url)) return "documento";
    if (isPresentationUrl(input.url)) return "apresentacao";
    if (isAudioUrl(input.url)) return "audio";
    if (isVideoUrl(input.url)) return "video";
    if (isImageUrl(input.url)) return "imagem";
    if (isMarkdownUrl(input.url)) return "markdown";
    if (looksLikeEmbedUrl(input.url)) return "embed";
  }

  if (input.text && isUrl(input.text)) {
    return inferBlockType({
      declaredType: input.declaredType,
      url: input.text,
      mimeType: input.mimeType,
    });
  }

  if (input.text && looksLikeFileReference(input.text)) {
    return inferBlockType({
      declaredType: input.declaredType,
      url: input.text,
      mimeType: input.mimeType,
    });
  }

  if (declared.includes("texto") || declared.includes("text/plain")) {
    return "texto";
  }

  if (looksLikeMarkdown(input.text)) return "markdown";

  return "texto";
}

function buildPayloadByType(params: {
  type: ContentBlockType;
  text?: string | null;
  markdown?: string | null;
  html?: string | null;
  url?: string | null;
  legenda?: string | null;
  mimeType?: string | null;
  metadata?: LooseRecord | null;
  title?: string | null;
  defaultDisplayMode?: ContentDisplayMode;
}): ContentBlockPayload {
  if (params.type === "texto") {
    return params.text ?? "";
  }

  if (params.type === "markdown") {
    return {
      markdown: params.markdown ?? params.text ?? null,
      url: params.url ?? null,
      title: params.title ?? null,
      defaultDisplayMode: params.defaultDisplayMode,
      metadata: params.metadata ?? undefined,
    };
  }

  return {
    url: params.url ?? null,
    html: params.html ?? null,
    texto: params.text ?? null,
    legenda: params.legenda ?? null,
    mimeType: params.mimeType ?? null,
    title: params.title ?? null,
    defaultDisplayMode: params.defaultDisplayMode,
    metadata: params.metadata ?? undefined,
  };
}

export function normalizeContentBlock(
  raw: any,
  fallbackId: string | number
): ContentBlock | null {
  if (raw == null) return null;

  if (typeof raw === "string") {
    const type = inferBlockType({ text: raw });
    const fileReference = looksLikeFileReference(raw) ? raw : null;
    return {
      id: fallbackId,
      tipo: type,
      payload: buildPayloadByType({
        type,
        text: type === "texto" ? raw : null,
        markdown: type === "markdown" ? raw : null,
        html: type === "embed" && isEmbedHtml(raw) ? raw : null,
        url: isUrl(raw) || fileReference ? raw : null,
      }),
    };
  }

  const metadata = asObject(raw.metadata);
  const metadataSource = getMetadataSource(metadata);
  const payloadObject = asObject(raw.payload);
  const payloadMetadata = asObject(payloadObject?.metadata);
  const mergedMetadata = {
    ...(metadata ?? {}),
    ...(payloadMetadata ?? {}),
  };

  const sourceUrl = pickFirstString(
    raw.url,
    raw.uri,
    raw.src,
    payloadObject?.url,
    payloadObject?.uri,
    payloadObject?.src,
    metadataSource.url
  );
  const bucketHint = pickFirstString(
    raw.bucket,
    payloadObject?.bucket,
    mergedMetadata?.bucket,
    mergedMetadata?.bucketName,
    mergedMetadata?.storageBucket,
    mergedMetadata?.storage_bucket
  );
  const resolvedSourceUrl = sourceUrl
    ? buildSupabasePublicStorageUrl(sourceUrl, { bucket: bucketHint ?? undefined })
    : null;
  const sourceHtml = pickFirstString(
    raw.html,
    raw.embedHtml,
    raw.iframe,
    payloadObject?.html,
    payloadObject?.embedHtml,
    metadataSource.html
  );
  const sourceMarkdown = pickFirstString(
    raw.markdown,
    payloadObject?.markdown,
    metadataSource.markdown
  );
  const sourceText = pickFirstString(
    typeof raw.payload === "string" ? raw.payload : null,
    raw.texto,
    raw.text,
    raw.conteudo,
    payloadObject?.texto,
    payloadObject?.text,
    payloadObject?.conteudo,
    sourceMarkdown
  );
  const mimeType = pickFirstString(
    raw.mimeType,
    payloadObject?.mimeType,
    metadata?.mimeType,
    metadata?.mime
  );
  const title = pickFirstString(
    raw.title,
    raw.titulo,
    payloadObject?.title,
    payloadObject?.titulo
  );
  const legenda = pickFirstString(raw.legenda, payloadObject?.legenda);
  const declaredType = pickFirstString(
    raw.tipo,
    payloadObject?.tipo,
    metadataSource.tipo
  );
  const defaultDisplayMode =
    normalizeDisplayMode(
      pickFirstString(raw.defaultDisplayMode, payloadObject?.defaultDisplayMode)
    ) ?? metadataSource.defaultDisplayMode;

  const type = inferBlockType({
    declaredType,
    url:
      resolvedSourceUrl ??
      (sourceText && looksLikeFileReference(sourceText)
        ? buildSupabasePublicStorageUrl(sourceText, { bucket: bucketHint ?? undefined })
        : null),
    text: sourceMarkdown ?? sourceText,
    html: sourceHtml,
    mimeType,
  });

  // Tipos estruturados carregam dados em payloadObject (não em campos de texto/URL).
  // Exemplos: blocos de cards com payload.cards[]. Preservar sem modificar o payload.
  const STRUCTURED_BLOCK_TYPES = ["cards"] as const;
  if (
    (STRUCTURED_BLOCK_TYPES as readonly string[]).includes(type) &&
    payloadObject != null
  ) {
    return {
      id: raw.id ?? fallbackId,
      tipo: type,
      payload: {
        ...payloadObject,
        ...(Object.keys(mergedMetadata).length ? { metadata: mergedMetadata } : {}),
      },
    };
  }

  if (
    !sourceUrl &&
    !sourceHtml &&
    !sourceText &&
    !sourceMarkdown &&
    !legenda &&
    type !== "texto"
  ) {
    return null;
  }

  return {
    id: raw.id ?? fallbackId,
    tipo: type,
    payload: buildPayloadByType({
      type,
      text: sourceText,
      markdown: sourceMarkdown,
      html: sourceHtml ?? (type === "embed" && isEmbedHtml(sourceText) ? sourceText : null),
      url:
        resolvedSourceUrl ??
        (sourceText && (isUrl(sourceText) || looksLikeFileReference(sourceText))
          ? buildSupabasePublicStorageUrl(sourceText, { bucket: bucketHint ?? undefined })
          : null),
      legenda,
      mimeType,
      metadata: Object.keys(mergedMetadata).length ? mergedMetadata : metadata ?? null,
      title,
      defaultDisplayMode,
    }),
  };
}

function buildBlocksFromArray(rawBlocks: any[]) {
  return rawBlocks
    .map((block, index) => normalizeContentBlock(block, `block-${index}`))
    .filter((block): block is ContentBlock => !!block);
}

function buildSignature(block: ContentBlock) {
  if (typeof block.payload === "string") {
    return `${block.tipo}:${block.payload.trim()}`;
  }

  return `${block.tipo}:${String(
    block.payload.url ??
      block.payload.html ??
      block.payload.markdown ??
      block.payload.texto ??
      block.payload.legenda ??
      block.id
  ).trim()}`;
}

export function buildContentBlocks(conteudo: any): ContentBlock[] {
  if (!conteudo) return [];

  if (Array.isArray(conteudo)) {
    return buildBlocksFromArray(conteudo);
  }

  if (Array.isArray((conteudo as any)?.blocks)) {
    return buildBlocksFromArray((conteudo as any).blocks);
  }

  const metadata = asObject((conteudo as any)?.metadata);
  if (Array.isArray(metadata?.blocks) && metadata.blocks.length) {
    return buildBlocksFromArray(metadata.blocks);
  }

  const blocks: ContentBlock[] = [];
  const seen = new Set<string>();

  const pushUnique = (block: ContentBlock | null) => {
    if (!block) return;
    const signature = buildSignature(block);
    if (seen.has(signature)) return;
    seen.add(signature);
    blocks.push(block);
  };

  pushUnique(
    normalizeContentBlock(
      {
        id: conteudo.id ? `c-${conteudo.id}` : "conteudo",
        tipo: conteudo.tipo,
        conteudo: conteudo.conteudo,
        metadata: conteudo.metadata,
        titulo: conteudo.titulo,
      },
      `c-${conteudo.id ?? "conteudo"}`
    )
  );

  const midias = Array.isArray(conteudo.midias) ? [...conteudo.midias] : [];
  midias.sort((a, b) => (a?.ordem ?? 0) - (b?.ordem ?? 0));

  for (const midia of midias) {
    if (!midia?.url && !midia?.html) continue;

    pushUnique(
      normalizeContentBlock(
        {
          ...midia,
          metadata: {
            ...(metadata ?? {}),
            ...(asObject(midia?.metadata) ?? {}),
          },
        },
        `m-${midia.id ?? midia.url ?? blocks.length}`
      )
    );

    if (midia.legenda) {
      pushUnique(
        normalizeContentBlock(
          { payload: midia.legenda },
          `m-leg-${midia.id ?? midia.url ?? blocks.length}`
        )
      );
    }
  }

  return blocks;
}
