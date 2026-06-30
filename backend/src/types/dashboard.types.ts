export interface DashboardFilters {
  /** Formato YYYY-MM-DD */
  fechaInicial: string;
  /** Formato YYYY-MM-DD */
  fechaFinal: string;
  /** "A" | "B" | "Turno A" | "Turno B" | undefined (todos) */
  turno?: string;
}

export interface NetProcessRow {
  proceso: string;
  libras: number;
  porcentaje: number;
}

/** Celda del reporte de libras netas por proceso, agrupada por período (día o mes). */
export interface NetProcessPeriodRow {
  /** "YYYY-MM-DD" para diario, "YYYY-MM" para mensual */
  periodo: string;
  proceso: string;
  libras: number;
}

/** Contador en vivo de una línea IQF (día de producción en curso) */
export interface IqfLiveLine {
  linea: string;
  libras: number;
  cajas: number;
  librasUltimaHora: number;
  librasPorHora: number;
  /** "HH:MM" hora local de planta */
  primeraCaja: string;
  ultimaCaja: string;
  minutosDesdeUltima: number;
  /** true si registró cajas en los últimos 15 minutos */
  activa: boolean;
}

export interface IqfLiveResponse {
  /** Día de producción mostrado (YYYY-MM-DD) */
  dia: string;
  /** Timestamp ISO de esta lectura */
  actualizado: string;
  lineas: IqfLiveLine[];
}

/**
 * Celda del reporte "Rendimientos IQF x Hora": una línea IQF en un
 * período (día o mes). `librasPorHora` es el promedio simple de los
 * rendimientos por grupo (línea/estilo/ejecutivo/turno/día), igual que
 * el reporte oficial de la planta; `grupos` permite recalcular promedios
 * ponderados al totalizar filas/columnas.
 */
export interface IqfRateRow {
  /** "YYYY-MM-DD" para diario, "YYYY-MM" para mensual */
  periodo: string;
  linea: string;
  libras: number;
  horas: number;
  grupos: number;
  librasPorHora: number;
}
