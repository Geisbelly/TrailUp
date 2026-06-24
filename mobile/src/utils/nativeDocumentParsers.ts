import * as FileSystem from "expo-file-system/legacy";
import { XMLParser } from "fast-xml-parser";
import JSZip from "jszip";
import mammoth from "mammoth";
import {
  HTMLElement,
  Node as HtmlNode,
  TextNode,
  parse as parseHtml,
} from "node-html-parser";

export type NativeDocBlock =
  | {
      type: "heading";
      level: number;
      text: string;
    }
  | {
      type: "paragraph" | "quote";
      text: string;
    }
  | {
      type: "list";
      ordered: boolean;
      items: string[];
    }
  | {
      type: "image";
      src: string;
      alt?: string | null;
    }
  | {
      type: "table";
      rows: string[][];
    };

export type NativePptxSlideElement =
  | {
      type: "text";
      id: string;
      leftPct: number;
      topPct: number;
      widthPct: number;
      heightPct: number;
      text: string;
      fontSize: number;
      align: "left" | "center" | "right";
      bold?: boolean;
      color?: string | null;
    }
  | {
      type: "image";
      id: string;
      leftPct: number;
      topPct: number;
      widthPct: number;
      heightPct: number;
      src: string;
    }
  | {
      type: "shape";
      id: string;
      leftPct: number;
      topPct: number;
      widthPct: number;
      heightPct: number;
      fillColor?: string | null;
      strokeColor?: string | null;
      strokeWidth?: number;
      opacity?: number;
      radius?: number;
    };

export type NativePptxSlide = {
  id: string;
  width: number;
  height: number;
  backgroundColor?: string | null;
  elements: NativePptxSlideElement[];
};

const xmlParser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "",
  removeNSPrefix: true,
  trimValues: true,
});

const DEFAULT_SLIDE_WIDTH = 9144000;
const DEFAULT_SLIDE_HEIGHT = 6858000;
const EMU_PER_POINT = 12700;
const OFFICE_THEME_COLORS: Record<string, string> = {
  dk1: "#111936",
  lt1: "#ffffff",
  dk2: "#1e2746",
  lt2: "#eef2ff",
  accent1: "#4f46e5",
  accent2: "#0ea5e9",
  accent3: "#10b981",
  accent4: "#f59e0b",
  accent5: "#ef4444",
  accent6: "#8b5cf6",
  hlink: "#2563eb",
  folHlink: "#7c3aed",
  bg1: "#ffffff",
  tx1: "#111936",
  bg2: "#eef2ff",
  tx2: "#1e2746",
};
const PRESET_COLORS: Record<string, string> = {
  black: "#000000",
  white: "#ffffff",
  red: "#ff0000",
  blue: "#0000ff",
  green: "#008000",
  yellow: "#ffff00",
  gray: "#808080",
  grey: "#808080",
  orange: "#ffa500",
  purple: "#800080",
  pink: "#ffc0cb",
};

function toArray<T>(value?: T | T[] | null): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function toNumber(value: unknown, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function clampPercent(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(value, 100));
}

function clampOpacity(value: number) {
  if (!Number.isFinite(value)) return 1;
  return Math.max(0, Math.min(value, 1));
}

function extensionToMimeType(extension: string) {
  const normalized = extension.toLowerCase();

  if (normalized === "png") return "image/png";
  if (normalized === "jpg" || normalized === "jpeg") return "image/jpeg";
  if (normalized === "gif") return "image/gif";
  if (normalized === "webp") return "image/webp";
  if (normalized === "svg") return "image/svg+xml";
  return "application/octet-stream";
}

function readText(node: HtmlNode): string {
  if (node instanceof TextNode) {
    return node.rawText;
  }

  if (!(node instanceof HTMLElement)) {
    return "";
  }

  if (node.tagName === "BR") {
    return "\n";
  }

  return node.childNodes.map(readText).join("");
}

function extractCellText(node?: HTMLElement | null) {
  if (!node) return "";
  return readText(node).replace(/\s+\n/g, "\n").replace(/\n\s+/g, "\n").replace(/\s+/g, " ").trim();
}

