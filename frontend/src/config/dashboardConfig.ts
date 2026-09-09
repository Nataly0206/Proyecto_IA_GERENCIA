import { ChartConfig } from '../types';

/**
 * Definición declarativa del dashboard (3 reportes).
 *
 * Cada widget es un objeto JSON serializable que el componente
 * <DynamicChart /> sabe renderizar. En la Fase 2, el Asistente IA
 * generará objetos con esta misma estructura.
 */
export const dashboardWidgets: ChartConfig[] = [
  {
    id: 'libras-netas-proceso',
    type: 'bar',
    title: 'Libras Congeladas Netas por Tipo de Proceso',
    subtitle: 'Excluye FRESH TAIL (compra de materia prima) y reempaque',
    endpoint: 'libras-netas-proceso',
    xField: 'proceso',
    yField: 'libras',
    seriesNames: ['Libras Netas'],
    sort: { field: 'libras', direction: 'desc' },
    valueFormat: 'number',
    gridSpan: { xs: 12, md: 7 },
  },
  {
    id: 'iqf-libras-hora-dia',
    type: 'table',
    title: 'Rendimientos IQF x Hora — Diario',
    subtitle: 'Rango de fechas seleccionado · promedio de libras/hora por línea IQF',
    endpoint: 'iqf-libras-hora-dia',
    xField: 'periodo',
    xLabel: 'Fecha',
    yField: 'librasPorHora',
    seriesField: 'linea',
    excludedSeriesValues: ['SAL'],
    adaptiveDateTicks: true,
    visibleDatePointsOnly: true,
    lineCurve: 'straight',
    showAllDataMarkers: true,
    weightField: 'grupos',
    altChartType: 'line',
    valueFormat: 'decimal',
    gridSpan: { xs: 12, md: 6 },
  },
  {
    id: 'iqf-libras-hora-mes',
    type: 'table',
    title: 'Rendimientos IQF x Hora — Mensual',
    subtitle: 'Últimos 12 meses (independiente del filtro de fechas)',
    endpoint: 'iqf-libras-hora-mes',
    xField: 'periodo',
    xLabel: 'Mes',
    yField: 'librasPorHora',
    seriesField: 'linea',
    excludedSeriesValues: ['SAL'],
    weightField: 'grupos',
    altChartType: 'column',
    trendChartType: 'line',
    valueFormat: 'decimal',
    gridSpan: { xs: 12, md: 6 },
  },
];

/**
 * Definición declarativa del reporte de pelado (libras por estilo).
 * Mismo patrón que `dashboardWidgets`: objetos ChartConfig serializables
 * que <DynamicChart /> renderiza sin lógica específica de dominio.
 */
export const peladoWidgets: ChartConfig[] = [
  {
    id: 'pelado-por-estilo-dia',
    type: 'table',
    title: 'Libras Peladas por Estilo — Diario',
    subtitle: 'Rango de fechas seleccionado',
    endpoint: 'pelado-por-estilo-dia',
    xField: 'periodo',
    xLabel: 'Fecha',
    yField: 'libras',
    seriesField: 'estilo',
    totalAggregation: 'sum',
    adaptiveDateTicks: true,
    visibleDatePointsOnly: true,
    lineCurve: 'straight',
    altChartType: 'line',
    valueFormat: 'number',
    gridSpan: { xs: 12, md: 6 },
  },
  {
    id: 'pelado-por-estilo-mes',
    type: 'table',
    title: 'Libras Peladas por Estilo — Mensual',
    subtitle: 'Últimos 12 meses (independiente del filtro de fechas)',
    endpoint: 'pelado-por-estilo-mes',
    xField: 'periodo',
    xLabel: 'Mes',
    yField: 'libras',
    seriesField: 'estilo',
    totalAggregation: 'sum',
    altChartType: 'column',
    trendChartType: 'line',
    valueFormat: 'number',
    gridSpan: { xs: 12, md: 6 },
  },
];

/* ================================================================== */
/* Módulos de proceso — mismos patrones ChartConfig que arriba        */
/* ================================================================== */

