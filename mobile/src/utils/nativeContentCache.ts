import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from "expo-file-system/legacy";

export type CachedNativeContentFile = {
  cacheKey: string;
  localUri: string;
  extension: string;
  lastAccessedAt: number;
  createdAt: number;
};

type CacheRecord = CachedNativeContentFile;

type EnsureCachedContentOptions = {
  extensionHint?: string | null;
  staleMs?: number;
};

const CACHE_STORAGE_KEY = "@trailup/native-content-cache/v1";
const DEFAULT_STALE_MS = 1000 * 60 * 60 * 24 * 3;
const CACHE_ROOT =
  (FileSystem.cacheDirectory ?? FileSystem.documentDirectory ?? "") +
  "trailup-native-content/";

function sanitizeExtension(value?: string | null) {
  const cleaned = String(value ?? "")
    .trim()
    .replace(/^\.+/, "")
    .toLowerCase();

  if (!cleaned) return "bin";
  return cleaned.replace(/[^a-z0-9]/g, "") || "bin";
}

function inferExtension(reference: string, hint?: string | null) {
  if (hint) return sanitizeExtension(hint);

  const normalized = reference.split("?")[0].split("#")[0];
  const match = normalized.match(/\.([a-z0-9]{2,8})$/i);
  return sanitizeExtension(match?.[1]);
}

function hashString(value: string) {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(36);
}

async function ensureCacheDirectory() {
  const info = await FileSystem.getInfoAsync(CACHE_ROOT);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(CACHE_ROOT, { intermediates: true });
  }
}

async function readCacheMap() {
  const raw = await AsyncStorage.getItem(CACHE_STORAGE_KEY);
  if (!raw) return {} as Record<string, CacheRecord>;

  try {
    return JSON.parse(raw) as Record<string, CacheRecord>;
  } catch {
    return {} as Record<string, CacheRecord>;
  }
}

async function writeCacheMap(records: Record<string, CacheRecord>) {
  await AsyncStorage.setItem(CACHE_STORAGE_KEY, JSON.stringify(records));
}

async function fileExists(uri: string) {
  const info = await FileSystem.getInfoAsync(uri);
  return info.exists;
}

// Toda leitura-modificacao-escrita do mapa de cache (um unico blob JSON sob
// uma chave do AsyncStorage) precisa ser serializada: chamadas concorrentes
// para cache keys DIFERENTES (ex.: prefetch de um PDF em segundo plano +
// abertura de um audio visivel) cada uma le o mapa inteiro, muta sua propria
// entrada e reescreve o mapa inteiro — sem serializacao, a escrita que
// terminar por ultimo sobrescreve o mapa completo sem a entrada que a outra
// chamada acabou de adicionar. O arquivo baixado por essa chamada perdida
// fica orfao (nunca mais rastreado, nunca limpo) e o mesmo cacheKey e
// baixado de novo toda vez que for solicitado, ja que o lookup no mapa falha.
let cacheLock: Promise<unknown> = Promise.resolve();

function withCacheLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = cacheLock.then(fn, fn);
  cacheLock = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

async function cleanupUnusedCachedContentLocked(staleMs: number) {
  await ensureCacheDirectory();

  const now = Date.now();
  const records = await readCacheMap();
  const nextRecords: Record<string, CacheRecord> = {};

  for (const [key, record] of Object.entries(records)) {
    const exists = await fileExists(record.localUri);
    const expired = now - record.lastAccessedAt > staleMs;

    if (!exists || expired) {
      if (exists) {
        await FileSystem.deleteAsync(record.localUri, { idempotent: true });
      }
      continue;
    }

    nextRecords[key] = record;
  }

  await writeCacheMap(nextRecords);
}

export async function cleanupUnusedCachedContent(staleMs = DEFAULT_STALE_MS) {
  return withCacheLock(() => cleanupUnusedCachedContentLocked(staleMs));
}

export async function ensureCachedNativeContent(
  cacheKey: string,
  downloadUrl: string,
  options: EnsureCachedContentOptions = {}
): Promise<CachedNativeContentFile> {
  return withCacheLock(async () => {
    // Chama a versao sem lock proprio — cleanupUnusedCachedContent (exportada)
    // ja adquire o lock, e chama-la aqui causaria deadlock (a fila so libera
    // a proxima tarefa quando a atual termina, e esta tarefa esperaria por
    // uma proxima tarefa que so comecaria depois dela mesma terminar).
    await cleanupUnusedCachedContentLocked(options.staleMs ?? DEFAULT_STALE_MS);
    await ensureCacheDirectory();

    const id = hashString(cacheKey);
    const extension = inferExtension(downloadUrl, options.extensionHint);
    const localUri = `${CACHE_ROOT}${id}.${extension}`;
    const records = await readCacheMap();
    const existing = records[id];
    const now = Date.now();

    if (existing?.localUri && (await fileExists(existing.localUri))) {
      const updatedRecord = {
        ...existing,
        lastAccessedAt: now,
      };

      records[id] = updatedRecord;
      await writeCacheMap(records);
      return updatedRecord;
    }

    await FileSystem.deleteAsync(localUri, { idempotent: true });
    await FileSystem.downloadAsync(downloadUrl, localUri);

    const nextRecord: CacheRecord = {
      cacheKey,
      localUri,
      extension,
      lastAccessedAt: now,
      createdAt: now,
    };

    records[id] = nextRecord;
    await writeCacheMap(records);
    return nextRecord;
  });
}

