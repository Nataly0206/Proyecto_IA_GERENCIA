import { Box, Stack } from '@mui/material';
import MoveToInboxOutlinedIcon from '@mui/icons-material/MoveToInboxOutlined';
import ProcessFilters from '../components/filters/ProcessFilters';
import ResumenCards from '../components/live/ResumenCards';
import ChartWidget from '../components/charts/ChartWidget';
import { useProcesoResumen } from '../hooks/useDashboardData';
import { RecepcionResumen } from '../types';
import { formatPeriodo } from '../utils/format';
import { recepcionWidgets } from '../config/dashboardConfig';

const [porFinca, porFincaDia, porFincaMes] = recepcionWidgets;
const TABLE_H = 440;

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
        hint="Los contadores muestran el día en curso; las tarjetas y tablas responden al rango de fechas."
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
      <Box sx={{ height: TABLE_H, flexShrink: 0 }}>
        <ChartWidget config={porFincaDia} />
      </Box>
      <Box sx={{ height: TABLE_H, flexShrink: 0 }}>
        <ChartWidget config={porFincaMes} />
      </Box>
    </Stack>
  );
}
