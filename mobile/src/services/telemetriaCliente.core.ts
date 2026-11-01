/**
 * Nucleo puro de "de onde veio este lote": qual build, em qual ambiente, e para
 * qual API ele tentou mandar.
 *
 * Sem isto, `telemetria_lotes` nao separava um build EAS falando com a API do
 * Dokploy de um build de desenvolvimento com uma API local ligada ao banco de
 * producao: os dois gravam `via = 'api'`, e o payload so tinha metricas (#96,
 * medicao de 30/10). `via` e `fallback_motivo` dizem POR ONDE o lote chegou;
 * `cliente` diz QUEM o mandou.
 *
 * Separado de `telemetriaCliente.ts` pelo mesmo motivo de `apiBaseUrl.core.ts`:
 * `expo-constants` e `react-native` nao carregam em Node, e o runner do projeto
 * morre no `import`. Os valores nativos chegam como PARAMETRO.
 */

import type { TelemetriaClienteDoLote } from "@/interfaces/telemetria/TelemetryContracts";

export type TelemetriaCliente = TelemetriaClienteDoLote;

// O mesmo corte de `CLIENTE_CAMPO_MAX` em `app/schemas/telemetria.py`: o lote
// gravado direto e o gravado pela API guardam o mesmo valor.
export const TAMANHO_MAXIMO_CAMPO = 120;

function texto(valor: unknown): string | null {
  if (typeof valor !== "string") return null;
  const limpo = valor.trim();
  if (!limpo) return null;
  return limpo.slice(0, TAMANHO_MAXIMO_CAMPO);
}

/**
 * So o host, nunca a URL inteira: caminho e query nao dizem nada sobre o build,
 * e credencial embutida (`https://user:senha@host`) nao pode ir para o banco.
 */
export function hostDaApi(baseUrl: string | null | undefined): string | null {
  if (!baseUrl) return null;
  try {
    return texto(new URL(baseUrl).host);
  } catch {
    return null;
  }
}

export function montarCliente(entrada: {
  appVersion: unknown;
  buildProfile: unknown;
  ambiente: unknown;
  dev: boolean;
  plataforma: unknown;
  apiBase: string | null | undefined;
}): TelemetriaCliente {
  return {
    app_version: texto(entrada.appVersion),
    build_profile: texto(entrada.buildProfile),
    ambiente: texto(entrada.ambiente),
    dev: entrada.dev === true,
    plataforma: texto(entrada.plataforma),
    api_host: hostDaApi(entrada.apiBase),
  };
}
