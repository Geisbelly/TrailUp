export interface OptionalScoreParseResult {
  value: number | null;
  isValid: boolean;
  isEmpty: boolean;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function parseOptionalPositiveScore(value: unknown): OptionalScoreParseResult {
  if (value === null || value === undefined) {
    return { value: null, isValid: true, isEmpty: true };
  }

  if (typeof value === "number") {
    if (!Number.isFinite(value) || value <= 0) {
      return { value: null, isValid: false, isEmpty: false };
    }
    return { value: round2(value), isValid: true, isEmpty: false };
  }

  const normalized = String(value).replace(",", ".").trim();
  if (!normalized) {
    return { value: null, isValid: true, isEmpty: true };
  }

  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return { value: null, isValid: false, isEmpty: false };
  }

  return { value: round2(parsed), isValid: true, isEmpty: false };
}

export function normalizeOptionalPositiveScore(value: unknown): number | null {
  const parsed = parseOptionalPositiveScore(value);
  if (!parsed.isValid) return null;
  return parsed.value;
}

export function scoreToInputString(value: unknown): string {
  const normalized = normalizeOptionalPositiveScore(value);
  return normalized === null ? "" : String(normalized);
}
