import { Stack } from '@mui/material';
import MoveToInboxOutlinedIcon from '@mui/icons-material/MoveToInboxOutlined';
import ReceiptLongOutlinedIcon from '@mui/icons-material/ReceiptLongOutlined';
import ProcessFilters from '../components/filters/ProcessFilters';
import ResumenCards from '../components/live/ResumenCards';
import ChartWidget from '../components/charts/ChartWidget';
import WidgetDataTable from '../components/charts/WidgetDataTable';
import { useProcesoResumen } from '../hooks/useDashboardData';
import { RecepcionResumen } from '../types';
import { formatPeriodo } from '../utils/format';
import { recepcionWidgets } from '../config/dashboardConfig';

const [porFinca] = recepcionWidgets;

export default function RecepcionPage() {
  const { data, isLoading, isError, error, dataUpdatedAt } =
    useProcesoResumen<RecepcionResumen>('recepcion-resumen');

  return (
    <Stack
      spacing={1.5}
      sx={{ height: '100%', minHeight: 0, overflowY: 'auto', overflowX: 'hidden', pb: 1.5 }}
    >
      <ProcessFilters
        title="Filtros de recepción"
        hint="Los contadores muestran el día en curso; las tarjetas y la tabla responden al rango de fechas."
        hideTurno
      />

      <ResumenCards
        title="Recepción de Camarón — Hoy"
        icon={<MoveToInboxOutlinedIcon color="primary" sx={{ fontSize: 16 }} />}
        isLoading={isLoading}
        isError={isError}
        errorText={error instanceof Error ? error.message : undefined}
        periodoLabel={data ? formatPeriodo(data.dia) : undefined}
        updatedAt={dataUpdatedAt}
        emptyText="Sin recepción registrada hoy."
        metrics={[
          { label: 'Libras recibidas hoy', value: data?.librasRecibidasHoy ?? 0, unit: 'lbs', tone: 'good' },
          { label: 'Remisiones hoy', value: data?.remisionesHoy ?? 0, unit: 'remisiones' },
          {
            label: 'Libras pendientes de procesar',
            value: data?.librasPendientesProcesar ?? 0,
            unit: 'lbs',
            tone: 'warn',
          },
          { label: 'Fincas activas hoy', value: data?.fincasActivasHoy ?? 0, unit: 'fincas' },
        ]}
      />

      <ChartWidget config={porFinca} />

      <WidgetDataTable
        title="Remisiones Recibidas — Detalle"
        subtitle="Una fila por remisión, finca y laguna · rango de fechas del filtro · fuente: RemisionesPlantaPBI"
        icon={<ReceiptLongOutlinedIcon color="primary" sx={{ fontSize: 16 }} />}
        endpoint="recepcion-remisiones"
        defaultSortKey="fecha"
        maxHeight={520}
        emptyText="Sin remisiones recibidas en el rango seleccionado."
        columns={[
          { key: 'fecha', label: 'Fecha remisión', format: 'periodo' },
          { key: 'cliente', label: 'Cliente' },
          { key: 'codigoFinca', label: 'Código finca' },
          { key: 'laguna', label: 'Laguna' },
          { key: 'remision', label: 'Remisión planta' },
          { key: 'librasRemision', label: 'Libras remisión', format: 'number', total: 'sum' },
          { key: 'librasBasura', label: 'L. basura', format: 'number' },
          { key: 'librasCola', label: 'Libras cola', format: 'number', total: 'sum' },
          { key: 'librasCabeza', label: 'Libras cabeza', format: 'number', total: 'sum' },
          { key: 'totalColaCabeza', label: 'Total cola + cabeza', format: 'number', total: 'sum' },
          {
            key: 'rendimientoFinca',
            label: 'Rend. finca',
            format: 'percent',
            total: { ratio: ['librasCola', 'librasRemision'] },
          },
          {
            key: 'rendimientoPlanta',
            label: 'Rend. planta',
            format: 'percent',
            total: { ratio: ['librasCola', 'totalColaCabeza'] },
          },
        ]}
      />
    </Stack>
  );
}
