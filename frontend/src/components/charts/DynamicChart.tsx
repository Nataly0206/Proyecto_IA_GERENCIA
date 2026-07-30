import { useMemo } from 'react';
import { useMediaQuery, useTheme } from '@mui/material';
import Chart from 'react-apexcharts';
import type { ApexOptions } from 'apexcharts';
import { ChartConfig, ChartSort, DataRow } from '../../types';
import { formatPeriodo, formatValue } from '../../utils/format';
import { CHART_COLORS } from '../../theme';
import { useFilters } from '../../context/FiltersContext';

interface DynamicChartProps {
  config: ChartConfig;
  data: DataRow[];
}

interface AxisPoint {
  x: string;
  y: number;
}

type ChartSeries =
  | { name: string; data: (number | null)[] }
  | { name: string; data: AxisPoint[] };

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

function eachIsoDate(start: string, end: string): string[] {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) return [];

  const current = new Date(`${start}T00:00:00Z`);
  const last = new Date(`${end}T00:00:00Z`);
  const dates: string[] = [];
  while (current <= last && dates.length < 1_000) {
    dates.push(current.toISOString().slice(0, 10));
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return dates;
}

function adaptiveStepFor(count: number): number {
  if (count <= 14) return 1;
  if (count <= 60) return 5;
  return 10;
}

function visibleDatePoints(values: string[]): string[] {
  const step = adaptiveStepFor(values.length);
  if (step === 1) return values;
  return values.filter(
    (_value, index) =>
      index === 0 ||
      index === values.length - 1 ||
      index % step === 0,
  );
}

/**
 * Renderiza cualquier gráfico a partir de una configuración JSON.
 * Si `seriesField` está definido, los datos se pivotean en una serie por
 * cada valor de ese campo (p.ej. una serie por línea IQF) — gráfica
 * comparativa. Es el único componente de gráficos del sistema.
 */
