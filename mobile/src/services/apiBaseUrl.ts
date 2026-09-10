import Constants from "expo-constants";
import { Platform } from "react-native";

import { montarCandidatos } from "./apiBaseUrl.core";

export { isNetworkRequestFailedError } from "./apiBaseUrl.core";

/**
 * Em device fisico, o backend FastAPI roda na MESMA maquina que o Metro
 * bundler. O Expo expoe o host do Metro (ip:porta) — derivamos o IP atual
 * dele e montamos a URL do backend. Isso evita hardcode de IP no .env, que
 * muda a cada sessao (DHCP) e quebra o app ate alguem atualizar manualmente.
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

function emDesenvolvimento() {
  const dev = (globalThis as { __DEV__?: boolean }).__DEV__;
  if (typeof dev === "boolean") return dev;
  return process.env.NODE_ENV !== "production";
}

let avisouApiAusente = false;

function avisarApiNaoConfigurada() {
  if (avisouApiAusente) return;
  avisouApiAusente = true;
  console.warn(
    "[apiBaseUrl] EXPO_PUBLIC_APITRAIUP_URL ausente ou invalida neste build: " +
      "nenhuma URL de API para tentar. Defina a variavel no profile do EAS e gere o build novamente."
  );
}

export function resolveApiBaseCandidates(envValue?: string | null) {
  const dev = emDesenvolvimento();
  return montarCandidatos({
    envValue,
    plataforma: Platform.OS,
    metroHostUri: dev ? metroHostUri() : null,
    dev,
    aoFicarSemApi: avisarApiNaoConfigurada,
  });
}
