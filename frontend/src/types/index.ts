/* ------------------------------------------------------------------ */
/* Filtros globales                                                    */
/* ------------------------------------------------------------------ */

export interface DashboardFilters {
  fechaInicial: string; // YYYY-MM-DD
  fechaFinal: string; // YYYY-MM-DD
  turno: string; // '' = todos
}

export const TURNOS = ['A', 'B'] as const;

/* ------------------------------------------------------------------ */
/* Respuestas de la API                                                */
/* ------------------------------------------------------------------ */

export type DataRow = Record<string, unknown>;

/** Libras congeladas netas (sin FRESH TAIL ni reempaque) por proceso */
export interface NetProcessRow extends DataRow {
  proceso: string;
  libras: number;
  porcentaje: number;
}

/** Libras netas por proceso, agrupadas por período (día o mes) */
export interface NetProcessPeriodRow extends DataRow {
  periodo: string; // "YYYY-MM-DD" diario, "YYYY-MM" mensual
  proceso: string;
  libras: number;
}

/**
 * Celda del reporte "Rendimientos IQF x Hora": una línea IQF en un
 * período. `librasPorHora` es el promedio simple de los rendimientos por
 * grupo (misma fórmula del reporte oficial de la planta); `grupos`
 * permite recalcular los promedios al totalizar filas/columnas.
 */
export interface IqfRateRow extends DataRow {
  periodo: string; // "YYYY-MM-DD" diario, "YYYY-MM" mensual
  linea: string;
  libras: number;
  horas: number;
  grupos: number;
  librasPorHora: number;
}

export type DashboardEndpoint =
  | 'libras-netas-proceso'
  | 'libras-netas-proceso-dia'
  | 'libras-netas-proceso-mes'
  | 'iqf-libras-hora-dia'
  | 'iqf-libras-hora-mes';

/** Contador en vivo de una línea IQF (día de producción en curso) */
export interface IqfLiveLine {
  linea: string;
  libras: number;
  cajas: number;
  librasUltimaHora: number;
  librasPorHora: number;
  primeraCaja: string; // "HH:MM" hora de planta
  ultimaCaja: string;
  minutosDesdeUltima: number;
  activa: boolean;
}

export interface IqfLiveResponse {
  dia: string; // YYYY-MM-DD del día de producción mostrado
  actualizado: string; // ISO timestamp de la lectura
  lineas: IqfLiveLine[];
}

/* ------------------------------------------------------------------ */
/* Configuración dinámica de gráficos (contrato para el Agente IA)     */
/*                                                                     */
/* Ningún gráfico del dashboard está hardcodeado: cada widget se       */
/* construye a partir de un ChartConfig serializable en JSON. En la    */
/* Fase 2, el agente de IA generará estos objetos en tiempo real.      */
/* ------------------------------------------------------------------ */

export type ChartType = 'bar' | 'column' | 'line' | 'area' | 'donut' | 'pie' | 'table' | 'cards';

/* ------------------------------------------------------------------ */
/* Tipos del Asistente IA                                              */
/* ------------------------------------------------------------------ */

/** Configuración de gráfica generada por el agente IA (sin endpoint) */
export interface AiChartConfig {
  id: string;
  type: Exclude<ChartType, 'table'>;
  title: string;
  subtitle?: string;
  xField: string;
  yField: string | string[];
  seriesField?: string;
  seriesNames?: string[];
  valueFormat?: ValueFormat;
  sort?: ChartSort;
  colors?: string[];
}

/** Gráfica + datos devueltos por el agente IA */
export interface AiChartResult {
  config: AiChartConfig;
  rows: DataRow[];
}

/** Respuesta del backend /api/ai/chat */
export interface AiChatResponse {
  message: string;
  charts: AiChartResult[];
}

/** Mensaje en la conversación del panel de IA */
export interface AiMessage {
  role: 'user' | 'assistant';
  content: string;
  charts?: AiChartResult[];
  timestamp: string;
}

export type ValueFormat = 'number' | 'decimal' | 'percent' | 'currency';

export interface ChartSort {
  field: string;
  direction: 'asc' | 'desc';
}

export interface ChartGridSpan {
  xs: number;
  md: number;
  lg?: number;
}

export interface ChartConfig {
  /** Identificador único del widget */
  id: string;
  /** Tipo de visualización */
  type: ChartType;
  /** Título mostrado en la tarjeta */
  title: string;
  /** Subtítulo opcional */
  subtitle?: string;
  /** Endpoint de datos: /api/dashboard/{endpoint} */
  endpoint: DashboardEndpoint;
  /** Campo del eje X / etiquetas (filas en type "table") */
  xField: string;
  /** Etiqueta de la primera columna en type "table" */
  xLabel?: string;
  /** Campo(s) numérico(s) a graficar */
  yField: string | string[];
  /** Campo que pivotea en columnas (type "table") o en series */
  seriesField?: string;
  /** Valores de serie que no deben mostrarse en la tabla/gráfica */
  excludedSeriesValues?: string[];
  /** Cantidad máxima de períodos más recientes que se deben mostrar */
  maxPeriods?: number;
  /** Campo de peso para promedios ponderados al totalizar (type "table") */
  weightField?: string;
  /** Operación utilizada para los totales de una tabla pivote */
  totalAggregation?: 'weightedAverage' | 'sum';
  /**
   * Vista alternativa de gráfica para widgets type "table": habilita el
   * selector Tabla/Gráfica y define el tipo de gráfica comparativa.
   */
  altChartType?: Exclude<ChartType, 'table'>;
  /** Vista adicional de tendencia sin reemplazar la gráfica principal */
  trendChartType?: 'line' | 'area';
  /** Nombres legibles para cada serie (paralelo a yField) */
  seriesNames?: string[];
  /** Orden aplicado a los datos antes de graficar */
  sort?: ChartSort;
  /** Formato de los valores en tooltips y ejes */
  valueFormat?: ValueFormat;
  /** Muestra el valor directamente sobre cada punto o barra */
  showDataLabels?: boolean;
  /** Paleta de colores personalizada */
  colors?: string[];
  /** Alto del gráfico en px */
  height?: number;
  /** Tamaño del widget en la grilla responsive */
  gridSpan?: ChartGridSpan;
}
