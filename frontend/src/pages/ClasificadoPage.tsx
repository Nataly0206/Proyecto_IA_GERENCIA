import { Box, Stack } from '@mui/material';
import SortOutlinedIcon from '@mui/icons-material/SortOutlined';
import ProcessFilters from '../components/filters/ProcessFilters';
import ResumenCards from '../components/live/ResumenCards';
import ChartWidget from '../components/charts/ChartWidget';
import { useProcesoResumen } from '../hooks/useDashboardData';
import { ClasificadoResumen } from '../types';
import { formatPeriodo } from '../utils/format';
import { clasificadoWidgets } from '../config/dashboardConfig';

const [porMaquina, porTalla, porTallaDia, porTallaMes, porMaquinaDia, porMaquinaMes] =
  clasificadoWidgets;
const TABLE_H = 440;

export default function ClasificadoPage() {
  const { data, isLoading, isError, error, dataUpdatedAt } =
    useProcesoResumen<ClasificadoResumen>('clasificado-resumen');

  return (
    <Stack
      spacing={1.5}
      sx={{ height: '100%', minHeight: 0, overflowY: 'auto', overflowX: 'hidden', pb: 1.5 }}
    >
      <ProcessFilters
        title="Filtros de clasificado"
        hint="Los contadores muestran el día en curso y el inventario disponible; las tarjetas y tablas responden al rango de fechas y turno."
      />

      <ResumenCards
        title="Clasificado — Hoy"
        icon={<SortOutlinedIcon color="primary" sx={{ fontSize: 16 }} />}
        isLoading={isLoading}
        isError={isError}
        errorText={error instanceof Error ? error.message : undefined}
        periodoLabel={data ? formatPeriodo(data.dia) : undefined}
        updatedAt={dataUpdatedAt}
        emptyText="Sin clasificado registrado hoy."
        metrics={[
          {
            label: 'Libras clasificadas hoy',
            value: data?.librasClasificadasHoy ?? 0,
            unit: 'lbs',
            tone: 'good',
          },
          { label: 'Bins clasificados hoy', value: data?.binsHoy ?? 0, unit: 'bins' },
          {
            label: 'Inventario clasificado disponible',
            value: data?.inventarioLibras ?? 0,
            unit: 'lbs',
          },
          { label: 'Bins en inventario', value: data?.inventarioBins ?? 0, unit: 'bins' },
        ]}
      />

      <ChartWidget config={porMaquina} />
      <ChartWidget config={porTalla} />
      <Box sx={{ height: TABLE_H, flexShrink: 0 }}>
        <ChartWidget config={porMaquinaDia} />
      </Box>
      <Box sx={{ height: TABLE_H, flexShrink: 0 }}>
        <ChartWidget config={porMaquinaMes} />
      </Box>
      <Box sx={{ height: TABLE_H, flexShrink: 0 }}>
        <ChartWidget config={porTallaDia} />
      </Box>
      <Box sx={{ height: TABLE_H, flexShrink: 0 }}>
        <ChartWidget config={porTallaMes} />
      </Box>
    </Stack>
  );
}
