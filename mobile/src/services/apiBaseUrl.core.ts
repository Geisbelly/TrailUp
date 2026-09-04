/**
 * Nucleo puro da resolucao da URL base da API.
 *
 * Separado de `apiBaseUrl.ts` para poder ser testado: aquele arquivo importa
 * `react-native` e `expo-constants`, e nenhum dos dois carrega em Node — o
 * runner do projeto (`node --import tsx --test`) morre no `import`. Aqui nao
 * entra nada nativo; a plataforma e o host do Metro chegam como PARAMETRO.
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
  if (!value) return;
  if (!target.includes(value)) target.push(value);
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
  if (plataforma === "android") {
    return "http://10.0.2.2:8000";
  }
  return "http://localhost:8000";
}

/** Deriva o IP do backend do host do Metro (`ip:porta`). */
export function metroHostBaseUrl(hostUri: unknown, port = 8000): string | null {
  if (typeof hostUri !== "string" || !hostUri) return null;
  const host = hostUri.split(":")[0]?.trim();
  if (!host || host === "localhost" || host === "127.0.0.1") return null;
  return `http://${host}:${port}`;
}

export type EntradaCandidatos = {
  envValue?: string | null;
  plataforma: PlataformaApi;
  /** Host do Metro; `null` fora de dev. */
  metroHostUri?: unknown;
  dev: boolean;
  /** Chamado quando um build instalado fica sem nenhuma URL para tentar. */
  aoFicarSemApi?: () => void;
};

export function montarCandidatos(entrada: EntradaCandidatos): string[] {
  const { envValue, plataforma, metroHostUri, dev, aoFicarSemApi } = entrada;
  const candidates: string[] = [];
  const normalizedEnv = normalizeBaseUrl(String(envValue ?? ""));

  // Os dois palpites locais — IP do Metro e host do emulador — valem SO em
  // desenvolvimento. Num build instalado eles nao existem: `10.0.2.2` e o host
  // do emulador Android, e num aparelho real nao resolve.
  //
  // Eles entravam sempre, e por isso a lista nunca ficava vazia: um build sem
  // `EXPO_PUBLIC_APITRAIUP_URL` tentava o endereco do emulador, falhava com
  // "Network request failed" e caia no fallback direto ao Supabase — o mesmo
  // caminho previsto para quando a API hiberna. Erro de configuracao ficava
  // indistinguivel do caso normal, e sem nenhum sinal: os lotes chegavam ao
  // banco com `analysis_ciclo_id` nulo e ninguem sabia por que a analise nao
  // rodava.
  if (dev) {
    // Em dev o IP do Metro vem PRIMEIRO: e sempre o IP correto da maquina,
    // robusto a troca por DHCP mesmo com o .env desatualizado.
    addCandidate(candidates, normalizeBaseUrl(metroHostBaseUrl(metroHostUri) ?? ""));
  }

  addCandidate(candidates, normalizedEnv);
  // Derivado do env explicito, entao vale nos dois modos: quem configurou
  // localhost de proposito quer o mapeamento do emulador.
  addCandidate(
    candidates,
    normalizedEnv ? mapLocalhostForAndroid(normalizedEnv, plataforma) : null
  );

  if (dev) {
    const localDefault = normalizeBaseUrl(defaultDevBaseUrl(plataforma));
    addCandidate(candidates, localDefault);
    addCandidate(
      candidates,
      localDefault ? mapLocalhostForAndroid(localDefault, plataforma) : null
    );
  }

  if (candidates.length === 0 && !dev) {
    aoFicarSemApi?.();
  }

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
