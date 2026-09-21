import type { StudyPresence } from '@/services/studyPresence';

/** Match calendar days to the chart/device, not UTC or a rolling 168h window. */
export function summarizeStudyDates(dates: (string | null | undefined)[], now = new Date()): StudyPresence {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - 6);
  const counts = Array<number>(7).fill(0);
  let last = 0;
  const seen = new Set<number>();
  for (const value of dates) {
    const timestamp = value ? new Date(value).getTime() : NaN;
    if (!Number.isFinite(timestamp) || timestamp > now.getTime() || seen.has(timestamp)) continue;
    seen.add(timestamp);
    last = Math.max(last, timestamp);
    for (let day = 0; day < 7; day++) {
      const from = new Date(start); from.setDate(start.getDate() + day);
      const to = new Date(from); to.setDate(from.getDate() + 1);
      if (timestamp >= from.getTime() && timestamp < to.getTime()) counts[day]++;
    }
  }
  return { dias_ativos: counts.filter(Boolean).length, registros_recentes: counts.reduce((a, b) => a + b, 0),
    semana_diaria: counts, ultimo_registro: last ? new Date(last).toISOString() : null };
}
