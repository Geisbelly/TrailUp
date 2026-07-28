export type MaterialRecord = Record<string, unknown>;
export type DocumentPreviewMode = "pdf" | "office";

const CACHE_VERSION_PARAM = "trailup_v";
const OFFICE_EXTENSIONS = new Set([
  "ppt",
  "pptx",
  "pptm",
  "pps",
  "ppsx",
  "ppsm",
  "pot",
  "potx",
  "potm",
]);

function stringField(record: MaterialRecord | null, key: string): string | null {
  const value = record?.[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function materialMetadata(material: MaterialRecord | null): MaterialRecord | null {
  const metadata = material?.metadata;
  return metadata && typeof metadata === "object" && !Array.isArray(metadata)
    ? (metadata as MaterialRecord)
    : null;
}

function fileExtension(value: string | null): string | null {
  if (!value) return null;

  const withoutQuery = value.split(/[?#]/, 1)[0].replace(/\/+$/, "");
  const filename = withoutQuery.slice(withoutQuery.lastIndexOf("/") + 1);
  const dotIndex = filename.lastIndexOf(".");
  if (dotIndex <= 0 || dotIndex === filename.length - 1) return null;

  return filename.slice(dotIndex + 1).toLowerCase();
}

export function resolveDocumentPreviewMode(
  material: MaterialRecord | null,
  fallbackKind: "apresentacao" | "pdf",
): DocumentPreviewMode {
  const metadata = materialMetadata(material);
  const mimeType = (
    stringField(material, "mime_type")
    ?? stringField(metadata, "mime_type")
    ?? ""
  )
    .split(";", 1)[0]
    .trim()
    .toLowerCase();

  if (mimeType === "application/pdf") return "pdf";
  if (
    mimeType.includes("powerpoint")
    || mimeType.includes("presentationml")
    || mimeType.includes("slideshowml")
  ) {
    return "office";
  }

  const extensionCandidates = [
    stringField(material, "arquivo_url"),
    stringField(material, "storage_path"),
    stringField(material, "nome_arquivo"),
    stringField(metadata, "storage_path"),
    stringField(metadata, "nome_arquivo"),
  ];

  for (const candidate of extensionCandidates) {
    const extension = fileExtension(candidate);
    if (extension === "pdf") return "pdf";
    if (extension && OFFICE_EXTENSIONS.has(extension)) return "office";
  }

  return fallbackKind === "pdf" ? "pdf" : "office";
}

export function materialCacheVersion(
  material: MaterialRecord | null,
  fallbackUpdatedAt?: string | null,
): string | null {
  const metadata = materialMetadata(material);
  const generationKey = (
    stringField(metadata, "generation_key")
    ?? stringField(material, "generation_key")
  );
  const updatedAt = (
    stringField(metadata, "updated_at")
    ?? stringField(material, "updated_at")
    ?? (typeof fallbackUpdatedAt === "string" && fallbackUpdatedAt.trim()
      ? fallbackUpdatedAt.trim()
      : null)
  );

  const components = [generationKey, updatedAt].filter(
    (value): value is string => Boolean(value),
  );
  return components.length ? components.join("|") : null;
}

export function appendMaterialCacheVersion(url: string, version: string | null): string {
  const normalizedUrl = url.trim();
  const normalizedVersion = version?.trim() ?? "";
  if (!normalizedUrl || !normalizedVersion || /^(?:blob|data):/i.test(normalizedUrl)) {
    return normalizedUrl;
  }

  const hashIndex = normalizedUrl.indexOf("#");
  const baseUrl = hashIndex >= 0 ? normalizedUrl.slice(0, hashIndex) : normalizedUrl;
  const fragment = hashIndex >= 0 ? normalizedUrl.slice(hashIndex) : "";
  const encodedVersion = encodeURIComponent(normalizedVersion);
  const existingVersion = new RegExp(`([?&])${CACHE_VERSION_PARAM}=[^&#]*`, "i");

  if (existingVersion.test(baseUrl)) {
    return `${baseUrl.replace(
      existingVersion,
      `$1${CACHE_VERSION_PARAM}=${encodedVersion}`,
    )}${fragment}`;
  }

  const separator = baseUrl.includes("?")
    ? (baseUrl.endsWith("?") || baseUrl.endsWith("&") ? "" : "&")
    : "?";
  return `${baseUrl}${separator}${CACHE_VERSION_PARAM}=${encodedVersion}${fragment}`;
}

export function versionedMaterialUrl(
  url: string,
  material: MaterialRecord | null,
  fallbackUpdatedAt?: string | null,
): string {
  return appendMaterialCacheVersion(
    url,
    materialCacheVersion(material, fallbackUpdatedAt),
  );
}
