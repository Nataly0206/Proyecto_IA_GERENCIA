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
    showDataLabels: true,
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
    showDataLabels: true,
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
