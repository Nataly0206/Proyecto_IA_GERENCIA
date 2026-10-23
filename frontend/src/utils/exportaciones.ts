import { DataRow } from '../types';
import { convertPounds, WeightUnit } from './weightUnits';

export type ExportGrouping = 'estilo' | 'cliente' | 'ambos';

export function groupExportRows(rows: DataRow[], grouping: ExportGrouping, unit: WeightUnit): DataRow[] {
  const cells = new Map<string, { periodo: string; grupo: string; libras: number }>();
  for (const row of rows) {
    const group = grouping === 'ambos' ? `${row.estilo} · ${row.cliente}` : String(row[grouping] ?? 'Sin dato');
    const period = String(row.periodo ?? 'Total');
    const key = JSON.stringify([period, group]);
    const cell = cells.get(key) ?? { periodo: period, grupo: group, libras: 0 };
    cell.libras += Number(row.libras ?? 0);
    cells.set(key, cell);
  }
  const sum = [...cells.values()].reduce((value, cell) => value + cell.libras, 0);
  return [...cells.values()].map(cell => ({
    ...cell,
    porcentaje: sum > 0 ? cell.libras / sum * 100 : 0,
    libras: convertPounds(cell.libras, unit),
  }));
}
