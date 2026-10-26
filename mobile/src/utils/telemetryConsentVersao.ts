/**
 * Versao do termo e a regra de vigencia — sem AsyncStorage, para carregar em
 * Node e poder ser testado (mesmo motivo de `telemetriaPayload.ts`).
 */

import type { TelemetryConsentRecord } from "./telemetryConsent";

// v4: a analise de expressao facial passou a existir. A v3 dizia, com todas as
// letras, que "as imagens da camera nao sao analisadas" e prometia pedir
// consentimento de novo antes de isso mudar. Esta versao e o cumprimento dessa
// promessa — trocar a string forca o termo a reaparecer para todo mundo.
//
// v5 (#195): o termo passou a explicar o modo restrito e o termo separado do
// responsavel para menores de 18. E a chave local passou a ser por aluno, entao
// o aceite antigo (por aparelho) nao vale mais de qualquer jeito.
export const TELEMETRY_CONSENT_VERSION = "2026-10-24-v5";

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
