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
import { ChartConfig } from '../../types';
import { useWidgetData } from '../../hooks/useDashboardData';
import DynamicChart from './DynamicChart';
import PivotTable from './PivotTable';
import KpiCards from './KpiCards';
import ErrorBoundary from '../ErrorBoundary';

interface ChartWidgetProps {
  config: ChartConfig;
  /** Controles adicionales mostrados en la cabecera, junto al selector tabla/gráfica */
  actions?: ReactNode;
}

type ViewMode = 'table' | 'chart';

/**
 * Tarjeta contenedora de un widget: resuelve los datos del endpoint
 * declarado en la configuración y delega el render a PivotTable o
 * DynamicChart. Si el config declara `altChartType`, muestra un selector
 * para alternar entre vista de tabla y gráfica comparativa.
 */
export default function ChartWidget({ config, actions }: ChartWidgetProps) {
  const { data, isLoading, isError, error } = useWidgetData(config.endpoint);
  const [view, setView] = useState<ViewMode>('chart');

  const hasToggle = config.type === 'table' && Boolean(config.altChartType);
  const effectiveConfig: ChartConfig =
    hasToggle && view === 'chart' && config.altChartType
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

  return (
    <Card sx={{ height: effectiveConfig.type === 'cards' ? 'auto' : '100%' }}>
      <CardContent
        sx={{
          height: effectiveConfig.type === 'cards' ? 'auto' : '100%',
          display: 'flex',
          flexDirection: 'column',
          p: '14px !important',
        }}
      >
        <Stack direction="row" justifyContent="space-between" alignItems="center" spacing={1.5} mb={1}>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="subtitle2" fontWeight={800} lineHeight={1.2} noWrap>
              {config.title}
            </Typography>
            {config.subtitle && (
              <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.3 }}>
                {config.subtitle}
              </Typography>
            )}
          </Box>
          <Stack direction="row" spacing={1} alignItems="center" sx={{ flexShrink: 0 }}>
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

        {!isLoading && !isError && (visibleData?.length ?? 0) === 0 && (
          <Alert severity="info" sx={{ mt: 2 }}>
            Sin datos para los filtros seleccionados.
          </Alert>
        )}

        {!isLoading && !isError && visibleData && visibleData.length > 0 && (
          <ErrorBoundary label="Error al renderizar el widget">
            <Box sx={{ flex: 1, minHeight: 0 }}>
              {effectiveConfig.type === 'table' ? (
                <PivotTable config={effectiveConfig} data={visibleData} />
              ) : effectiveConfig.type === 'cards' ? (
                <KpiCards config={effectiveConfig} data={visibleData} />
              ) : (
                <DynamicChart config={effectiveConfig} data={visibleData} />
              )}
            </Box>
          </ErrorBoundary>
        )}
      </CardContent>
    </Card>
  );
}
