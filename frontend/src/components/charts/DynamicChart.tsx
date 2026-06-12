import { useMemo } from 'react';
import Chart from 'react-apexcharts';
import type { ApexOptions } from 'apexcharts';
import { ChartConfig, ChartSort, DataRow } from '../../types';
import { formatPeriodo, formatValue } from '../../utils/format';
import { CHART_COLORS } from '../../theme';

interface DynamicChartProps {
  config: ChartConfig;
  data: DataRow[];
}

function applySort(data: DataRow[], sort?: ChartSort): DataRow[] {
  if (!sort) return data;
  const dir = sort.direction === 'asc' ? 1 : -1;
  return [...data].sort(
    (a, b) => (Number(a[sort.field] ?? 0) - Number(b[sort.field] ?? 0)) * dir,
  );
}

/** "2026-06-01" / "2026-06" se muestran como "01-jun-2026" / "jun-2026" */
const ISO_PERIOD = /^\d{4}-\d{2}(-\d{2})?$/;
const labelOf = (value: string): string =>
  ISO_PERIOD.test(value) ? formatPeriodo(value) : value;

/**
 * Renderiza cualquier gráfico a partir de una configuración JSON.
 * Si `seriesField` está definido, los datos se pivotean en una serie por
 * cada valor de ese campo (p.ej. una serie por línea IQF) — gráfica
 * comparativa. Es el único componente de gráficos del sistema.
 */
export default function DynamicChart({ config, data }: DynamicChartProps) {
  const rows = useMemo(() => applySort(data, config.sort), [data, config.sort]);

  const colors = config.colors ?? CHART_COLORS;
  const height = config.height ?? 340;
  const format = config.valueFormat ?? 'number';
  const tooltipFormatter = (value: number) => formatValue(value, format);

  /* ---- Gráficos circulares (donut / pie) ---- */
  if (config.type === 'donut' || config.type === 'pie') {
    const yField = Array.isArray(config.yField) ? config.yField[0] : config.yField;
    const labels = rows.map((r) => String(r[config.xField] ?? ''));
    const series = rows.map((r) => Number(r[yField] ?? 0));
    const options: ApexOptions = {
      chart: { type: config.type, fontFamily: 'Inter, sans-serif' },
      labels,
      colors,
      legend: { position: 'bottom', fontSize: '12px', fontWeight: 600 },
      dataLabels: {
        enabled: true,
        formatter: (val: number) => `${val.toFixed(1)}%`,
        style: { fontSize: '12px', fontWeight: 700 },
      },
      tooltip: { y: { formatter: tooltipFormatter } },
      stroke: { width: 1 },
    };
    return <Chart options={options} series={series} type={config.type} height={height} />;
  }

  /* ---- type "table" se renderiza en <PivotTable />, no aquí ---- */
  if (config.type === 'table') return null;

  /* ---- Gráficos de ejes (bar / column / line / area) ---- */
  let categories: string[];
  let series: { name: string; data: (number | null)[] }[];

  if (config.seriesField) {
    // Pivot: una serie por cada valor de seriesField (gráfica comparativa)
    const seriesField = config.seriesField;
    const yField = Array.isArray(config.yField) ? config.yField[0] : config.yField;
    const xValues = Array.from(new Set(rows.map((r) => String(r[config.xField] ?? '')))).sort();
    const seriesNames = Array.from(
      new Set(rows.map((r) => String(r[seriesField] ?? ''))),
    ).sort();
    const cell = new Map<string, number>();
    for (const r of rows) {
      cell.set(`${String(r[config.xField])}|${String(r[seriesField])}`, Number(r[yField] ?? 0));
    }
    categories = xValues.map(labelOf);
    series = seriesNames.map((name) => ({
      name,
      data: xValues.map((x) => cell.get(`${x}|${name}`) ?? null),
    }));
  } else {
    const yFields = Array.isArray(config.yField) ? config.yField : [config.yField];
    categories = rows.map((r) => labelOf(String(r[config.xField] ?? '')));
    series = yFields.map((field, index) => ({
      name: config.seriesNames?.[index] ?? field,
      data: rows.map((r) => Number(r[field] ?? 0)),
    }));
  }

  const isHorizontal = config.type === 'bar';
  const apexType = config.type === 'column' ? 'bar' : config.type;
  const isLineLike = config.type === 'line' || config.type === 'area';

  // Importante: no incluir claves con valor `undefined` — el merge interno
  // de ApexCharts las toma literalmente y pisa sus defaults, lo que provoca
  // errores como "Cannot read properties of undefined (reading 'size')".
  const options: ApexOptions = {
    chart: {
      type: apexType,
      fontFamily: 'Inter, sans-serif',
      toolbar: { show: false },
      zoom: { enabled: isLineLike },
    },
    colors,
    plotOptions: {
      bar: {
        horizontal: isHorizontal,
        borderRadius: 4,
        columnWidth: '55%',
        barHeight: '70%',
      },
    },
    dataLabels: { enabled: false },
    stroke: isLineLike
      ? { curve: 'smooth', width: 3 }
      : { show: true, width: 1, colors: ['transparent'] },
    xaxis: {
      categories,
      labels: {
        rotate: -45,
        trim: true,
        style: { fontSize: '12px', colors: '#64748b', fontWeight: 600 },
        ...(isHorizontal && {
          formatter: (val: string) => tooltipFormatter(Number(val)),
        }),
      },
    },
    yaxis: {
      labels: {
        style: { colors: '#64748b', fontSize: '12px', fontWeight: 600 },
        formatter: (val: number) =>
          isHorizontal ? String(val) : tooltipFormatter(val),
      },
    },
    grid: { borderColor: '#e2e8f0', strokeDashArray: 4, padding: { left: 8, right: 12 } },
    legend: { show: series.length > 1, position: 'top', fontSize: '12px', fontWeight: 600 },
    tooltip: { y: { formatter: tooltipFormatter } },
    ...(isLineLike && { markers: { size: 4, hover: { size: 6 } } }),
  };

  return <Chart options={options} series={series} type={apexType} height={height} />;
}
