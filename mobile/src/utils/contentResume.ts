import AsyncStorage from "@react-native-async-storage/async-storage";

const PREFIX = "trailup:content-resume:v1";

export type ContentResumeState = {
  positionMillis?: number;
  page?: number;
  slide?: number;
  card?: number;
  updatedAt: number;
};

function compactHash(value: string) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function buildContentResumeKey(
  userId: string | null | undefined,
  kind: string,
  contentId: string | number | null | undefined
) {
  const owner = String(userId ?? "anonymous").trim() || "anonymous";
  const identity = String(contentId ?? "unknown").trim() || "unknown";
  return `${PREFIX}:${compactHash(owner)}:${kind}:${compactHash(identity)}`;
}

export async function loadContentResume(key: string): Promise<ContentResumeState | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ContentResumeState>;
    if (!parsed || typeof parsed !== "object") return null;
    return {
      ...(Number.isFinite(parsed.positionMillis) ? { positionMillis: Number(parsed.positionMillis) } : {}),
      ...(Number.isFinite(parsed.page) ? { page: Number(parsed.page) } : {}),
      ...(Number.isFinite(parsed.slide) ? { slide: Number(parsed.slide) } : {}),
      ...(Number.isFinite(parsed.card) ? { card: Number(parsed.card) } : {}),
      updatedAt: Number.isFinite(parsed.updatedAt) ? Number(parsed.updatedAt) : 0,
    };
  } catch {
    return null;
  }
}

export async function saveContentResume(
  key: string,
  state: Omit<ContentResumeState, "updatedAt">
) {
  try {
    await AsyncStorage.setItem(key, JSON.stringify({ ...state, updatedAt: Date.now() }));
  } catch {
    // Retomada e auxiliar; uma falha local nao deve bloquear o conteudo.
  }
}
