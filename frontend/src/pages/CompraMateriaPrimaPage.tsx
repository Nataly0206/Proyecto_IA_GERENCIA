import { Box, Stack } from '@mui/material';
import ShoppingCartOutlinedIcon from '@mui/icons-material/ShoppingCartOutlined';
import AssignmentLateOutlinedIcon from '@mui/icons-material/AssignmentLateOutlined';
import ProcessFilters from '../components/filters/ProcessFilters';
import ResumenCards from '../components/live/ResumenCards';
import ChartWidget from '../components/charts/ChartWidget';
import WidgetDataTable from '../components/charts/WidgetDataTable';
import { useProcesoResumen } from '../hooks/useDashboardData';
import { CompraMpResumen } from '../types';
import { compraMpWidgets } from '../config/dashboardConfig';

const [porProveedor, porProveedorMes] = compraMpWidgets;
const TABLE_H = 460;

export default function CompraMateriaPrimaPage() {
  const { data, isLoading, isError, error, dataUpdatedAt } =
    useProcesoResumen<CompraMpResumen>('compra-mp-resumen');

  return (
    <Stack
      spacing={1.5}
      sx={{ height: '100%', minHeight: 0, overflowY: 'auto', overflowX: 'hidden', pb: 1.5 }}
    >
      <ProcessFilters
        title="Filtros de compra de materia prima"
        hint="El avance de órdenes es global; la materia prima por proveedor responde al rango de fechas."
      />

      <ResumenCards
        title="Órdenes de Compra de Exportación"
        icon={<ShoppingCartOutlinedIcon color="primary" sx={{ fontSize: 16 }} />}
        liveBadge={false}
        isLoading={isLoading}
        isError={isError}
        errorText={error instanceof Error ? error.message : undefined}
        updatedAt={dataUpdatedAt}
        periodoLabel="Avance global"
        emptyText="Sin órdenes de compra registradas."
        metrics={[
          {
            label: 'Órdenes pendientes de exportación',
            value: data?.ordenesPendientes ?? 0,
            unit: 'órdenes',
            tone: 'warn',
          },
          { label: 'Órdenes totales', value: data?.ordenesTotales ?? 0, unit: 'órdenes' },
          { label: 'Kg faltantes por producir', value: data?.kgFaltantes ?? 0, unit: 'kg', tone: 'warn' },
          { label: 'Másteres faltantes', value: data?.masteresFaltantes ?? 0, unit: 'másteres' },
        ]}
      />

      <WidgetDataTable
        title="Órdenes Pendientes de Exportación"
        subtitle="Por cliente y producto · código de exportación y anillos por máster"
        icon={<AssignmentLateOutlinedIcon color="primary" sx={{ fontSize: 16 }} />}
        endpoint="compra-mp-ordenes"
        defaultSortKey="kgFaltantes"
        emptyText="No hay órdenes de compra pendientes."
        columns={[
          { key: 'noOrden', label: 'N.º orden' },
          { key: 'cliente', label: 'Cliente' },
          { key: 'producto', label: 'Producto' },
          { key: 'codigoExportacion', label: 'Cód. exportación' },
          { key: 'estilo', label: 'Estilo' },
          { key: 'anillosXMaster', label: 'Anillos/máster', format: 'number' },
          { key: 'semanaETD', label: 'Semana ETD' },
          { key: 'kg', label: 'Kg orden', format: 'number' },
          { key: 'kgProducidos', label: 'Kg producidos', format: 'number' },
          { key: 'kgFaltantes', label: 'Kg faltantes', format: 'number' },
          { key: 'estado', label: 'Estado' },
        ]}
      />

      <ChartWidget config={porProveedor} />
      <Box sx={{ height: TABLE_H, flexShrink: 0 }}>
        <ChartWidget config={porProveedorMes} />
      </Box>
    </Stack>
  );
}
