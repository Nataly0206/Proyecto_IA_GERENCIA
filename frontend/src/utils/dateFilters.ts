import dayjs from 'dayjs';
import customParseFormat from 'dayjs/plugin/customParseFormat';
import { DashboardFilters } from '../types';

dayjs.extend(customParseFormat);

export function isValidIsoDate(value: string): boolean {
  return dayjs(value, 'YYYY-MM-DD', true).isValid();
}

export function getDateFilterError(filters: DashboardFilters): string | undefined {
  if (!isValidIsoDate(filters.fechaInicial) || !isValidIsoDate(filters.fechaFinal)) {
    return 'Selecciona fechas válidas.';
  }

  if (filters.fechaInicial > filters.fechaFinal) {
    return 'La fecha inicial no puede ser posterior a la fecha final.';
  }

  return undefined;
}
