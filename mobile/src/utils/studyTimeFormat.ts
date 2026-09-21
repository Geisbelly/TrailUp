export function formatStudyMinutes(value?: number | null): string {
  const minutes = Number(value ?? 0);
  const seconds = Number.isFinite(minutes) ? Math.max(0, Math.round(minutes * 60)) : 0;
  if (seconds < 60) return `${seconds}s`;
  const wholeMinutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  if (wholeMinutes < 60) return `${wholeMinutes}min${remainder ? ` ${remainder}s` : ''}`;
  const hours = Math.floor(wholeMinutes / 60);
  return `${hours}h${wholeMinutes % 60 ? ` ${wholeMinutes % 60}min` : ''}`;
}
