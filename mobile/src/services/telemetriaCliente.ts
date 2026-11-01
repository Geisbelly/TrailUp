import Constants from "expo-constants";
import { Platform } from "react-native";

import { montarCliente, type TelemetriaCliente } from "./telemetriaCliente.core";

export type { TelemetriaCliente } from "./telemetriaCliente.core";

/**
 * Adaptador nativo de `telemetriaCliente.core.ts`: le o que so existe no
 * aparelho e entrega ao nucleo. Nada aqui muda durante a execucao do app.
 */
export function lerClienteDoApp(apiBase: string | null | undefined): TelemetriaCliente {
  let appVersion: unknown = null;
  let ambiente: unknown = null;
  try {
    appVersion = Constants.expoConfig?.version ?? null;
    ambiente = Constants.executionEnvironment ?? null;
  } catch {
    // Sem os metadados o lote continua valendo; so perde a origem.
  }

  const dev = (globalThis as { __DEV__?: boolean }).__DEV__;
  return montarCliente({
    appVersion,
    buildProfile: process.env.EXPO_PUBLIC_BUILD_PROFILE,
    ambiente,
    dev: typeof dev === "boolean" ? dev : process.env.NODE_ENV !== "production",
    plataforma: Platform.OS,
    apiBase,
  });
}
