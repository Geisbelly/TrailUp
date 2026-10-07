import assert from "node:assert/strict";
import test from "node:test";

import {
  TELEMETRY_CONSENT_VERSION,
  consentimentoEstaVigente,
} from "./telemetryConsentVersao";
import type { TelemetryConsentRecord } from "./telemetryConsent";

function registro(over: Partial<TelemetryConsentRecord> = {}): TelemetryConsentRecord {
  return {
    version: TELEMETRY_CONSENT_VERSION,
    status: "accepted",
    updatedAt: new Date().toISOString(),
    cameraPermissionRequested: true,
    cameraPermissionGranted: true,
    preferences: {
      cameraEnabled: true,
      usageEnabled: true,
      performanceEnabled: true,
      chatEnabled: true,
    },
    ...over,
  };
}

test("aceite da versao atual vale", () => {
  assert.equal(consentimentoEstaVigente(registro()), true);
});

test("aceite de versao antiga NAO vale", () => {
  // O caso que motivou o helper: quem aceitou a v3 aceitou um texto que dizia
  // que a imagem nao era analisada.
  assert.equal(consentimentoEstaVigente(registro({ version: "2026-09-30-v3" })), false);
  assert.equal(consentimentoEstaVigente(registro({ version: "2026-04-10-v2" })), false);
});

test("recusa na versao atual nao vira aceite", () => {
  assert.equal(consentimentoEstaVigente(registro({ status: "rejected" })), false);
});

test("ausencia de registro nao vira aceite", () => {
  assert.equal(consentimentoEstaVigente(null), false);
  assert.equal(consentimentoEstaVigente(undefined), false);
});
