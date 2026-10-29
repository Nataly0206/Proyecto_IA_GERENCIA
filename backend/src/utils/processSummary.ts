export const PROCESS_NAMES = ['Descabezado', 'Clasificado', 'Pelado', 'IQF'] as const;
export interface ProcessSample { day: string; pounds: number; hours: number }
export function summaryPeriods(today: string) {
  const date = new Date(`${today}T12:00:00Z`);
  const monday = new Date(date);
  monday.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 6) % 7);
  return [
    { key: 'today', label: 'Hoy', from: today, to: today },
    { key: 'week', label: 'Semana', from: monday.toISOString().slice(0, 10), to: today },
    { key: 'month', label: 'Mes', from: `${today.slice(0, 7)}-01`, to: today },
    { key: 'year', label: 'Anual', from: `${today.slice(0, 4)}-01-01`, to: today },
  ];
}
export function summarizeSamples(samples: ProcessSample[], from: string, to: string, averageRates = false) {
  const valid = samples.filter(row => row.day >= from && row.day <= to && Number.isFinite(row.hours) && row.hours > 0 && Number.isFinite(row.pounds) && row.pounds >= 0);
  if (!valid.length) return { rate: null, pounds: 0, hours: 0, groups: 0 };
  const pounds = valid.reduce((sum, row) => sum + row.pounds, 0);
  const hours = valid.reduce((sum, row) => sum + row.hours, 0);
  const rate = averageRates ? valid.reduce((sum, row) => sum + row.pounds / row.hours, 0) / valid.length : pounds / hours;
  return { rate: Math.round(rate * 100) / 100, pounds, hours, groups: valid.length };
}
