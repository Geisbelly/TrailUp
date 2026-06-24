import AsyncStorage from "@react-native-async-storage/async-storage";
import { MaterialCommunityIcons } from "@expo/vector-icons";

import { BrainHexProfile, normalizeBrainHexProfile } from "@/constants/profileImages";

export type MetricsThemeOverride = "auto" | "arena" | "goals" | "mystery" | "analytics" | "squad";
export type MetricsThemeResolved = Exclude<MetricsThemeOverride, "auto">;

export type MetricsThemeOption = {
  key: MetricsThemeOverride;
  label: string;
  description: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
};

const STORAGE_KEY_PREFIX = "trailup:metrics-theme";

export const METRICS_THEME_OPTIONS: MetricsThemeOption[] = [
  {
    key: "auto",
    label: "Automático",
    description: "Usa o perfil BrainHex dominante para escolher o visual mais adequado.",
    icon: "auto-fix",
  },
  {
    key: "arena",
    label: "Arena Tática",
    description: "HUD competitivo com operação, ritmo, rank e status de missão.",
    icon: "crosshairs-gps",
  },
  {
    key: "goals",
    label: "Metas",
    description: "Painel focado em marcos, checklist, progresso e próximos objetivos.",
    icon: "target",
  },
  {
    key: "mystery",
    label: "Mistério",
    description: "Transforma progresso em mapa, pistas, descobertas e exploração.",
    icon: "map-search-outline",
  },
  {
    key: "analytics",
    label: "Painel Analítico",
    description: "Leitura clara e direta do desempenho, atenção e evolução do aluno.",
    icon: "chart-box-outline",
  },
  {
    key: "squad",
    label: "Squad",
    description: "Destaque para presença, ranking, conquistas e energia de grupo.",
    icon: "account-group-outline",
  },
];

function buildStorageKey(userId?: string | null) {
  return `${STORAGE_KEY_PREFIX}:${userId ?? "anon"}`;
}

export function getMetricsThemeOption(theme: MetricsThemeOverride) {
  return METRICS_THEME_OPTIONS.find((item) => item.key === theme) ?? METRICS_THEME_OPTIONS[0];
}

export function getMetricsThemeLabel(theme: MetricsThemeOverride) {
  return getMetricsThemeOption(theme).label;
}

export function resolveProfileMetricsTheme(profileName?: string | null): MetricsThemeResolved {
  const normalized = normalizeBrainHexProfile(profileName);

  if (normalized === "conqueror" || normalized === "daredevil" || normalized === "survivor") {
    return "arena";
  }
  if (normalized === "achiever") return "goals";
  if (normalized === "seeker") return "mystery";
  if (normalized === "socializer") return "squad";
  return "analytics";
}

export function resolveMetricsTheme(
  profileName?: string | null,
  override: MetricsThemeOverride = "auto"
): MetricsThemeResolved {
  return override === "auto" ? resolveProfileMetricsTheme(profileName) : override;
}

export async function getMetricsThemePreference(userId?: string | null): Promise<MetricsThemeOverride> {
  try {
    const raw = await AsyncStorage.getItem(buildStorageKey(userId));
    if (!raw) return "auto";
    const normalized = raw.trim().toLowerCase() as MetricsThemeOverride;
    return METRICS_THEME_OPTIONS.some((item) => item.key === normalized) ? normalized : "auto";
  } catch (error) {
    console.warn("[MetricsTheme] Falha ao ler preferencia:", error);
    return "auto";
  }
}

export async function setMetricsThemePreference(
  userId: string | null | undefined,
  value: MetricsThemeOverride
): Promise<void> {
  try {
    await AsyncStorage.setItem(buildStorageKey(userId), value);
  } catch (error) {
    console.warn("[MetricsTheme] Falha ao salvar preferencia:", error);
  }
}

export function getThemeHintProfiles(theme: MetricsThemeResolved): BrainHexProfile[] {
  switch (theme) {
    case "arena":
      return ["conqueror", "daredevil", "survivor"];
    case "goals":
      return ["achiever"];
    case "mystery":
      return ["seeker"];
    case "squad":
      return ["socializer"];
    case "analytics":
    default:
      return ["mastermind"];
  }
}
