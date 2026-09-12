// Forma de URL do Storage: parsing, validacao e montagem da URL publica.
//
// Extraido de supabaseStorage.ts pelo mesmo motivo que storageOrigin.ts foi:
// aquele modulo importa o client do Supabase, que arrasta o react-native e nao
// carrega no harness do `node --test`. Tudo que e' decisao sobre o FORMATO da
// URL e' puro e mora aqui, testavel de verdade; la' fica so' o que precisa
// assinar, que e' o unico ponto que depende do client.

import {
  extrairReferenciaDeDeck,
  origemDeStorageConfiavel,
  reancorarNaOrigemDoApp,
} from "./storageOrigin";

export type ParsedStorageUrl = {
  origin: string;
  mode: string;
  bucket: string;
  objectPath: string;
  /** Query original; a reancoragem tem que devolve-la junto. */
  search: string;
};

export type ResolveStorageUrlOptions = {
  bucket?: string | null;
  expiresIn?: number;
};

export function joinUrl(origin: string, path: string) {
  if (/^https?:\/\//i.test(path)) return path;
  return `${origin}${path.startsWith("/") ? "" : "/"}${path}`;
}

export function getSupabaseOrigin() {
  const raw = process.env.EXPO_PUBLIC_SUPABASE_URL;
  if (!raw) return null;

  try {
    return new URL(raw).origin;
  } catch {
    return null;
  }
}

/**
 * URL de deck resservido (`/api/v1/decks/{bucket}/{caminho}`) virando URL
 * publica de storage.
 *
 * O deck E gravado no mesmo bucket publico que o resto do material (audio,
 * markdown, imagens) -- `supabaseService.ts` sobe tudo com `getPublicUrl`. O
 * endpoint `/api/v1/decks` do BrainHexPDF existe por causa do Content-Type: o
 * gateway publico serve `.html` como `text/plain`. Isso NAO nos afeta aqui,
 * porque o app baixa o HTML e injeta inline (ver DocumentBlock) exatamente por
 * esse motivo -- `fetch().text()` le os bytes independente do Content-Type.
 *
 * Convertemos SEMPRE que a origem do app e conhecida, sem comparar origens: o
 * endpoint de deck e um atalho do servidor, o arquivo mora no Storage, e o
 * Supabase nao serve essa rota -- um "acerto" de origem ali seria coincidencia
 * sem valor.
 */
export function deckComoUrlPublicaDeStorage(rawUrl: string): string | null {
  const referencia = extrairReferenciaDeDeck(rawUrl);
  if (!referencia) return null;

  return reancorarNaOrigemDoApp({
    appOrigin: getSupabaseOrigin(),
    bucket: referencia.bucket,
    objectPath: referencia.objectPath,
    search: referencia.search,
  });
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

export function normalizeObjectPath(rawPath: string, bucketHint?: string | null) {
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

export function encodeObjectPath(path: string) {
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

  const deck = deckComoUrlPublicaDeStorage(trimmed);
  if (deck) return deck;

  const parsed = parseSupabaseStorageUrl(trimmed);
  if (parsed) {
    // Mesma desconfianca do resolve: origem estranha ao app nao serve, mesmo
    // que a URL esteja "pronta".
    const appOriginParaPublico = getSupabaseOrigin();
    if (!origemDeStorageConfiavel(parsed.origin, appOriginParaPublico)) {
      const reancorada = reancorarNaOrigemDoApp({
        appOrigin: appOriginParaPublico,
        bucket: parsed.bucket,
        objectPath: parsed.objectPath,
        search: parsed.search,
      });
      if (reancorada) return reancorada;
    }
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
      search: url.search,
    };
  } catch {
    return null;
  }
}
