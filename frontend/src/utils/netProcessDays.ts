import type { DataRow } from '../types';

/** Cuenta cada fecha una sola vez entre los procesos visibles de cada período. */
export function withSelectedProcessDays(rows: DataRow[]): DataRow[] {
  const datesByPeriod = new Map<string, Set<string>>();
  for (const row of rows) {
    const period = String(row.periodo);
    const dates = datesByPeriod.get(period) ?? new Set<string>();
    if (Array.isArray(row.fechasTrabajadas)) {
      for (const date of row.fechasTrabajadas) {
        if (typeof date === 'string') dates.add(date);
      }
    }
    datesByPeriod.set(period, dates);
  }
  return rows.map((row) => ({
    ...row,
    diasTrabajados: datesByPeriod.get(String(row.periodo))?.size ?? 0,
  }));
}
