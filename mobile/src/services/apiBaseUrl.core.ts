/**
 * Nucleo puro da resolucao da URL base da API.
 *
 * Mantido separado do adaptador nativo para ser testado sem carregar
 * react-native ou expo-constants.
 */
export type PlataformaApi = "android" | "ios" | "web" | (string & {});

export function normalizeBaseUrl(value: string) {
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
  if (value && !target.includes(value)) target.push(value);
}

export function mapLocalhostForAndroid(baseUrl: string, plataforma: PlataformaApi) {
  try {
    const parsed = new URL(baseUrl);
    if (plataforma !== "android") return null;
    if (parsed.hostname !== "localhost" && parsed.hostname !== "127.0.0.1") return null;
    parsed.hostname = "10.0.2.2";
    return parsed.toString().replace(/\/+$/, "");
  } catch {
    return null;
  }
}

export function defaultDevBaseUrl(plataforma: PlataformaApi) {
  return plataforma === "android" ? "http://10.0.2.2:8000" : "http://localhost:8000";
}

export function metroHostBaseUrl(hostUri: unknown, port = 8000): string | null {
  if (typeof hostUri !== "string" || !hostUri) return null;
  const host = hostUri.split(":")[0]?.trim();
  if (!host || host === "localhost" || host === "127.0.0.1") return null;
  return `http://${host}:${port}`;
}

export type EntradaCandidatos = {
  envValue?: string | null;
  plataforma: PlataformaApi;
  metroHostUri?: unknown;
  dev: boolean;
  aoFicarSemApi?: () => void;
};

export function montarCandidatos(entrada: EntradaCandidatos): string[] {
  const { envValue, plataforma, metroHostUri, dev, aoFicarSemApi } = entrada;
  const candidates: string[] = [];
  const normalizedEnv = normalizeBaseUrl(String(envValue ?? ""));

  if (dev) {
    addCandidate(candidates, normalizeBaseUrl(metroHostBaseUrl(metroHostUri) ?? ""));
  }
  addCandidate(candidates, normalizedEnv);
  addCandidate(
    candidates,
    normalizedEnv ? mapLocalhostForAndroid(normalizedEnv, plataforma) : null,
  );

  if (dev) {
    const localDefault = normalizeBaseUrl(defaultDevBaseUrl(plataforma));
    addCandidate(candidates, localDefault);
    addCandidate(
      candidates,
      localDefault ? mapLocalhostForAndroid(localDefault, plataforma) : null,
    );
  }

  if (candidates.length === 0 && !dev) aoFicarSemApi?.();
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
