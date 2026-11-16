export function summarizePeelingWorkdays(rows: { dia: string; libras: number }[], year: number, today: string) {
  const currentYear = Number(today.slice(0, 4));
  const currentMonth = Number(today.slice(5, 7));
  const monthsCompleted = year < currentYear ? 12 : currentMonth - 1;
  const totals = new Map<string, number>();
  for (const row of rows) {
    if (!row.dia.startsWith(`${year}-`) || row.dia > today) continue;
    totals.set(row.dia, (totals.get(row.dia) ?? 0) + row.libras);
  }
  const days = [...totals].filter(([, pounds]) => pounds > 0);
  const months = Array.from({ length: 12 }, (_, index) => {
    const month = index + 1;
    const prefix = `${year}-${String(month).padStart(2, '0')}`;
    return { month, days: days.filter(([day]) => day.startsWith(prefix)).length,
      status: year < currentYear || month < currentMonth ? 'complete' : month === currentMonth ? 'current' : 'future' };
  });
  const completedDays = months.slice(0, monthsCompleted).reduce((sum, month) => sum + month.days, 0);
  return {
    year, through: year < currentYear ? `${year}-12-31` : today,
    daysWorked: days.length, monthsCompleted,
    averageDaysPerMonth: monthsCompleted ? completedDays / monthsCompleted : null,
    currentMonthDays: year === currentYear ? months[currentMonth - 1].days : null,
    poundsPerDay: days.length ? days.reduce((sum, [, pounds]) => sum + pounds, 0) / days.length : null,
    months,
  };
}
