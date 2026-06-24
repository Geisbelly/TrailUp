import { Platform } from "react-native";

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
