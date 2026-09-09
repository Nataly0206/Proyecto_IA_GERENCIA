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

/** Libras peladas hoy por estilo (fuente: STB_data.dbo.PES_ASIGNACION_LIBRAS_EMPLEADOS). */
export interface PeladoLibrasHoyEstilo {
  estilo: string;
  libras: number;
}

export interface PeladoLibrasHoyResponse {
  /** Día mostrado (YYYY-MM-DD), siempre hoy */
  dia: string;
  /** Timestamp ISO de esta lectura */
  actualizado: string;
  estilos: PeladoLibrasHoyEstilo[];
  total: number;
}

/** Libras peladas hoy por talla (fuente: STB_data.dbo.PES_ASIGNACION_LIBRAS_EMPLEADOS). */
export interface PeladoLibrasHoyTalla {
  talla: string;
  libras: number;
}

export interface PeladoLibrasHoyTallaResponse {
  /** Día mostrado (YYYY-MM-DD), siempre hoy */
  dia: string;
  /** Timestamp ISO de esta lectura */
  actualizado: string;
  tallas: PeladoLibrasHoyTalla[];
  total: number;
}

/**
 * Actividad de pelado por sala (fuente: STB_data, PES_SALAS + DCP_LINEAS +
 * PES_ASIGNACION_LIBRAS_EMPLEADOS). `personasActivas` es un estimado de
 * cuánta gente está pelando en la sala: empleados distintos con pago de
 * destajo de pelado hoy (individual + grupal), igual que
 * `empleadosRegistrandoHoy`. `librasUltimos30Min` usa una ventana de los
 * últimos 30 minutos; el resto es acumulado del día.
 */
export interface PeladoSalaRow {
  sala: string;
  /** Estimado de personas pelando en la sala = empleados con destajo hoy */
  personasActivas: number;
  librasUltimos30Min: number;
  /** Total acumulado de libras peladas hoy en la sala */
  librasPeladasHoy: number;
  /** Promedio = librasPeladasHoy / horas transcurridas del día (mismo divisor para todas las salas) */
  librasPorHora: number;
  pagoAcumuladoHoy: number;
  empleadosRegistrandoHoy: number;
}

export interface PeladoPorSalaResponse {
  /** Día mostrado (YYYY-MM-DD), siempre hoy */
  dia: string;
  /** Timestamp ISO de esta lectura */
  actualizado: string;
  /** Horas desde el primer registro de pelado de hoy hasta ahora; divisor de `librasPorHora` */
  horasTranscurridas: number;
  salas: PeladoSalaRow[];
}

/* ------------------------------------------------------------------ */
/* Módulos de proceso: contadores "en vivo" (día / semana actual)      */
/* ------------------------------------------------------------------ */

/** Recepción de camarón de finca — contadores del día en curso. */
export interface RecepcionResumen {
  dia: string;
  actualizado: string;
  librasRecibidasHoy: number;
  librasRecibidasSemana: number;
  librasRecibidasMes: number;
  librasPendientesProcesar: number;
}

/** Descabezado — contadores del día en curso. */
export interface DescabezadoResumen {
  dia: string;
  actualizado: string;
  librasDescabezadasDia: number;
  librasDescabezadasSemana: number;
  librasDescabezadasMes: number;
  personasDia: number;
}

/** Clasificado — libras clasificadas del día, la semana y el mes en curso. */
export interface ClasificadoResumen {
  dia: string;
  actualizado: string;
  semanaInicio: string;
  semanaFin: string;
  librasClasificadasHoy: number;
  librasClasificadasSemana: number;
  librasClasificadasMes: number;
}

/** Exportaciones — contadores de la semana en curso (lunes a domingo). */
export interface ExportacionesResumen {
  semanaInicio: string;
  semanaFin: string;
  actualizado: string;
  librasFrancia: number;
  librasUK: number;
  librasACHolding: number;
  librasTerceros: number;
  librasTotal: number;
}

/**
 * Compra de materia prima — libras recibidas hoy, semana y mes.
 * `librasPromedioSemana` = libras del mes / nº de semanas del mes actual.
 */
export interface CompraMpResumen {
  semanaInicio: string;
  semanaFin: string;
  actualizado: string;
  librasRecibidasHoy: number;
  librasRecibidasSemana: number;
  librasRecibidasMes: number;
  librasPromedioSemana: number;
}
