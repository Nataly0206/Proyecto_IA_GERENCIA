import { Box, Stack } from '@mui/material';
import SetMealOutlinedIcon from '@mui/icons-material/SetMealOutlined';
import ProcessFilters from '../components/filters/ProcessFilters';
import ResumenCards from '../components/live/ResumenCards';
import WidgetDataTable from '../components/charts/WidgetDataTable';
import { useProcesoResumen } from '../hooks/useDashboardData';
import { DescabezadoResumen } from '../types';
import { formatPeriodo } from '../utils/format';
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
        hint="Los contadores muestran el día, semana y mes en curso; la tabla diaria responde al rango de fechas."
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
            label: 'Personas descabezando hoy',
            value: data?.personasDia ?? 0,
            unit: 'personas',
          },
          {
            label: 'Libras descabezadas hoy',
            value: data?.librasDescabezadasDia ?? 0,
            unit: 'lbs',
            tone: 'good',
          },
          {
            label: 'Libras descabezadas en la semana',
            value: data?.librasDescabezadasSemana ?? 0,
            unit: 'lbs',
          },
          {
            label: 'Libras descabezadas en el mes',
            value: data?.librasDescabezadasMes ?? 0,
            unit: 'lbs',
          },
        ]}
      />

      <Box sx={{ flexShrink: 0 }}>
        <WidgetDataTable
          title="Libras Descabezadas — Diario"
          subtitle="Rango de fechas seleccionado · personas sin repetir por fecha"
          icon={<SetMealOutlinedIcon color="primary" sx={{ fontSize: 16 }} />}
          endpoint="descabezado-por-dia"
          defaultSortKey="fecha"
          maxHeight={TABLE_H}
          columns={[
            { key: 'fecha', label: 'Fecha', format: 'periodo' },
            { key: 'personas', label: 'Personas', format: 'number', total: 'sum', average: true },
            { key: 'cola', label: 'Cola', format: 'number', total: 'sum', average: true },
            { key: 'cabezas', label: 'Cabezas', format: 'number', total: 'sum', average: true },
            { key: 'librasPorHora', label: 'Libras por hora', format: 'decimal', total: { ratio: ['total', 'horas'] }, average: true },
            { key: 'total', label: 'Total', format: 'number', total: 'sum', average: true },
          ]}
        />
      </Box>
      <Box sx={{ flexShrink: 0 }}>
        <WidgetDataTable
          title="Libras Descabezadas — Mensual"
          subtitle="Últimos 12 meses · cada persona se cuenta una vez por mes"
          icon={<SetMealOutlinedIcon color="primary" sx={{ fontSize: 16 }} />}
          endpoint="descabezado-por-dia-mes"
          defaultSortKey="fecha"
          maxHeight={TABLE_H}
          columns={[
            { key: 'fecha', label: 'Fecha' },
            { key: 'personas', label: 'Personas', format: 'number', total: 'sum', average: true },
            { key: 'cola', label: 'Cola', format: 'number', total: 'sum', average: true },
            { key: 'cabezas', label: 'Cabezas', format: 'number', total: 'sum', average: true },
            { key: 'librasPorHora', label: 'Libras por hora', format: 'decimal', total: { ratio: ['total', 'horas'] }, average: true },
            { key: 'total', label: 'Total', format: 'number', total: 'sum', average: true },
          ]}
        />
      </Box>
    </Stack>
  );
}
