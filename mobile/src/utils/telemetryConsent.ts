import AsyncStorage from "@react-native-async-storage/async-storage";

export const TELEMETRY_CONSENT_VERSION = "2026-04-10-v2";
const TELEMETRY_CONSENT_STORAGE_KEY = "trailup:telemetry-consent";

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
  cameraEnabled: true,
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
  try {
    const raw = await AsyncStorage.getItem(TELEMETRY_CONSENT_STORAGE_KEY);
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
            cameraEnabled: parsed.cameraPermissionGranted === true,
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
  await AsyncStorage.setItem(
    TELEMETRY_CONSENT_STORAGE_KEY,
    JSON.stringify(record)
  );
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
  const safePreferences = sanitizePreferences(params.preferences, {
    ...DEFAULT_TELEMETRY_PREFERENCES,
    cameraEnabled: params.cameraPermissionGranted === true,
  });

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
