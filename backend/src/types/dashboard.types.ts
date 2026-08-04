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

export interface PeladoStyleRow {
  estilo: string;
  libras: number;
  porcentaje: number;
}

/** Celda del reporte de libras peladas por estilo, agrupada por período (día o mes). */
export interface PeladoStylePeriodRow {
  /** "YYYY-MM-DD" para diario, "YYYY-MM" para mensual */
  periodo: string;
  estilo: string;
  libras: number;
}

export interface PeladoTallaRow {
  talla: string;
  libras: number;
  porcentaje: number;
}

/** Celda del reporte de libras peladas por talla, agrupada por período (día o mes). */
export interface PeladoTallaPeriodRow {
  /** "YYYY-MM-DD" para diario, "YYYY-MM" para mensual */
  periodo: string;
  talla: string;
  libras: number;
}

/** Contador en vivo de un estilo pelado (día de producción en curso) */
export interface PeladoLiveStyle {
  estilo: string;
  libras: number;
  ultimaCaja: string;
  minutosDesdeUltima: number;
  /** true si registró producción en los últimos 15 minutos */
  activo: boolean;
}

export interface PeladoLiveResponse {
  /** Día de producción mostrado (YYYY-MM-DD) */
  dia: string;
  /** Timestamp ISO de esta lectura */
  actualizado: string;
  estilos: PeladoLiveStyle[];
  /**
   * Órdenes de producción con lectura en los últimos 15 minutos, como
   * aproximación indirecta de actividad (no hay conteo real de personal
   * en planta disponible en la base de datos).
   */
  ordenesActivas: number;
}

/**
 * Personal y pago real de pelado (fuente: STB_data.dbo.V_PagosxPeladoIndividualPBI).
 * `empleados` = headcount real (COUNT DISTINCT IdEmpleado), a diferencia
 * del proxy `ordenesActivas` de PeladoLiveResponse.
 */
export interface PeladoPersonalRow {
  empleados: number;
  libras: number;
  valor: number;
}

/** Celda del reporte de personal de pelado, agrupada por período (día o mes). */
export interface PeladoPersonalPeriodRow {
  /** "YYYY-MM-DD" para diario, "YYYY-MM" para mensual */
  periodo: string;
  empleados: number;
  libras: number;
  valor: number;
}
