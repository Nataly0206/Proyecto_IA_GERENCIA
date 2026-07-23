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
    subtitle: 'Últimos 7 días · promedio de libras/hora por línea IQF',
    endpoint: 'iqf-libras-hora-dia',
    xField: 'periodo',
    xLabel: 'Fecha',
    yField: 'librasPorHora',
    seriesField: 'linea',
    excludedSeriesValues: ['SAL'],
    maxPeriods: 7,
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
    valueFormat: 'decimal',
    gridSpan: { xs: 12, md: 6 },
  },
];
