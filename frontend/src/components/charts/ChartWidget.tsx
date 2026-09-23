import { ReactNode, useState } from 'react';
import {
  Alert,
  Box,
  Card,
  CardContent,
  CircularProgress,
  Stack,
  MenuItem,
  Select,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material';
import TableChartOutlinedIcon from '@mui/icons-material/TableChartOutlined';
import InsertChartOutlinedIcon from '@mui/icons-material/InsertChartOutlined';
import IqfWorkedHoursTable from './IqfWorkedHoursTable';
import TimelineOutlinedIcon from '@mui/icons-material/TimelineOutlined';
import { ChartConfig, DataRow } from '../../types';
import { useWidgetData } from '../../hooks/useDashboardData';
import DynamicChart from './DynamicChart';
import PivotTable from './PivotTable';
import KpiCards from './KpiCards';
import ErrorBoundary from '../ErrorBoundary';

interface ChartWidgetProps {
  config: ChartConfig;
  workedHours?: 'dia' | 'mes';
  /** Controles adicionales mostrados en la cabecera, junto al selector tabla/gráfica */
  actions?: ReactNode;
  columnOrder?: string[];
  onColumnReorder?: (source: string, target: string) => void;
  emptyText?: string;
  /**
   * Transforma las filas ya fetcheadas antes de renderizarlas — para
   * reutilizar el mismo endpoint con una vista derivada (p. ej. un factor
   * de conversión) sin duplicar la consulta ni el fetch.
   */
  transform?: (data: DataRow[]) => DataRow[];
  queryParams?: Record<string, string>;
}

type ViewMode = 'table' | 'chart' | 'trend';

/**
 * Tarjeta contenedora de un widget: resuelve los datos del endpoint
 * declarado en la configuración y delega el render a PivotTable o
 * DynamicChart. Si el config declara `altChartType`, muestra un selector
 * para alternar entre vista de tabla y gráfica comparativa.
 */
export default function ChartWidget({ config, actions, columnOrder, onColumnReorder, emptyText = 'Sin datos para los filtros seleccionados.', transform, workedHours, queryParams }: ChartWidgetProps) {
  const { data, isLoading, isError, error } = useWidgetData(config.endpoint, queryParams);
  const [view, setView] = useState<ViewMode>('chart');
  const [report, setReport] = useState<'rate' | 'hours'>('rate');
  const showHours = Boolean(workedHours) && report === 'hours';
  const hoursTitle = `Horas Trabajadas por IQF — ${workedHours === 'mes' ? 'Mensual' : 'Diario'}`;

  const hasToggle = config.type === 'table' && Boolean(config.altChartType);
  const hasTrend = hasToggle && Boolean(config.trendChartType);
  const effectiveConfig: ChartConfig =
    hasTrend && view === 'trend' && config.trendChartType
      ? { ...config, type: config.trendChartType }
      : hasToggle && view === 'chart' && config.altChartType
      ? { ...config, type: config.altChartType }
      : config;
  const seriesFilteredData =
    data && config.seriesField && config.excludedSeriesValues?.length
      ? data.filter(
          (row) => {
            const seriesValue = String(row[config.seriesField ?? ''] ?? '').toUpperCase();
            return !config.excludedSeriesValues?.some((excluded) =>
              seriesValue.includes(excluded.toUpperCase()),
            );
          },
        )
      : data;
  const visibleData =
    seriesFilteredData && config.maxPeriods && config.maxPeriods > 0
      ? (() => {
          const recentPeriods = new Set(
            Array.from(
              new Set(
                seriesFilteredData.map((row) => String(row[config.xField] ?? '')),
              ),
            )
              .filter(Boolean)
              .sort()
              .slice(-config.maxPeriods),
          );
          return seriesFilteredData.filter((row) =>
            recentPeriods.has(String(row[config.xField] ?? '')),
          );
        })()
      : seriesFilteredData;
  const transformedData = visibleData && transform ? transform(visibleData) : visibleData;
  const isCards = effectiveConfig.type === 'cards';
  const widgetHeight = isCards ? 'auto' : { xs: 'auto', md: '100%' };

  return (
    // "cards" widgets sit bare in the page's outer Stack (height:'100%',
    // overflowY:'auto'), unlike table/chart widgets which pages always wrap in
    // a `flexShrink: 0` Box. Without flexShrink:0 here, this Card is a shrinkable
    // flex child with minHeight:0 (needed below for table/chart to fill 100%) —
    // when the page's total content is taller than the viewport, the browser
    // squashes this Card down to fit instead of letting the Stack scroll, so it
    // renders empty/collapsed under the next section. flexShrink:0 opts it out.
    <Card sx={{ height: widgetHeight, minHeight: 0, ...(isCards && { flexShrink: 0 }) }}>
      <CardContent
        sx={{
          height: widgetHeight,
          display: 'flex',
          flexDirection: 'column',
          p: '14px !important',
        }}
      >
        <Stack direction={workedHours ? 'row' : { xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={workedHours ? 'center' : { xs: 'stretch', sm: 'center' }} spacing={workedHours ? 0 : { xs: 1, sm: 1.5 }} sx={workedHours ? { flexWrap: 'wrap', gap: 1 } : undefined} mb={1}>
          <Box sx={{ minWidth: 0 }}>
            {workedHours ? (
              <Select
                size="small"
                value={report}
                onChange={(event) => setReport(event.target.value as 'rate' | 'hours')}
                inputProps={{ 'aria-label': `Reporte IQF ${workedHours === 'mes' ? 'mensual' : 'diario'}` }}
                sx={{ width: 'auto', maxWidth: '100%', '& .MuiSelect-select': { fontWeight: 800, fontSize: { xs: 13, sm: 14 }, whiteSpace: 'normal', lineHeight: 1.35, py: 0.75 } }}
              >
                <MenuItem sx={{ whiteSpace: 'normal' }} value="rate">{config.title}</MenuItem>
                <MenuItem sx={{ whiteSpace: 'normal' }} value="hours">{hoursTitle}</MenuItem>
              </Select>
            ) : (
              <Typography variant="subtitle2" fontWeight={800} lineHeight={1.2} sx={{ whiteSpace: { sm: 'nowrap' }, fontSize: { xs: 15, sm: 14 } }}>
                {config.title}
              </Typography>
            )}
            {config.subtitle && (
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.3 }}>
                {showHours ? (workedHours === 'mes' ? 'Últimos 12 meses · promedio de horas trabajadas por día de cada mes' : 'Rango de fechas seleccionado · horas por IQF y promedio por día') : config.subtitle}
              </Typography>
            )}
          </Box>
          <Stack direction="row" spacing={1} alignItems="center" justifyContent={{ xs: 'flex-end', sm: 'initial' }} sx={{ flexShrink: 0 }}>
            {actions}
            {hasToggle && (
              <ToggleButtonGroup
                size="small"
                exclusive
                value={view}
                onChange={(_e, next: ViewMode | null) => next && setView(next)}
                sx={{ '& .MuiToggleButton-root': { p: 0.75, lineHeight: 1 } }}
              >
                <ToggleButton value="table" aria-label="Vista de tabla">
                  <Tooltip title="Tabla">
                    <TableChartOutlinedIcon sx={{ fontSize: 14 }} />
                  </Tooltip>
                </ToggleButton>
                <ToggleButton value="chart" aria-label="Vista de gráfica">
                  <Tooltip title="Gráfica comparativa">
                    <InsertChartOutlinedIcon sx={{ fontSize: 14 }} />
                  </Tooltip>
                </ToggleButton>
                {hasTrend && (
                  <ToggleButton value="trend" aria-label="Vista de tendencia">
                    <Tooltip title="Gráfica de tendencia">
                      <TimelineOutlinedIcon sx={{ fontSize: 14 }} />
                    </Tooltip>
                  </ToggleButton>
                )}
              </ToggleButtonGroup>
            )}
          </Stack>
        </Stack>

        {showHours && workedHours && (
          <Box sx={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
            <IqfWorkedHoursTable mode={workedHours} view={view} config={effectiveConfig} />
          </Box>
        )}

        {!showHours && isLoading && (
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              height: config.height ?? 340,
            }}
          >
            <CircularProgress size={32} />
          </Box>
        )}

        {!showHours && isError && (
          <Alert severity="error" sx={{ mt: 2 }}>
            Error al cargar datos: {error instanceof Error ? error.message : 'desconocido'}
          </Alert>
        )}

        {!showHours && !isLoading && !isError && (transformedData?.length ?? 0) === 0 && (
          <Alert severity="info" sx={{ mt: 2 }}>
            {emptyText}
          </Alert>
        )}

        {!showHours && !isLoading && !isError && transformedData && transformedData.length > 0 && (
          <ErrorBoundary label="Error al renderizar el widget">
            {/* Solo table/chart viven en un Card de altura fija (height: '100%' en
                md+) donde flex:1 + minHeight:0 reparte el espacio restante para
                habilitar el scroll interno. "cards" usa height:'auto' — con esas
                mismas propiedades, un Card sin alto definido no tiene espacio libre
                que repartir y el contenido colapsa a 0px (queda en el DOM pero
                invisible, montado bajo el siguiente widget). Por eso "cards" usa
                un Box sin flex, que simplemente crece con su contenido. */}
            {isCards ? (
              <KpiCards config={effectiveConfig} data={transformedData} />
            ) : (
              <Box sx={{ flex: 1, minHeight: 0 }}>
                {effectiveConfig.type === 'table' ? (
                  <PivotTable config={effectiveConfig} data={transformedData} columnOrder={columnOrder} onColumnReorder={onColumnReorder} />
                ) : (
                  <DynamicChart config={effectiveConfig} data={transformedData} />
                )}
              </Box>
            )}
          </ErrorBoundary>
        )}
      </CardContent>
    </Card>
  );
}
