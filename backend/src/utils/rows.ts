import { SqlRow } from '../services/sql.service';

/**
 * Los SPs devuelven columnas con nombres como "TOTAL POUNDS", "TotalPounds",
 * "Libras Totales", etc. Estas utilidades resuelven el valor sin depender
 * del formato exacto (mayúsculas, espacios, guiones bajos).
 */
const normalizeKey = (key: string): string =>
  key
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '');

export function pick(row: SqlRow, ...aliases: string[]): unknown {
  const map = new Map<string, unknown>();
  for (const key of Object.keys(row)) {
    map.set(normalizeKey(key), row[key]);
  }
  for (const alias of aliases) {
    const value = map.get(normalizeKey(alias));
    if (value !== undefined && value !== null) return value;
  }
  return undefined;
}

export function pickNumber(row: SqlRow, ...aliases: string[]): number {
  const value = pick(row, ...aliases);
  if (value === undefined) return 0;
  const num = typeof value === 'number' ? value : Number(String(value).replace(/,/g, ''));
  return Number.isFinite(num) ? num : 0;
}

export function pickString(row: SqlRow, ...aliases: string[]): string {
  const value = pick(row, ...aliases);
  if (value === undefined) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).trim();
}

export const matchesText = (a: string, b: string): boolean =>
  normalizeKey(a) === normalizeKey(b);

/**
 * Compara turnos tolerando el prefijo "Turno": en la base el valor es
 * "Turno A" pero el filtro del dashboard envía "A" (o viceversa).
 */
export const matchesTurno = (value: string, filter: string): boolean => {
  const v = normalizeKey(value);
  const f = normalizeKey(filter);
  return v === f || v === `TURNO${f}` || f === `TURNO${v}`;
};
