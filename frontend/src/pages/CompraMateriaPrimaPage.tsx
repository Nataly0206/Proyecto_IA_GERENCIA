import { Box, Stack } from '@mui/material';
import ShoppingCartOutlinedIcon from '@mui/icons-material/ShoppingCartOutlined';
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import ProcessFilters from '../components/filters/ProcessFilters';
import ResumenCards from '../components/live/ResumenCards';
import ChartWidget from '../components/charts/ChartWidget';
import MateriaPrimaProveedorWidget from '../components/charts/MateriaPrimaProveedorWidget';
import GroupedItemsTable from '../components/charts/GroupedItemsTable';
import { useProcesoResumen } from '../hooks/useDashboardData';
import { CompraMpResumen } from '../types';
import { formatPeriodo } from '../utils/format';
import { compraMpWidgets } from '../config/dashboardConfig';

const [porProveedor] = compraMpWidgets;
const TABLE_H = 460;

export default function CompraMateriaPrimaPage({ userId }: { userId: string }) {
  const { data, isLoading, isError, error, dataUpdatedAt } =
    useProcesoResumen<CompraMpResumen>('compra-mp-resumen');

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
        title="Filtros de compra de materia prima"
        hint="Los contadores muestran la semana y el mes en curso; el desglose por proveedor responde al rango de fechas."
        hideTurno
      />

      <ResumenCards
        title="Materia Prima — Semana y mes en curso"
        icon={<ShoppingCartOutlinedIcon color="primary" sx={{ fontSize: 16 }} />}
        liveBadge={false}
        isLoading={isLoading}
        isError={isError}
        errorText={error instanceof Error ? error.message : undefined}
        updatedAt={dataUpdatedAt}
        periodoLabel={semana}
        emptyText="Sin materia prima registrada."
        metrics={[
          { label: 'Órdenes de compra — semana actual', value: data?.ordenesCompraSemana ?? 0, unit: 'órdenes' },
          { label: 'Libras recibidas — semana', value: data?.librasRecibidasSemana ?? 0, unit: 'lbs' },
          { label: 'Libras recibidas — mes', value: data?.librasRecibidasMes ?? 0, unit: 'lbs' },
          { label: 'Libras promedio por semana', value: data?.librasPromedioSemana ?? 0, unit: 'lbs/semana' },
        ]}
      />

      <ChartWidget config={porProveedor} />

      <GroupedItemsTable
        title="Materia Prima por Proveedor e Item"
        subtitle="Tipo, proveedor e item · rango de fechas del filtro · fuente: AV_MateriaPrima"
        icon={<Inventory2OutlinedIcon color="primary" sx={{ fontSize: 16 }} />}
        endpoint="compra-mp-por-item"
        emptyText="Sin materia prima registrada en el rango seleccionado."
      />

      <Box sx={{ height: TABLE_H, flexShrink: 0 }}>
        <MateriaPrimaProveedorWidget userId={userId} height={TABLE_H} />
      </Box>
    </Stack>
  );
}
