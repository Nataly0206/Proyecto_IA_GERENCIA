export type ReportPeriod = 'dia' | 'semana' | 'mes';

/** Semanas ISO, de lunes a domingo, independientes de la zona horaria. */
export function reportPeriodOf(day: string, period: ReportPeriod): string {
  if (period === 'dia') return day.slice(0, 10);
  if (period === 'mes') return day.slice(0, 7);
  const date = new Date(`${day.slice(0, 10)}T00:00:00Z`);
  const weekday = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - weekday);
  const year = date.getUTCFullYear();
  const start = new Date(Date.UTC(year, 0, 1));
  const week = Math.ceil(((date.getTime() - start.getTime()) / 86400000 + 1) / 7);
  return `${year}-W${String(week).padStart(2, '0')}`;
}
