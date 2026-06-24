import { supabase } from "@/database/supabase";

type ParsedStorageUrl = {
  origin: string;
  mode: string;
  bucket: string;
  objectPath: string;
};

type ResolveStorageUrlOptions = {
  bucket?: string | null;
  expiresIn?: number;
};

function joinUrl(origin: string, path: string) {
  if (/^https?:\/\//i.test(path)) return path;
  return `${origin}${path.startsWith("/") ? "" : "/"}${path}`;
}

function getSupabaseOrigin() {
  const raw = process.env.EXPO_PUBLIC_SUPABASE_URL;
  if (!raw) return null;

  try {
    return new URL(raw).origin;
  } catch {
    return null;
  }
}

export function looksLikeStorageObjectPath(rawValue: string) {
  const value = rawValue.trim();
  if (!value || /^https?:\/\//i.test(value)) return false;
  if (value.startsWith("{") || value.startsWith("<")) return false;
  if (/\/.+\.[a-z0-9]{2,8}($|\?)/i.test(value)) return true;

  // Accept canonical storage paths even when the final object has no extension.
  // Examples:
  // - conteudo_aluno/brainhex/survivor/classe-30/topico-114/apresentacao
  // - brainhex/survivor/classe-30/topico-114/markdown
  if (
    /^(conteudo_aluno|conteudos)\//i.test(value) ||
    /^brainhex\//i.test(value)
  ) {
    const segments = value.split("/").filter(Boolean);
    return segments.length >= 2;
  }

  return false;
}

function normalizeObjectPath(rawPath: string, bucketHint?: string | null) {
  if (!looksLikeStorageObjectPath(rawPath)) return null;

  const trimmed = rawPath.trim().replace(/^\/+/, "");
  const hintedBucket = (bucketHint ?? "conteudo_aluno").trim();
  const [firstSegment, ...restSegments] = trimmed.split("/");
  const explicitBucket =
    firstSegment && restSegments.length > 0 && ["conteudo_aluno", "conteudos"].includes(firstSegment)
      ? firstSegment
      : null;
  const bucket = explicitBucket ?? hintedBucket;

  if (!bucket) return null;

  if (trimmed.startsWith(`${bucket}/`)) {
    return {
      bucket,
      objectPath: trimmed.slice(bucket.length + 1),
    };
  }

  return {
    bucket,
    objectPath: trimmed,
  };
}

function encodeObjectPath(path: string) {
  return path
    .split("/")
    .filter((segment) => segment.length > 0)
    .map((segment) => encodeURIComponent(segment))
    .join("/");
}

export function buildSupabasePublicStorageUrl(
  rawUrl: string,
  options: Pick<ResolveStorageUrlOptions, "bucket"> = {}
) {
  const trimmed = String(rawUrl ?? "").trim();
  if (!trimmed) return trimmed;

  const parsed = parseSupabaseStorageUrl(trimmed);
  if (parsed) {
    if (parsed.mode === "public") return trimmed;
    const encodedPath = encodeObjectPath(parsed.objectPath);
    if (!encodedPath) return trimmed;
    return joinUrl(parsed.origin, `/storage/v1/object/public/${parsed.bucket}/${encodedPath}`);
  }

  const objectRef = normalizeObjectPath(trimmed, options.bucket);
  if (!objectRef) return trimmed;

  const origin = getSupabaseOrigin();
  if (!origin) return trimmed;

  const encodedPath = encodeObjectPath(objectRef.objectPath);
  if (!encodedPath) return trimmed;
  return joinUrl(origin, `/storage/v1/object/public/${objectRef.bucket}/${encodedPath}`);
}

export function parseSupabaseStorageUrl(rawUrl: string): ParsedStorageUrl | null {
  try {
    const url = new URL(rawUrl);
    if (!/\/storage\/v1\/object\//i.test(url.pathname)) return null;

    const parts = url.pathname.split("/").filter(Boolean);
    const mode = parts[3];
    const bucket = parts[4];
    const objectPath = decodeURIComponent(parts.slice(5).join("/"));

    if (!mode || !bucket || !objectPath) return null;

    return {
      origin: url.origin,
      mode: mode.toLowerCase(),
      bucket,
      objectPath,
    };
  } catch {
    return null;
  }
}

export async function resolveSupabaseStorageUrl(
  rawUrl: string,
  options: ResolveStorageUrlOptions = {}
) {
  const parsed = parseSupabaseStorageUrl(rawUrl);
  const expiresIn = options.expiresIn ?? 60 * 60;

  if (!parsed) {
    const objectRef = normalizeObjectPath(rawUrl, options.bucket);
    if (objectRef) {
      // Try signed URL first (works for private buckets), fallback to public URL.
      const { data, error } = await supabase
        .storage
        .from(objectRef.bucket)
        .createSignedUrl(objectRef.objectPath, expiresIn);

      if (!error && data?.signedUrl) {
        const origin = getSupabaseOrigin();
        return origin ? joinUrl(origin, data.signedUrl) : data.signedUrl;
      }
    }

    return buildSupabasePublicStorageUrl(rawUrl, { bucket: options.bucket });
  }

  if (parsed.mode === "public" || parsed.mode === "sign") {
    return rawUrl;
  }

  const { data, error } = await supabase
    .storage
    .from(parsed.bucket)
    .createSignedUrl(parsed.objectPath, expiresIn);

  if (error || !data?.signedUrl) {
    throw error ?? new Error("Nao foi possivel assinar a URL do Supabase.");
  }

  return joinUrl(parsed.origin, data.signedUrl);
}
