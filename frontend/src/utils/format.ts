import { ValueFormat } from '../types';

export function formatValue(value: number, format: ValueFormat = 'number'): string {
  if (!Number.isFinite(value)) return '—';
  switch (format) {
    case 'currency':
      return value.toLocaleString('en-US', {
        style: 'currency',
        currency: 'USD',
        maximumFractionDigits: 2,
      });
    case 'percent':
      return `${value.toLocaleString('en-US', { maximumFractionDigits: 2 })}%`;
    case 'decimal':
      return value.toLocaleString('en-US', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
    case 'number':
    default:
      return value.toLocaleString('en-US', { maximumFractionDigits: 0 });
  }
}

const MESES_CORTOS = [
  'ene',
  'feb',
  'mar',
  'abr',
  'may',
  'jun',
  'jul',
  'ago',
  'sep',
  'oct',
  'nov',
  'dic',
];

/** "2026-06-01" → "01-jun-2026"; "2026-06" → "jun-2026" */
export function formatPeriodo(periodo: string): string {
  const [anio, mes, dia] = periodo.split('-');
  const nombreMes = MESES_CORTOS[Number(mes) - 1];
  if (!nombreMes) return periodo;
  return dia ? `${dia}-${nombreMes}-${anio}` : `${nombreMes}-${anio}`;
}

export function formatCompact(value: number): string {
  if (!Number.isFinite(value)) return '—';
  return value.toLocaleString('en-US', {
    notation: 'compact',
    maximumFractionDigits: 1,
  });
}