/** Clasificado por talla y por máquina (responsable de mesa). Las tablas
 *  diario/mensual pivotean por talla; las tarjetas cubren talla y máquina. */
export const clasificadoWidgets: ChartConfig[] = [
  {
    id: 'clasificado-por-maquina',
    type: 'cards',
    title: 'Libras Clasificadas por Máquina',
    subtitle: 'Responsable de mesa · rango de fechas y turno del filtro',
    endpoint: 'clasificado-por-maquina',
    xField: 'maquina',
    yField: 'libras',
    sort: { field: 'libras', direction: 'desc' },
    valueFormat: 'number',
    unitLabel: 'lbs clasificadas',
    showTotalCard: true,
  },
  {
    id: 'clasificado-por-talla',
    type: 'cards',
    title: 'Libras Clasificadas por Talla',
    subtitle: 'Rango de fechas y turno del filtro',
    endpoint: 'clasificado-por-talla',
    xField: 'talla',
    yField: 'libras',
    sort: { field: 'libras', direction: 'desc' },
    valueFormat: 'number',
    unitLabel: 'lbs clasificadas',
    showTotalCard: true,
  },
  {
    id: 'clasificado-por-talla-dia',
    type: 'table',
    title: 'Clasificado por Talla — Diario',
    subtitle: 'Libras clasificadas por talla · rango de fechas seleccionado',
    endpoint: 'clasificado-por-talla-dia',
    xField: 'periodo',
    xLabel: 'Fecha',
    yField: 'libras',
    seriesField: 'talla',
    totalAggregation: 'sum',
    valueFormat: 'number',
    gridSpan: { xs: 12, md: 6 },
  },
  {
    id: 'clasificado-por-talla-mes',
    type: 'table',
    title: 'Clasificado por Talla — Mensual',
    subtitle: 'Últimos 12 meses (independiente del filtro de fechas)',
    endpoint: 'clasificado-por-talla-mes',
    xField: 'periodo',
    xLabel: 'Mes',
    yField: 'libras',
    seriesField: 'talla',
    totalAggregation: 'sum',
    valueFormat: 'number',
    gridSpan: { xs: 12, md: 6 },
  },
];

/** Exportaciones. */
export const exportacionesWidgets: ChartConfig[] = [
  {
    id: 'exportaciones-por-estilo',
    type: 'cards',
    title: 'Libras Exportadas por Estilo',
    subtitle: 'Rango de fechas del filtro — fuente: AV_Envios',
    endpoint: 'exportaciones-por-estilo',
    xField: 'estilo',
    yField: 'libras',
    sort: { field: 'libras', direction: 'desc' },
    valueFormat: 'number',
    unitLabel: 'lbs exportadas',
    showTotalCard: true,
  },
  {
    id: 'exportaciones-por-cliente-mes',
    type: 'table',
    title: 'Contenedores Exportados por Cliente — Mensual',
    subtitle: 'Últimos 6 meses (independiente del filtro de fechas)',
    endpoint: 'exportaciones-por-cliente-mes',
    xField: 'periodo',
    xLabel: 'Mes',
    yField: 'contenedores',
    seriesField: 'cliente',
    totalAggregation: 'sum',
    altChartType: 'column',
    valueFormat: 'number',
    gridSpan: { xs: 12, md: 6 },
  },
];

/**
 * Compra de materia prima — tarjetas por proveedor (rango de fechas del
 * filtro). El desglose mensual por proveedor/gramaje con selector de
 * proveedores es el widget a medida `MateriaPrimaProveedorWidget`, no un
 * ChartConfig de esta lista (ver `CompraMateriaPrimaPage.tsx`).
 */
export const compraMpWidgets: ChartConfig[] = [
  {
    id: 'compra-mp-por-proveedor',
    type: 'cards',
    title: 'Materia Prima por Proveedor WSO',
    subtitle: 'Rango de fechas del filtro — fuente: AV_MateriaPrima',
    endpoint: 'compra-mp-por-proveedor',
    xField: 'proveedor',
    yField: 'libras',
    sort: { field: 'libras', direction: 'desc' },
    valueFormat: 'number',
    unitLabel: 'lbs de materia prima',
    showTotalCard: true,
  },
];
