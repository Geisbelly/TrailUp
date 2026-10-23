import Constants from "expo-constants";
import { Platform } from "react-native";

import { montarCandidatos } from "./apiBaseUrl.core";

export { isNetworkRequestFailedError } from "./apiBaseUrl.core";

/**
 * Adaptador nativo do nucleo em `apiBaseUrl.core.ts`: tudo que depende de
 * `react-native`/`expo-constants` fica aqui, e a decisao — testavel — fica la.
 */

/**
 * Em device fisico, o backend FastAPI roda na MESMA maquina que o Metro
 * bundler. O Expo expoe o host do Metro (ip:porta); o nucleo deriva o IP dele.
 * Isso evita hardcode de IP no .env, que muda a cada sessao (DHCP) e quebra o
 * app ate alguem atualizar manualmente.
 */
function metroHostUri(): unknown {
  try {
    const c = Constants as any;
    return (
      c?.expoConfig?.hostUri ??
      c?.expoGoConfig?.debuggerHost ??
      c?.manifest2?.extra?.expoClient?.hostUri ??
      c?.manifest?.debuggerHost ??
      null
    );
  } catch {
    return null;
  }
}

/**
 * `__DEV__` e global do React Native; em contexto sem ele (teste em Node, SSR)
 * cai para `NODE_ENV`, que o bundler define nos dois casos.
 */
function emDesenvolvimento() {
  const dev = (globalThis as { __DEV__?: boolean }).__DEV__;
  if (typeof dev === "boolean") return dev;
  return process.env.NODE_ENV !== "production";
}

let avisouApiAusente = false;
const esquemasAvisados = new Set<string>();

/**
 * Avisa quando uma URL foi descartada por nao ser `https` fora de dev.
 *
 * Sem este aviso o efeito seria indistinguivel de "API fora do ar": a lista
 * nasce vazia, o `fetch` nunca acontece e quem configurou o build nao tem como
 * saber que o problema e o protocolo. Uma vez por URL.
 */
function avisarEsquemaRecusado(baseUrl: string) {
  if (esquemasAvisados.has(baseUrl)) return;
  esquemasAvisados.add(baseUrl);
  console.warn(
    `[apiBaseUrl] ${baseUrl} foi ignorada: fora de desenvolvimento a API tem de ` +
      "ser https. Todo pedido leva o access_token do aluno no header e " +
      "telemetria dele no corpo; em http para host remoto isso viaja em claro. " +
      "Use https (ou localhost/10.0.2.2, que nao saem do aparelho)."
  );
}

/**
 * Sem candidato num build instalado, quem chama nao tem como distinguir "a API
 * esta dormindo" de "a API nunca foi configurada" — os dois dao erro de rede. O
 * aviso e a unica pista, e sai uma vez para nao poluir o log.
 */
function avisarApiNaoConfigurada() {
  if (avisouApiAusente) return;
  avisouApiAusente = true;
  console.warn(
    "[apiBaseUrl] EXPO_PUBLIC_APITRAIUP_URL ausente ou invalida neste build: " +
      "nenhuma URL de API para tentar. A telemetria vai ser gravada direto no " +
      "Supabase (sem ciclo de analise) e a personalizacao via API nao vai " +
      "funcionar. Defina a variavel no profile do eas.json ou nas EAS " +
      "Environment Variables e gere o build de novo."
  );
}

export function resolveApiBaseCandidates(
  envValue?: string | null,
  opcoes?: { dev?: boolean }
) {
  // `dev` injetavel para o teste poder exercitar os dois modos sem depender do
  // `__DEV__` do bundler.
  const dev = opcoes?.dev ?? emDesenvolvimento();

  return montarCandidatos({
    envValue,
    plataforma: Platform.OS,
    metroHostUri: dev ? metroHostUri() : null,
    dev,
    aoFicarSemApi: avisarApiNaoConfigurada,
    aoRecusarEsquema: avisarEsquemaRecusado,
  });
}
