import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  CHAVE_LEGADA_DO_CONSENTIMENTO,
  TELEMETRY_CONSENT_VERSION,
  chaveDoConsentimento,
} from "./telemetryConsentVersao";

// Reexportado para nao quebrar quem ja importava daqui. A definicao mora em
// `telemetryConsentVersao.ts`, que nao puxa AsyncStorage e por isso carrega
// em Node — mesmo motivo que separou `telemetriaPayload.ts` do cliente
// Supabase.
export {
  TELEMETRY_CONSENT_VERSION,
  consentimentoEstaVigente,
} from "./telemetryConsentVersao";

// O aceite e POR ALUNO (#195). Sem aluno definido nao ha consentimento: quem
// le recebe `null` e a coleta nao roda.
let alunoDoConsentimento: string | null = null;

export function obterAlunoDoConsentimento(): string | null {
  return alunoDoConsentimento;
}

/**
 * Troca o dono do consentimento local (login, troca de conta, logout) e avisa
 * os assinantes com o registro DESTE aluno. A chave antiga, por aparelho, e
 * apagada sem ser herdada: nao da para saber de qual aluno ela era.
 */
export async function definirAlunoDoConsentimento(alunoId: string | null) {
  const proximo = alunoId && alunoId.trim() ? alunoId.trim() : null;
  if (proximo === alunoDoConsentimento) return;
  alunoDoConsentimento = proximo;
  try {
    await AsyncStorage.removeItem(CHAVE_LEGADA_DO_CONSENTIMENTO);
  } catch {
    // limpar a chave antiga e higiene; falhar aqui nao muda nada
  }
  const record = await getTelemetryConsentRecord();
  telemetryConsentListeners.forEach((listener) => {
    try {
      listener(record);
    } catch {
      // ignora listener quebrado
    }
  });
}

type TelemetryConsentListener = (record: TelemetryConsentRecord | null) => void;
const telemetryConsentListeners = new Set<TelemetryConsentListener>();

export type TelemetryConsentStatus = "accepted" | "rejected";

export type TelemetryConsentPreferences = {
  cameraEnabled: boolean;
  usageEnabled: boolean;
  performanceEnabled: boolean;
  chatEnabled: boolean;
};

export type TelemetryConsentRecord = {
  version: string;
  status: TelemetryConsentStatus;
  updatedAt: string;
  cameraPermissionRequested: boolean;
  cameraPermissionGranted: boolean;
  preferences: TelemetryConsentPreferences;
};

export const DEFAULT_TELEMETRY_PREFERENCES: TelemetryConsentPreferences = {
  // DESLIGADA por padrao. Consentimento para dado biometrico nao pode vir
  // pre-marcado (LGPD art. 11), e o publico e escolar (art. 14). Ligar e acao
  // explicita do aluno no toggle de Perfil -> Coleta e acessos, que e quem
  // pede a permissao do SO. Ver issue #195.
  cameraEnabled: false,
  usageEnabled: true,
  performanceEnabled: true,
  chatEnabled: true,
};

function sanitizePreferences(
  raw: Partial<TelemetryConsentPreferences> | null | undefined,
  fallback: TelemetryConsentPreferences
): TelemetryConsentPreferences {
  return {
    cameraEnabled:
      typeof raw?.cameraEnabled === "boolean"
        ? raw.cameraEnabled
        : fallback.cameraEnabled,
    usageEnabled:
      typeof raw?.usageEnabled === "boolean"
        ? raw.usageEnabled
        : fallback.usageEnabled,
    performanceEnabled:
      typeof raw?.performanceEnabled === "boolean"
        ? raw.performanceEnabled
        : fallback.performanceEnabled,
    chatEnabled:
      typeof raw?.chatEnabled === "boolean"
        ? raw.chatEnabled
        : fallback.chatEnabled,
  };
}

