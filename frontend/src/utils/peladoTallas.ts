import type { DataRow } from '../types';

export function normalizePeladoDetailSize(talla: string): string {
  return /^61\s*[-/]\s*70(?:\s+(?:ALTO|NORMAL|BAJO))?$/i.test(talla.trim()) ? '61-70' : talla;
}

const PT_BY_SIZE: Record<string, string> = {
  '16-20': '21-25',
  '21-25': '26-30',
  '26-30': '31-35',
  '31-35': '36-40',
  '36-40': '41-50',
  '41-50': '51-60',
  '51-60': '61-70',
  '61-70': '71-90',
  '71-90': '91-110',
  '91-110': '110-130',
  '110-130': '130-150',
  '130-150': '150-200',
  '150-200': '200Over',
  '200OVER': 'Pedazos',
  'PEDAZOS': 'Pedazos',
  'MIX PEDAZOS': 'Pedazos',
  'LARVA ENTERA': 'Larva',
  'MIXTO': 'Mixto',
};

export function getPeladoDetailPtSize(talla: string): string {
  const normalized = normalizePeladoDetailSize(talla.trim()).toUpperCase()
    .replace(/\s*[-/]\s*/g, '-');
  return PT_BY_SIZE[normalized] ?? '—';
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

/** Las dos tallas con más libras y su participación sobre el mismo total. */
export function getPeladoSizeLeaders(rows: { talla: string; libras: number }[]) {
  const sizes = new Map<string, number>();
  for (const row of rows) {
    const talla = normalizePeladoDetailSize(row.talla.trim());
    if (!talla || !Number.isFinite(row.libras) || row.libras <= 0) continue;
    sizes.set(talla, (sizes.get(talla) ?? 0) + row.libras);
  }
  const ranked = [...sizes].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const total = ranked.reduce((sum, [, libras]) => sum + libras, 0);
  const label = (row: [string, number] | undefined) => row && total > 0
    ? `${row[0]} (${(row[1] / total * 100).toFixed(2)}%)`
    : null;
  return { principal: label(ranked[0]), siguiente: label(ranked[1]) };
}
