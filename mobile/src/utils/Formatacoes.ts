// src/utils/Formatacoes.ts

export type TimeInput = string | number | Date;

function pad(n: number) {
  return n < 10 ? `0${n}` : String(n);
}

export function toDate(val: TimeInput | undefined | null): Date | null {
  if (!val) return null;
  if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
  if (typeof val === "number") {
    const d = new Date(val);
    return isNaN(d.getTime()) ? null : d;
  }
  // string (ISO, timestamptz do Supabase etc.)
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
}

export function isSameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * Formata data/hora sem depender de Intl (funciona no Hermes).
 * - hoje:      HH:mm
 * - mesmo ano: dd/MM HH:mm
 * - outro ano: dd/MM/aa HH:mm
 */
export function formatAbsolute(d: Date) {
  const now = new Date();
  const hhmm = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
  if (isSameDay(d, now)) return hhmm;

  const ddmm = `${pad(d.getDate())}/${pad(d.getMonth() + 1)}`;
  if (d.getFullYear() === now.getFullYear()) return `${ddmm} ${hhmm}`;

  const yy = String(d.getFullYear()).slice(-2);
  return `${ddmm}/${yy} ${hhmm}`;
}

/**
 * Formata de modo "inteligente": relativo até X horas (default 3h),
 * depois cai para formato absoluto.
 * Exemplos:
 *  - 30s  → "agora"
 *  - 5min → "há 5 min"
 *  - 1h   → "há 1 h"
 *  - 4h   → "26/10 14:30"
 */
export function formatSmartTime(input: TimeInput, opts?: { thresholdHours?: number }) {
  const d = toDate(input);
  if (!d) return String(input ?? "");

  const threshold = Math.max(1, Math.floor(opts?.thresholdHours ?? 3)); // padrão 3h
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  const diffH = Math.floor(diffMin / 60);

  // até 1 min → "agora"
  if (diffMin < 1) return "agora";
  // até 60 min → "há X min"
  if (diffMin < 60) return `há ${diffMin} min`;
  // até threshold horas → "há X h"
  if (diffH < threshold) return `há ${diffH} h`;

  // passou do limite → formato absoluto
  return formatAbsolute(d);
}

/** Útil quando você só quer o absoluto direto aceitando vários tipos */
export function formatAbsoluteFrom(input: TimeInput) {
  const d = toDate(input);
  return d ? formatAbsolute(d) : String(input ?? "");
}