export async function getTelemetryConsentRecord(): Promise<TelemetryConsentRecord | null> {
  const chave = chaveDoConsentimento(alunoDoConsentimento);
  if (!chave) return null;
  try {
    const raw = await AsyncStorage.getItem(chave);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<TelemetryConsentRecord> | null;
    if (!parsed?.version || !parsed?.status) return null;
    const legacyDefault =
      parsed.status === "rejected"
        ? {
            cameraEnabled: false,
            usageEnabled: false,
            performanceEnabled: false,
            chatEnabled: false,
          }
        : {
            // Permissao do SO concedida NAO e consentimento para analisar: o
            // aparelho deixar a camera disponivel e outra coisa de o aluno
            // querer que ela seja usada. Registro sem preferencia explicita
            // entra desligado.
            cameraEnabled: false,
            usageEnabled: true,
            performanceEnabled: true,
            chatEnabled: true,
          };

    return {
      version: parsed.version,
      status: parsed.status,
      updatedAt: parsed.updatedAt ?? new Date().toISOString(),
      cameraPermissionRequested: parsed.cameraPermissionRequested === true,
      cameraPermissionGranted: parsed.cameraPermissionGranted === true,
      preferences: sanitizePreferences(
        parsed.preferences as Partial<TelemetryConsentPreferences> | null | undefined,
        legacyDefault
      ),
    };
  } catch {
    return null;
  }
}

async function saveTelemetryConsentRecord(record: TelemetryConsentRecord) {
  const chave = chaveDoConsentimento(alunoDoConsentimento);
  if (!chave) {
    // Sem aluno nao se grava consentimento: ficaria sem dono.
    console.warn("[Consentimento] sem aluno definido; decisao nao gravada localmente");
    return;
  }
  await AsyncStorage.setItem(chave, JSON.stringify(record));
  telemetryConsentListeners.forEach((listener) => {
    try {
      listener(record);
    } catch {
      // ignora listener quebrado para não interromper fluxo principal
    }
  });
}

export function subscribeTelemetryConsentChanges(listener: TelemetryConsentListener) {
  telemetryConsentListeners.add(listener);
  return () => {
    telemetryConsentListeners.delete(listener);
  };
}

export async function setTelemetryConsentAccepted(params: {
  cameraPermissionRequested: boolean;
  cameraPermissionGranted: boolean;
  preferences?: Partial<TelemetryConsentPreferences>;
}) {
  // O fallback NAO deriva mais `cameraEnabled` da permissao do SO: aceitar os
  // termos deixa de ligar a camera. Quem liga e o toggle, por acao explicita.
  const safePreferences = sanitizePreferences(params.preferences, DEFAULT_TELEMETRY_PREFERENCES);

  const record: TelemetryConsentRecord = {
    version: TELEMETRY_CONSENT_VERSION,
    status: "accepted",
    updatedAt: new Date().toISOString(),
    cameraPermissionRequested: params.cameraPermissionRequested,
    cameraPermissionGranted: params.cameraPermissionGranted,
    preferences: safePreferences,
  };
  await saveTelemetryConsentRecord(record);
  return record;
}

export async function setTelemetryConsentRejected() {
  const record: TelemetryConsentRecord = {
    version: TELEMETRY_CONSENT_VERSION,
    status: "rejected",
    updatedAt: new Date().toISOString(),
    cameraPermissionRequested: false,
    cameraPermissionGranted: false,
    preferences: {
      cameraEnabled: false,
      usageEnabled: false,
      performanceEnabled: false,
      chatEnabled: false,
    },
  };
  await saveTelemetryConsentRecord(record);
  return record;
}

export async function setTelemetryConsentPreferences(
  params: Partial<TelemetryConsentPreferences> & {
    cameraPermissionRequested?: boolean;
    cameraPermissionGranted?: boolean;
  }
) {
  const current = await getTelemetryConsentRecord();
  const nextPreferences = sanitizePreferences(params, current?.preferences ?? DEFAULT_TELEMETRY_PREFERENCES);
  const nextCameraGranted =
    typeof params.cameraPermissionGranted === "boolean"
      ? params.cameraPermissionGranted
      : current?.cameraPermissionGranted === true;
  const nextCameraRequested =
    typeof params.cameraPermissionRequested === "boolean"
      ? params.cameraPermissionRequested
      : current?.cameraPermissionRequested === true;

  const record: TelemetryConsentRecord = {
    version: TELEMETRY_CONSENT_VERSION,
    status: "accepted",
    updatedAt: new Date().toISOString(),
    cameraPermissionRequested: nextCameraRequested,
    cameraPermissionGranted: nextCameraGranted,
    preferences: {
      ...nextPreferences,
      cameraEnabled: nextPreferences.cameraEnabled && nextCameraGranted,
    },
  };

  await saveTelemetryConsentRecord(record);
  return record;
}
