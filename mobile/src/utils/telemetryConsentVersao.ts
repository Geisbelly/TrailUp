/**
 * Versao do termo e a regra de vigencia — sem AsyncStorage, para carregar em
 * Node e poder ser testado (mesmo motivo de `telemetriaPayload.ts`).
 */

import type { TelemetryConsentRecord } from "./telemetryConsent";

// v4: camera emotion analysis was described in the consent terms.
// v5 (#195): the terms gained the restricted mode and responsible-adult consent.
// v6 (#30): the terms distinguish web from camera-capable platforms, state that
// behavioral telemetry does not infer emotion, and disclose the US image transfer.
// Reacceptance is required.
export const TELEMETRY_CONSENT_VERSION = "2026-11-05-v6";

// Chave antiga, por APARELHO: num celular compartilhado (comum na escola), o
// aceite de um aluno valia para o proximo que entrasse. Agora e por aluno.
export const CHAVE_LEGADA_DO_CONSENTIMENTO = "trailup:telemetry-consent";

export function chaveDoConsentimento(alunoId: string | null | undefined): string | null {
  const id = typeof alunoId === "string" ? alunoId.trim() : "";
  return id ? `${CHAVE_LEGADA_DO_CONSENTIMENTO}:${id}` : null;
}

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
