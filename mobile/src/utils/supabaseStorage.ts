import { supabase } from "@/database/supabase";
import { origemDeStorageConfiavel, reancorarNaOrigemDoApp } from "./storageOrigin";
import {
  buildSupabasePublicStorageUrl,
  deckComoUrlPublicaDeStorage,
  getSupabaseOrigin,
  joinUrl,
  looksLikeStorageObjectPath,
  normalizeObjectPath,
  parseSupabaseStorageUrl,
  type ResolveStorageUrlOptions,
} from "./storageUrlShape";

// Reexportados para nao mexer em quem ja importa daqui (DocumentBlock,
// contentBlocks, personalization).
export {
  buildSupabasePublicStorageUrl,
  looksLikeStorageObjectPath,
  parseSupabaseStorageUrl,
};

export async function resolveSupabaseStorageUrl(
  rawUrl: string,
  options: ResolveStorageUrlOptions = {}
) {
  const deck = deckComoUrlPublicaDeStorage(rawUrl);
  if (deck) return deck;

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

  // A URL veio pronta, mas de quem? Se a origem nao e a do app, ela foi montada
  // com a base errada no servidor (caso real: SUPABASE_URL apontando pro
  // servico interno do deploy, gerando host que o celular nao resolve -
  // net::ERR_NAME_NOT_RESOLVED). O caminho dentro do bucket continua valido:
  // basta reancorar na origem que o app conhece. Ver storageOrigin.ts.
  const appOrigin = getSupabaseOrigin();
  if (!origemDeStorageConfiavel(parsed.origin, appOrigin)) {
    const reancorada = reancorarNaOrigemDoApp({
      appOrigin,
      bucket: parsed.bucket,
      objectPath: parsed.objectPath,
      search: parsed.search,
    });
    if (reancorada) {
      if (parsed.mode === "public") return reancorada;
      // Bucket privado: assina no cliente, que fala com a origem certa.
      const { data, error } = await supabase
        .storage
        .from(parsed.bucket)
        .createSignedUrl(parsed.objectPath, expiresIn);
      if (!error && data?.signedUrl && appOrigin) {
        return joinUrl(appOrigin, data.signedUrl);
      }
      return reancorada;
    }
  }

  if (parsed.mode === "public" || parsed.mode === "sign") {
    return rawUrl;
  }

  const { data, error } = await supabase
    .storage
    .from(parsed.bucket)
    .createSignedUrl(parsed.objectPath, expiresIn);

  if (error || !data?.signedUrl) {
    throw error ?? new Error("Não foi possível assinar a URL do Supabase.");
  }

  return joinUrl(parsed.origin, data.signedUrl);
}
