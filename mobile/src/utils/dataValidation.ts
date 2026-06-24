export function normalizePositiveInteger(value: unknown): number | null {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

export function normalizeNonNegativeNumber(
  value: unknown,
  fallback = 0,
  precision = 4
): number {
  const parsed = Number(value);
  const base = Number.isFinite(parsed) ? Math.max(0, parsed) : Math.max(0, Number(fallback) || 0);
  const factor = 10 ** Math.max(0, precision);
  return Math.round(base * factor) / factor;
}

export function normalizeNullableNonNegativeNumber(
  value: unknown,
  precision = 4
): number | null {
  if (value == null) return null;
  return normalizeNonNegativeNumber(value, 0, precision);
}

export function clampPercent(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return Math.max(0, Math.min(100, Number(fallback) || 0));
  }
  return Math.max(0, Math.min(100, parsed));
}

export function normalizeEventType(input: unknown, fallback = "atividade"): string {
  const raw = String(input ?? "").trim().toLowerCase();
  const normalized = raw
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");

  return normalized || fallback;
}

export function normalizeReferencia(input: unknown): string | null {
  if (input == null) return null;
  const normalized = String(input).trim();
  if (!normalized) return null;

  if (/^\d+$/.test(normalized)) {
    return normalized;
  }

  if (/^[^:]+:[0-9]+$/.test(normalized)) {
    return normalized;
  }

  return null;
}
