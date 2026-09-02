import { Box, Stack } from '@mui/material';
import LocalShippingOutlinedIcon from '@mui/icons-material/LocalShippingOutlined';
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import ProcessFilters from '../components/filters/ProcessFilters';
import ResumenCards from '../components/live/ResumenCards';
import ChartWidget from '../components/charts/ChartWidget';
import WidgetDataTable from '../components/charts/WidgetDataTable';
import { useProcesoResumen } from '../hooks/useDashboardData';
import { ExportacionesResumen } from '../types';
import { formatPeriodo } from '../utils/format';
import { exportacionesWidgets } from '../config/dashboardConfig';

const [porEstilo, porClienteMes] = exportacionesWidgets;
const TABLE_H = 440;

export default function ExportacionesPage() {
  const { data, isLoading, isError, error, dataUpdatedAt } =
    useProcesoResumen<ExportacionesResumen>('exportaciones-resumen');

  const semana =
    data && data.semanaInicio
      ? `Semana ${formatPeriodo(data.semanaInicio)} → ${formatPeriodo(data.semanaFin)}`
      : undefined;

  return (
    <Stack
      spacing={1.5}
      sx={{ height: '100%', minHeight: 0, overflowY: 'auto', overflowX: 'hidden', pb: 1.5 }}
    >
      <ProcessFilters
        title="Filtros de exportaciones"
        hint="Los contadores muestran la semana en curso (lunes a domingo); las tarjetas y tablas responden al rango de fechas."
        hideTurno
      />

      <ResumenCards
        title="Exportaciones — Semana en curso"
        icon={<LocalShippingOutlinedIcon color="primary" sx={{ fontSize: 16 }} />}
        isLoading={isLoading}
        isError={isError}
        errorText={error instanceof Error ? error.message : undefined}
        periodoLabel={semana}
        updatedAt={dataUpdatedAt}
        emptyText="Sin contenedores exportados esta semana."
        metrics={[
          { label: 'Libras a Francia', value: data?.librasFrancia ?? 0, unit: 'lbs' },
          { label: 'Libras a UK', value: data?.librasUK ?? 0, unit: 'lbs' },
          { label: 'Libras a AC Holding', value: data?.librasACHolding ?? 0, unit: 'lbs' },
          { label: 'Libras a terceros', value: data?.librasTerceros ?? 0, unit: 'lbs' },
          { label: 'Total exportado', value: data?.librasTotal ?? 0, unit: 'lbs', tone: 'good' },
        ]}
      />

      <ChartWidget config={porEstilo} />

      <WidgetDataTable
        title="Contenedores Exportados — Detalle"
        subtitle="Por contenedor, estilo y cliente · rango de fechas del filtro"
        icon={<Inventory2OutlinedIcon color="primary" sx={{ fontSize: 16 }} />}
        endpoint="exportaciones-contenedores"
        defaultSortKey="fecha"
        emptyText="Sin contenedores exportados en el rango seleccionado."
        columns={[
          { key: 'fecha', label: 'Fecha', format: 'periodo' },
          { key: 'contenedor', label: 'Contenedor' },
          { key: 'cliente', label: 'Cliente' },
          { key: 'estilo', label: 'Estilo' },
          { key: 'masteres', label: 'Másteres', format: 'number' },
          { key: 'anillosXMaster', label: 'Anillos/máster', format: 'decimal' },
          { key: 'libras', label: 'Libras', format: 'number' },
        ]}
      />

      <Box sx={{ height: TABLE_H, flexShrink: 0 }}>
        <ChartWidget config={porClienteMes} />
      </Box>
    </Stack>
  );
}