export default function DynamicChart({ config, data }: DynamicChartProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const { filters, showChartValues } = useFilters();
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

  /* ---- type "table" / "cards" se renderizan en otros componentes, no aquí ---- */
  if (config.type === 'table' || config.type === 'cards') return null;

  /* ---- Gráficos de ejes (bar / column / line / area) ---- */
  let categories: string[];
  let series: ChartSeries[];

  if (config.seriesField) {
    // Pivot: una serie por cada valor de seriesField (gráfica comparativa)
    const seriesField = config.seriesField;
    const yField = Array.isArray(config.yField) ? config.yField[0] : config.yField;
    const dataXValues = Array.from(
      new Set(rows.map((r) => String(r[config.xField] ?? ''))),
    ).sort();
    const filteredDates = config.completeFilteredDateRange
      ? eachIsoDate(filters.fechaInicial, filters.fechaFinal)
      : [];
    const allXValues = filteredDates.length > 0 ? filteredDates : dataXValues;
    const xValues = config.visibleDatePointsOnly
      ? visibleDatePoints(allXValues)
      : allXValues;
    const seriesNames = Array.from(
      new Set(rows.map((r) => String(r[seriesField] ?? ''))),
    ).sort();
    const cell = new Map<string, number>();
    for (const r of rows) {
      cell.set(`${String(r[config.xField])}|${String(r[seriesField])}`, Number(r[yField] ?? 0));
    }
    categories = xValues.map(labelOf);
    series = seriesNames.map((name): ChartSeries => {
      // En la gráfica diaria se omiten por completo las fechas sin valor
      // para esta línea. Así ApexCharts conecta sus observaciones reales
      // y no crea etiquetas "0" para espacios que en realidad son nulos.
      if (config.visibleDatePointsOnly) {
        return {
          name,
          data: xValues.flatMap((x): AxisPoint[] => {
            const value = cell.get(`${x}|${name}`);
            return value === undefined ? [] : [{ x: labelOf(x), y: value }];
          }),
        };
      }
      return {
        name,
        data: xValues.map((x) => cell.get(`${x}|${name}`) ?? null),
      };
    });
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
  const displayDataLabels = Boolean(config.showDataLabels && showChartValues);
  const dateTickStep = config.adaptiveDateTicks
    ? adaptiveStepFor(categories.length)
    : 1;
  const showMarkerAt = (index: number): boolean =>
    index === 0 ||
    index === categories.length - 1 ||
    index % dateTickStep === 0;
  const adaptiveDiscreteMarkers =
    isLineLike && config.adaptiveDateTicks && dateTickStep > 1
      ? series.flatMap((item, seriesIndex) =>
          item.data.flatMap((value, dataPointIndex) =>
            value !== null && showMarkerAt(dataPointIndex)
              ? [{
                  seriesIndex,
                  dataPointIndex,
                  fillColor: colors[seriesIndex % colors.length],
                  strokeColor: '#ffffff',
                  size: 4,
                }]
              : [],
          ),
        )
      : undefined;

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
        columnWidth: displayDataLabels ? '46%' : '55%',
        barHeight: '70%',
        dataLabels: {
          position: isHorizontal ? 'center' : 'top',
        },
      },
    },
    dataLabels: {
      enabled: displayDataLabels,
      formatter: (value: number) => formatValue(Number(value), 'number'),
      offsetY: isHorizontal ? 0 : -7,
      style: {
        fontSize: isMobile ? '8px' : '9px',
        fontWeight: 700,
        colors: ['#334155'],
      },
      background: {
        enabled: displayDataLabels,
        backgroundColor: '#e2e8f0',
        foreColor: '#1e293b',
        borderRadius: 4,
        padding: 3,
        opacity: 1,
        borderWidth: 1,
        borderColor: '#cbd5e1',
        dropShadow: { enabled: false },
      },
    },
    stroke: isLineLike
      ? { show: true, curve: config.lineCurve ?? 'smooth', width: 3, colors }
      : { show: true, width: 1, colors: ['transparent'] },
    xaxis: {
      categories,
      labels: {
        rotate: isMobile ? -60 : -45,
        trim: true,
        style: { fontSize: isMobile ? '10px' : '12px', colors: '#64748b', fontWeight: 600 },
        ...(!isHorizontal && dateTickStep > 1 && {
          formatter: (value: string) => {
            const index = categories.indexOf(value);
            return index === 0 || index === categories.length - 1 || index % dateTickStep === 0
              ? value
              : '';
          },
        }),
        ...(isHorizontal && {
          formatter: (val: string) => tooltipFormatter(Number(val)),
        }),
      },
    },
    yaxis: {
      labels: {
        style: { colors: '#64748b', fontSize: isMobile ? '10px' : '12px', fontWeight: 600 },
        formatter: (val: number) =>
          isHorizontal ? String(val) : tooltipFormatter(val),
      },
    },
    grid: {
      borderColor: '#e2e8f0',
      strokeDashArray: 4,
      padding: {
        top: displayDataLabels ? 14 : 0,
        left: isMobile ? 0 : 8,
        right: isMobile ? 4 : 12,
      },
    },
    legend: {
      show: series.length > 1,
      position: 'top',
      fontSize: isMobile ? '11px' : '12px',
      fontWeight: 600,
      itemMargin: { horizontal: isMobile ? 6 : 10, vertical: 3 },
    },
    tooltip: { y: { formatter: tooltipFormatter } },
    ...(isLineLike && {
      markers: config.showAllDataMarkers
        ? { size: 4, hover: { size: 6 } }
        : config.adaptiveDateTicks && dateTickStep > 1
        ? {
            size: 0,
            discrete: adaptiveDiscreteMarkers,
            hover: { size: 6 },
          }
        : { size: 4, hover: { size: 6 } },
    }),
  };

  return (
    <Chart
      key={`${config.id}-${apexType}`}
      options={options}
      series={series}
      type={apexType}
      height={height}
    />
  );
}
