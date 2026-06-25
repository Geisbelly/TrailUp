import Constants from "expo-constants";
import { Platform } from "react-native";

/**
 * Em device fisico, o backend FastAPI roda na MESMA maquina que o Metro
 * bundler. O Expo expoe o host do Metro (ip:porta) — derivamos o IP atual
 * dele e montamos a URL do backend. Isso evita hardcode de IP no .env, que
 * muda a cada sessao (DHCP) e quebra o app ate alguem atualizar manualmente.
 */
function metroHostBaseUrl(port = 8000): string | null {
  try {
    const c = Constants as any;
    const hostUri: unknown =
      c?.expoConfig?.hostUri ??
      c?.expoGoConfig?.debuggerHost ??
      c?.manifest2?.extra?.expoClient?.hostUri ??
      c?.manifest?.debuggerHost ??
      null;
    if (typeof hostUri !== "string" || !hostUri) return null;
    const host = hostUri.split(":")[0]?.trim();
    if (!host || host === "localhost" || host === "127.0.0.1") return null;
    return `http://${host}:${port}`;
  } catch {
    return null;
  }
}

function normalizeBaseUrl(value: string) {
  const trimmed = String(value ?? "").trim().replace(/\/+$/, "");
  if (!trimmed) return null;

  try {
    const parsed = new URL(trimmed);
    if (!parsed.protocol || !parsed.hostname) return null;
    return parsed.toString().replace(/\/+$/, "");
  } catch {
    return null;
  }
}

function addCandidate(target: string[], value: string | null) {
  if (!value) return;
  if (!target.includes(value)) target.push(value);
}

function mapLocalhostForAndroid(baseUrl: string) {
  try {
    const parsed = new URL(baseUrl);
    if (Platform.OS !== "android") return null;
    if (parsed.hostname !== "localhost" && parsed.hostname !== "127.0.0.1") return null;
    parsed.hostname = "10.0.2.2";
    return parsed.toString().replace(/\/+$/, "");
  } catch {
    return null;
  }
}

function defaultDevBaseUrl() {
  if (Platform.OS === "android") {
    return "http://10.0.2.2:8000";
  }
  return "http://localhost:8000";
}

export function resolveApiBaseCandidates(envValue?: string | null) {
  const candidates: string[] = [];
  const normalizedEnv = normalizeBaseUrl(String(envValue ?? ""));
  const localDefault = normalizeBaseUrl(defaultDevBaseUrl());

  // IP atual derivado do Metro PRIMEIRO: em dev e sempre o IP correto da maquina
  // (robusto a troca de IP por DHCP, mesmo com .env desatualizado). Em producao
  // (sem Metro) retorna null e cai no .env.
  addCandidate(candidates, normalizeBaseUrl(metroHostBaseUrl() ?? ""));
  addCandidate(candidates, normalizedEnv);
  addCandidate(candidates, normalizedEnv ? mapLocalhostForAndroid(normalizedEnv) : null);
  addCandidate(candidates, localDefault);
  addCandidate(candidates, localDefault ? mapLocalhostForAndroid(localDefault) : null);

  return candidates;
}

export function isNetworkRequestFailedError(error: unknown) {
  const message =
    typeof error === "string"
      ? error
      : typeof error === "object" && error !== null && "message" in error
      ? String((error as { message?: unknown }).message ?? "")
      : "";

  return /network request failed|failed to fetch|load failed|networkerror/i.test(message);
}
