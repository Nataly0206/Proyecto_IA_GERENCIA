import { Box, Stack } from '@mui/material';
import SetMealOutlinedIcon from '@mui/icons-material/SetMealOutlined';
import ProcessFilters from '../components/filters/ProcessFilters';
import ResumenCards from '../components/live/ResumenCards';
import ChartWidget from '../components/charts/ChartWidget';
import { useProcesoResumen } from '../hooks/useDashboardData';
import { DescabezadoResumen } from '../types';
import { formatPeriodo } from '../utils/format';
import { descabezadoWidgets } from '../config/dashboardConfig';

const [porDia, porDiaMes] = descabezadoWidgets;
const TABLE_H = 440;

export default function DescabezadoPage() {
  const { data, isLoading, isError, error, dataUpdatedAt } =
    useProcesoResumen<DescabezadoResumen>('descabezado-resumen');

  return (
    <Stack
      spacing={1.5}
      sx={{ height: '100%', minHeight: 0, overflowY: 'auto', overflowX: 'hidden', pb: 1.5 }}
    >
      <ProcessFilters
        title="Filtros de descabezado"
        hint="Los contadores muestran el día en curso; las tablas responden al rango de fechas."
        hideTurno
      />

      <ResumenCards
        title="Descabezado — Hoy"
        icon={<SetMealOutlinedIcon color="primary" sx={{ fontSize: 16 }} />}
        isLoading={isLoading}
        isError={isError}
        errorText={error instanceof Error ? error.message : undefined}
        periodoLabel={data ? formatPeriodo(data.dia) : undefined}
        updatedAt={dataUpdatedAt}
        emptyText="Sin descabezado registrado hoy."
        metrics={[
          {
            label: 'Libras descabezadas al día',
            value: data?.librasDescabezadasDia ?? 0,
            unit: 'lbs',
            tone: 'good',
          },
          {
            label: 'Personas descabezando por día',
            value: data?.personasDia ?? 0,
            unit: 'personas',
          },
          {
            label: 'Gramaje promedio',
            value: 0,
            display: data?.gramajePromedio || undefined,
          },
          {
            label: 'Costo por libra',
            value: data?.costoPorLibra ?? 0,
            format: 'currency',
            tone: 'warn',
          },
        ]}
      />

      <Box sx={{ height: TABLE_H, flexShrink: 0 }}>
        <ChartWidget config={porDia} />
      </Box>
      <Box sx={{ height: TABLE_H, flexShrink: 0 }}>
        <ChartWidget config={porDiaMes} />
      </Box>
    </Stack>
  );
}
