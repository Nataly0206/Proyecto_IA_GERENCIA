import { ReactNode, useState } from 'react';
import {
  Alert,
  Box,
  Card,
  CardContent,
  CircularProgress,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material';
import TableChartOutlinedIcon from '@mui/icons-material/TableChartOutlined';
import InsertChartOutlinedIcon from '@mui/icons-material/InsertChartOutlined';
import TimelineOutlinedIcon from '@mui/icons-material/TimelineOutlined';
import { ChartConfig, DataRow } from '../../types';
import { useWidgetData } from '../../hooks/useDashboardData';
import DynamicChart from './DynamicChart';
import PivotTable from './PivotTable';
import KpiCards from './KpiCards';
import ErrorBoundary from '../ErrorBoundary';

interface ChartWidgetProps {
  config: ChartConfig;
  /** Controles adicionales mostrados en la cabecera, junto al selector tabla/gráfica */
  actions?: ReactNode;
  /**
   * Transforma las filas ya fetcheadas antes de renderizarlas — para
   * reutilizar el mismo endpoint con una vista derivada (p. ej. un factor
   * de conversión) sin duplicar la consulta ni el fetch.
   */
  transform?: (data: DataRow[]) => DataRow[];
}

type ViewMode = 'table' | 'chart' | 'trend';

/**
 * Tarjeta contenedora de un widget: resuelve los datos del endpoint
 * declarado en la configuración y delega el render a PivotTable o
 * DynamicChart. Si el config declara `altChartType`, muestra un selector
 * para alternar entre vista de tabla y gráfica comparativa.
 */
export default function ChartWidget({ config, actions, transform }: ChartWidgetProps) {
  const { data, isLoading, isError, error } = useWidgetData(config.endpoint);
  const [view, setView] = useState<ViewMode>('chart');

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
        <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'stretch', sm: 'center' }} spacing={{ xs: 1, sm: 1.5 }} mb={1}>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="subtitle2" fontWeight={800} lineHeight={1.2} sx={{ whiteSpace: { sm: 'nowrap' }, fontSize: { xs: 15, sm: 14 } }}>
              {config.title}
            </Typography>
            {config.subtitle && (
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.3 }}>
                {config.subtitle}
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

        {isLoading && (
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

        {isError && (
          <Alert severity="error" sx={{ mt: 2 }}>
            Error al cargar datos: {error instanceof Error ? error.message : 'desconocido'}
          </Alert>
        )}

        {!isLoading && !isError && (transformedData?.length ?? 0) === 0 && (
          <Alert severity="info" sx={{ mt: 2 }}>
            Sin datos para los filtros seleccionados.
          </Alert>
        )}

        {!isLoading && !isError && transformedData && transformedData.length > 0 && (
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
                  <PivotTable config={effectiveConfig} data={transformedData} />
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
