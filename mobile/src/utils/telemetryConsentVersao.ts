/**
 * Versao do termo e a regra de vigencia — sem AsyncStorage, para carregar em
 * Node e poder ser testado (mesmo motivo de `telemetriaPayload.ts`).
 */

import type { TelemetryConsentRecord } from "./telemetryConsent";

// v4: a analise de expressao facial passou a existir. A v3 dizia, com todas as
// letras, que "as imagens da camera nao sao analisadas" e prometia pedir
// consentimento de novo antes de isso mudar. Esta versao e o cumprimento dessa
// promessa — trocar a string forca o termo a reaparecer para todo mundo.
export const TELEMETRY_CONSENT_VERSION = "2026-10-02-v4";

/**
 * O consentimento guardado vale para a versao ATUAL do termo?
 *
 * Aceitar a v3 nao e aceitar a v4: a v3 afirmava que a imagem nao era
 * analisada. Sem esta checagem, `record.status === "accepted"` de uma versao
 * velha mantinha a captura rodando enquanto o termo novo ainda estava na tela
 * esperando resposta — exatamente o caso que a v3 prometeu que nao
 * aconteceria.
 */
export function consentimentoEstaVigente(
  record: TelemetryConsentRecord | null | undefined
): boolean {
  return record?.status === "accepted" && record.version === TELEMETRY_CONSENT_VERSION;
}