function convertHtmlNodeToBlocks(node: HtmlNode): NativeDocBlock[] {
  if (node instanceof TextNode) {
    const text = node.rawText.trim();
    return text ? [{ type: "paragraph", text }] : [];
  }

  if (!(node instanceof HTMLElement)) {
    return [];
  }

  const tag = node.tagName.toLowerCase();

  if (/^h[1-6]$/.test(tag)) {
    const text = extractCellText(node);
    if (!text) return [];

    return [
      {
        type: "heading",
        level: Number(tag.slice(1)),
        text,
      },
    ];
  }

  if (tag === "p") {
    const imageChildren = node.querySelectorAll("img");
    const imageBlocks = imageChildren
      .map((image) => ({
        type: "image" as const,
        src: image.getAttribute("src") ?? "",
        alt: image.getAttribute("alt"),
      }))
      .filter((image) => image.src);

    const text = extractCellText(node);
    const textBlocks = text ? [{ type: "paragraph" as const, text }] : [];
    return [...textBlocks, ...imageBlocks];
  }

  if (tag === "blockquote") {
    const text = extractCellText(node);
    return text ? [{ type: "quote", text }] : [];
  }

  if (tag === "img") {
    const src = node.getAttribute("src") ?? "";
    if (!src) return [];

    return [
      {
        type: "image",
        src,
        alt: node.getAttribute("alt"),
      },
    ];
  }

  if (tag === "ul" || tag === "ol") {
    const items = node.querySelectorAll("li").map((item) => extractCellText(item)).filter(Boolean);
    if (!items.length) return [];

    return [
      {
        type: "list",
        ordered: tag === "ol",
        items,
      },
    ];
  }

  if (tag === "table") {
    const rows = node
      .querySelectorAll("tr")
      .map((row) =>
        row
          .querySelectorAll("th,td")
          .map((cell) => extractCellText(cell))
          .filter((cell) => cell.length > 0)
      )
      .filter((row) => row.length > 0);

    return rows.length ? [{ type: "table", rows }] : [];
  }

  return node.childNodes.flatMap(convertHtmlNodeToBlocks);
}

function normalizeBlocks(blocks: NativeDocBlock[]) {
  return blocks.filter((block) => {
    if (block.type === "image") return Boolean(block.src);
    if (block.type === "table") return block.rows.length > 0;
    if (block.type === "list") return block.items.length > 0;
    return block.text.trim().length > 0;
  });
}

function normalizeZipPath(basePath: string, target: string) {
  const baseParts = basePath.split("/");
  baseParts.pop();

  const targetParts = target.split("/");
  for (const part of targetParts) {
    if (!part || part === ".") continue;
    if (part === "..") {
      baseParts.pop();
      continue;
    }
    baseParts.push(part);
  }

  return baseParts.join("/");
}

function getShapeBounds(shape: any) {
  const xfrm = shape?.spPr?.xfrm ?? shape?.xfrm ?? {};
  return {
    x: toNumber(xfrm?.off?.x),
    y: toNumber(xfrm?.off?.y),
    cx: Math.max(1, toNumber(xfrm?.ext?.cx, DEFAULT_SLIDE_WIDTH)),
    cy: Math.max(1, toNumber(xfrm?.ext?.cy, DEFAULT_SLIDE_HEIGHT)),
  };
}

