import type { DataRow } from '../types';

export function normalizePeladoDetailSize(talla: string): string {
  return /^61\s*-\s*70\s+(ALTO|NORMAL)$/i.test(talla.trim()) ? '61-70' : talla;
}

export function mergePeladoDetailSizes(rows: DataRow[]): DataRow[] {
  const grouped = new Map<string, DataRow>();
  for (const row of rows) {
    const talla = normalizePeladoDetailSize(String(row.talla ?? 'Sin talla'));
    const current = grouped.get(talla);
    grouped.set(talla, { ...row, talla, libras: Number(current?.libras ?? 0) + Number(row.libras ?? 0) });
  }
  return Array.from(grouped.values());
}
