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

const [porEstilo, porClienteDia, porClienteMes] = exportacionesWidgets;
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
          { label: 'Contenedores esta semana', value: data?.contenedoresSemana ?? 0, unit: 'contenedores', tone: 'good' },
          { label: 'Contenedores Francia', value: data?.contenedoresFrancia ?? 0, unit: 'contenedores' },
          { label: 'Contenedores UK', value: data?.contenedoresUK ?? 0, unit: 'contenedores' },
          { label: 'Libras exportadas', value: data?.librasSemana ?? 0, unit: 'lbs' },
        ]}
      />

      <ChartWidget config={porEstilo} />

      <WidgetDataTable
        title="Contenedores Exportados — Detalle"
        subtitle="Por contenedor, estilo, código de exportación e item · rango de fechas del filtro"
        icon={<Inventory2OutlinedIcon color="primary" sx={{ fontSize: 16 }} />}
        endpoint="exportaciones-contenedores"
        defaultSortKey="fecha"
        emptyText="Sin contenedores exportados en el rango seleccionado."
        columns={[
          { key: 'fecha', label: 'Fecha', format: 'periodo' },
          { key: 'contenedor', label: 'Contenedor' },
          { key: 'cliente', label: 'Cliente' },
          { key: 'estilo', label: 'Estilo' },
          { key: 'codigoExportacion', label: 'Cód. exportación' },
          { key: 'item', label: 'Item' },
          { key: 'masteres', label: 'Másteres', format: 'number' },
          { key: 'anillosXMaster', label: 'Anillos/máster', format: 'decimal' },
          { key: 'libras', label: 'Libras', format: 'number' },
        ]}
      />

      <Box sx={{ height: TABLE_H, flexShrink: 0 }}>
        <ChartWidget config={porClienteDia} />
      </Box>
      <Box sx={{ height: TABLE_H, flexShrink: 0 }}>
        <ChartWidget config={porClienteMes} />
      </Box>
    </Stack>
  );
}