function withAlpha(hexColor: string, opacity = 1) {
  const hex = hexColor.replace(/^#/, "");
  if (!/^[0-9a-f]{6}$/i.test(hex)) return `#${hexColor.replace(/^#/, "")}`;
  if (opacity >= 0.995) return `#${hex}`;

  const alpha = Math.round(clampOpacity(opacity) * 255)
    .toString(16)
    .padStart(2, "0");

  return `#${hex}${alpha}`;
}

function getColorOpacity(node: any) {
  const alphaNode = node?.alpha ?? node?.lumMod ?? null;
  if (!alphaNode) return 1;

  const raw = toNumber(alphaNode?.val ?? alphaNode, 100000);
  if (!raw) return 0;
  return clampOpacity(raw / 100000);
}

function resolveColorNode(node: any): string | null {
  if (!node) return null;

  if (typeof node === "string") {
    const trimmed = node.trim();
    if (/^#[0-9a-f]{6,8}$/i.test(trimmed)) return trimmed;
    return PRESET_COLORS[trimmed.toLowerCase()] ?? null;
  }

  const srgb = node?.srgbClr?.val ?? node?.srgbClr;
  if (typeof srgb === "string" && srgb.trim()) {
    return withAlpha(`#${srgb.replace(/^#/, "")}`, getColorOpacity(node?.srgbClr));
  }

  const scheme = String(node?.schemeClr?.val ?? node?.schemeClr ?? "")
    .trim()
    .toLowerCase();
  if (scheme) {
    return withAlpha(OFFICE_THEME_COLORS[scheme] ?? "#111936", getColorOpacity(node?.schemeClr));
  }

  const system = node?.sysClr?.lastClr ?? node?.sysClr?.val;
  if (typeof system === "string" && system.trim()) {
    return withAlpha(`#${system.replace(/^#/, "")}`, getColorOpacity(node?.sysClr));
  }

  const preset = String(node?.prstClr?.val ?? node?.prstClr ?? "")
    .trim()
    .toLowerCase();
  if (preset) {
    return withAlpha(PRESET_COLORS[preset] ?? "#111936", getColorOpacity(node?.prstClr));
  }

  if (node?.solidFill) {
    return resolveColorNode(node.solidFill);
  }

  return null;
}

function getShapeFillColor(shape: any) {
  const spPr = shape?.spPr ?? {};
  if (spPr?.noFill != null) return null;
  return resolveColorNode(spPr?.solidFill);
}

function getShapeStroke(shape: any) {
  const line = shape?.spPr?.ln;
  if (!line || line?.noFill != null) {
    return { color: null, width: 0 };
  }

  const color = resolveColorNode(line?.solidFill ?? line);
  const width = Math.max(0.5, Math.min(8, toNumber(line?.w, EMU_PER_POINT) / EMU_PER_POINT));

  return {
    color,
    width: color ? width : 0,
  };
}

function getShapeRadius(shape: any) {
  const preset = String(shape?.spPr?.prstGeom?.prst ?? "")
    .trim()
    .toLowerCase();

  if (preset.includes("ellipse") || preset.includes("round")) {
    return 18;
  }

  return 0;
}

function extractShapeDecorationElement(
  shape: any,
  slideWidth: number,
  slideHeight: number,
  index: number
) {
  const bounds = getShapeBounds(shape);
  const fillColor = getShapeFillColor(shape);
  const stroke = getShapeStroke(shape);

  if (!fillColor && !stroke.color) {
    return null;
  }

  return {
    type: "shape" as const,
    id: `shape-${index}`,
    leftPct: clampPercent((bounds.x / slideWidth) * 100),
    topPct: clampPercent((bounds.y / slideHeight) * 100),
    widthPct: clampPercent((bounds.cx / slideWidth) * 100),
    heightPct: clampPercent((bounds.cy / slideHeight) * 100),
    fillColor,
    strokeColor: stroke.color,
    strokeWidth: stroke.width,
    opacity: 1,
    radius: getShapeRadius(shape),
  };
}

function extractSlideBackgroundColor(slideJson: any) {
  return (
    resolveColorNode(slideJson?.sld?.cSld?.bg?.bgPr?.solidFill) ??
    resolveColorNode(slideJson?.sld?.cSld?.bg?.bgRef) ??
    "#ffffff"
  );
}

function collectTextFragments(node: any): string[] {
  if (!node) return [];

  if (typeof node === "string") {
    const text = node.trim();
    return text ? [text] : [];
  }

  if (Array.isArray(node)) {
    return node.flatMap(collectTextFragments);
  }

  return Object.entries(node).flatMap(([key, value]) => {
    if (key === "t" && typeof value === "string") {
      const text = value.trim();
      return text ? [text] : [];
    }
    return collectTextFragments(value);
  });
}

function collectParagraphText(paragraph: any) {
  const runText = toArray(paragraph?.r)
    .flatMap((run) => collectTextFragments(run))
    .join("");
  const fieldText = toArray(paragraph?.fld)
    .flatMap((field) => collectTextFragments(field))
    .join("");
  const breakCount = toArray(paragraph?.br).length;
  const combined = `${runText}${fieldText}`.trim();

  if (combined) {
    return `${combined}${breakCount > 0 ? "\n".repeat(breakCount) : ""}`.trimEnd();
  }

  return collectTextFragments(paragraph).join("").trim();
}

function extractShapeText(shape: any) {
  const paragraphs = toArray(shape?.txBody?.p)
    .map(collectParagraphText)
    .map((text) => text.replace(/[ \t]{2,}/g, " ").trim())
    .filter(Boolean);

  if (!paragraphs.length) return "";

  return paragraphs.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

function extractRunOptions(shape: any) {
  const paragraphs = toArray(shape?.txBody?.p);
  const firstParagraph = paragraphs[0];
  const firstRun = toArray(firstParagraph?.r)[0] ?? firstParagraph?.endParaRPr ?? null;
  const runProps = firstRun?.rPr ?? firstRun ?? {};
  const alignmentRaw = String(firstParagraph?.pPr?.algn ?? "").toLowerCase();

  return {
    fontSize: Math.max(12, Math.round(toNumber(runProps?.sz, 1800) / 100)),
    align:
      alignmentRaw === "ctr"
        ? "center"
        : alignmentRaw === "r"
        ? "right"
        : ("left" as const),
    bold: String(runProps?.b ?? "") === "1",
    color: resolveColorNode(runProps),
  };
}

async function parseSlideRelationships(zip: JSZip, slidePath: string) {
  const relPath = slidePath.replace(
    /^(.+\/)([^/]+)$/,
    (_match, prefix, fileName) => `${prefix}_rels/${fileName}.rels`
  );
  const relFile = zip.file(relPath);

  if (!relFile) return {} as Record<string, string>;

  const relXml = await relFile.async("string");
  const relJson = xmlParser.parse(relXml);
  const relationships = toArray(relJson?.Relationships?.Relationship);
  const nextMap: Record<string, string> = {};

  for (const relationship of relationships) {
    if (!relationship?.Id || !relationship?.Target) continue;
    nextMap[String(relationship.Id)] = normalizeZipPath(slidePath, String(relationship.Target));
  }

  return nextMap;
}

async function extractPictureElement(
  zip: JSZip,
  slidePath: string,
  relationMap: Record<string, string>,
  picture: any,
  slideWidth: number,
  slideHeight: number,
  index: number
) {
  const bounds = getShapeBounds(picture);
  const embedId = picture?.blipFill?.blip?.embed;
  const targetPath = embedId ? relationMap[String(embedId)] : null;

  if (!targetPath) return null;

  const imageFile = zip.file(targetPath);
  if (!imageFile) return null;

  const extensionMatch = targetPath.match(/\.([a-z0-9]{2,8})$/i);
  const mimeType = extensionToMimeType(extensionMatch?.[1] ?? "");
  const base64 = await imageFile.async("base64");

  return {
    type: "image" as const,
    id: `image-${index}`,
    leftPct: clampPercent((bounds.x / slideWidth) * 100),
    topPct: clampPercent((bounds.y / slideHeight) * 100),
    widthPct: clampPercent((bounds.cx / slideWidth) * 100),
    heightPct: clampPercent((bounds.cy / slideHeight) * 100),
    src: `data:${mimeType};base64,${base64}`,
  };
}

function extractTextElement(
  shape: any,
  slideWidth: number,
  slideHeight: number,
  index: number
) {
  const text = extractShapeText(shape);
  if (!text) return null;

  const bounds = getShapeBounds(shape);
  const runOptions = extractRunOptions(shape);

  return {
    type: "text" as const,
    id: `text-${index}`,
    leftPct: clampPercent((bounds.x / slideWidth) * 100),
    topPct: clampPercent((bounds.y / slideHeight) * 100),
    widthPct: clampPercent((bounds.cx / slideWidth) * 100),
    heightPct: clampPercent((bounds.cy / slideHeight) * 100),
    text,
    fontSize: runOptions.fontSize,
    align: runOptions.align,
    bold: runOptions.bold,
    color: runOptions.color,
  };
}

async function readAsArrayBuffer(uri: string) {
  const base64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });

  const normalized = base64.replace(/[\r\n\s]/g, "");
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  const lookup = new Uint8Array(256);

  for (let index = 0; index < chars.length; index += 1) {
    lookup[chars.charCodeAt(index)] = index;
  }

  const padding = normalized.endsWith("==") ? 2 : normalized.endsWith("=") ? 1 : 0;
  const byteLength = Math.max(0, (normalized.length * 3) / 4 - padding);
  const buffer = new ArrayBuffer(byteLength);
  const bytes = new Uint8Array(buffer);

  let byteIndex = 0;
  for (let index = 0; index < normalized.length; index += 4) {
    const encoded1 = lookup[normalized.charCodeAt(index)];
    const encoded2 = lookup[normalized.charCodeAt(index + 1)];
    const encoded3 = normalized[index + 2] === "=" ? 64 : lookup[normalized.charCodeAt(index + 2)];
    const encoded4 = normalized[index + 3] === "=" ? 64 : lookup[normalized.charCodeAt(index + 3)];

    bytes[byteIndex] = (encoded1 << 2) | (encoded2 >> 4);
    byteIndex += 1;

    if (encoded3 !== 64 && byteIndex < bytes.length) {
      bytes[byteIndex] = ((encoded2 & 15) << 4) | (encoded3 >> 2);
      byteIndex += 1;
    }

    if (encoded4 !== 64 && byteIndex < bytes.length) {
      bytes[byteIndex] = ((encoded3 & 3) << 6) | encoded4;
      byteIndex += 1;
    }
  }

  return buffer;
}

export async function parseDocxBlocks(localUri: string): Promise<NativeDocBlock[]> {
  const arrayBuffer = await readAsArrayBuffer(localUri);
  const result = await mammoth.convertToHtml(
    { arrayBuffer },
    {
      convertImage: mammoth.images.imgElement(async (image: any) => ({
        src: `data:${image.contentType};base64,${await image.readAsBase64String()}`,
      })),
    }
  );

  const root = parseHtml(result.value);
  const blocks = root.childNodes.flatMap(convertHtmlNodeToBlocks);
  return normalizeBlocks(blocks);
}

export async function parsePptxSlides(localUri: string): Promise<NativePptxSlide[]> {
  const base64 = await FileSystem.readAsStringAsync(localUri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const zip = await JSZip.loadAsync(base64, { base64: true });

  const presentationXml = await zip.file("ppt/presentation.xml")?.async("string");
  const presentationJson = presentationXml ? xmlParser.parse(presentationXml) : null;
  const slideWidth = Math.max(
    1,
    toNumber(presentationJson?.presentation?.sldSz?.cx, DEFAULT_SLIDE_WIDTH)
  );
  const slideHeight = Math.max(
    1,
    toNumber(presentationJson?.presentation?.sldSz?.cy, DEFAULT_SLIDE_HEIGHT)
  );

  const slidePaths = Object.keys(zip.files)
    .filter((name) => /^ppt\/slides\/slide\d+\.xml$/i.test(name))
    .sort((left, right) => {
      const leftIndex = toNumber(left.match(/slide(\d+)\.xml/i)?.[1], 0);
      const rightIndex = toNumber(right.match(/slide(\d+)\.xml/i)?.[1], 0);
      return leftIndex - rightIndex;
    });

  const slides: NativePptxSlide[] = [];

  for (const slidePath of slidePaths) {
    const slideXml = await zip.file(slidePath)?.async("string");
    if (!slideXml) continue;

    const relationMap = await parseSlideRelationships(zip, slidePath);
    const slideJson = xmlParser.parse(slideXml);
    const spTree = slideJson?.sld?.cSld?.spTree ?? {};
    const textShapes = toArray(spTree?.sp);
    const pictureShapes = toArray(spTree?.pic);
    const shapeElements = textShapes
      .map((shape, index) =>
        extractShapeDecorationElement(shape, slideWidth, slideHeight, index)
      )
      .filter((shape): shape is Exclude<typeof shape, null> => Boolean(shape));

    const textElements = textShapes
      .map((shape, index) => extractTextElement(shape, slideWidth, slideHeight, index))
      .filter((shape): shape is Exclude<typeof shape, null> => Boolean(shape));

    const imageResults = await Promise.all(
      pictureShapes.map((picture, index) =>
        extractPictureElement(
          zip,
          slidePath,
          relationMap,
          picture,
          slideWidth,
          slideHeight,
          index
        )
      )
    );

    slides.push({
      id: slidePath,
      width: slideWidth,
      height: slideHeight,
      backgroundColor: extractSlideBackgroundColor(slideJson),
      elements: [
        ...shapeElements,
        ...imageResults.filter(Boolean),
        ...textElements,
      ] as NativePptxSlideElement[],
    });
  }

  return slides;
}
