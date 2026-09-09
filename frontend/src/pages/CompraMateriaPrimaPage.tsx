import { useState } from 'react';
import { Box, Button, Stack } from '@mui/material';
import ShoppingCartOutlinedIcon from '@mui/icons-material/ShoppingCartOutlined';
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import VisibilityOffOutlinedIcon from '@mui/icons-material/VisibilityOffOutlined';
import ProcessFilters from '../components/filters/ProcessFilters';
import ResumenCards from '../components/live/ResumenCards';
import ChartWidget from '../components/charts/ChartWidget';
import MateriaPrimaProveedorWidget from '../components/charts/MateriaPrimaProveedorWidget';
import MateriaPrimaTallaTable from '../components/charts/MateriaPrimaTallaTable';
import { useProcesoResumen } from '../hooks/useDashboardData';
import { ChartConfig, CompraMpResumen, DataRow } from '../types';
import { formatPeriodo } from '../utils/format';
import { compraMpWidgets } from '../config/dashboardConfig';

const [porProveedor] = compraMpWidgets;
const TABLE_H = 460;

/** "Entero" = equivalente en libras de camarón entero antes de pelar/limpiar.
 *  WSO (whole shell-on, lo que se recibe) rinde ~65% del peso entero, así
 *  que el entero equivalente es WSO ÷ 0.65. */
const WSO_A_ENTERO_FACTOR = 0.65;
const porProveedorEntero: ChartConfig = {
  ...porProveedor,
  id: 'compra-mp-por-proveedor-entero',
  title: 'Materia Prima por Proveedor Entero',
  subtitle: 'Equivalente en libras enteras (WSO ÷ 0.65) · rango de fechas del filtro',
  unitLabel: 'lbs enteras (equiv.)',
};
const toEntero = (rows: DataRow[]): DataRow[] =>
  rows.map((r) => ({ ...r, libras: Number(r.libras ?? 0) / WSO_A_ENTERO_FACTOR }));

export default function CompraMateriaPrimaPage({ userId }: { userId: string }) {
  const { data, isLoading, isError, error, dataUpdatedAt } =
    useProcesoResumen<CompraMpResumen>('compra-mp-resumen');
  const [showDetalle, setShowDetalle] = useState(false);

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
          { label: 'Órdenes de compra — Hoy', value: data?.ordenesCompraHoy ?? 0, unit: 'órdenes' },
          { label: 'Libras recibidas — semana', value: data?.librasRecibidasSemana ?? 0, unit: 'lbs' },
          { label: 'Libras recibidas — mes', value: data?.librasRecibidasMes ?? 0, unit: 'lbs' },
          { label: 'Libras promedio por semana', value: data?.librasPromedioSemana ?? 0, unit: 'lbs/semana' },
        ]}
      />

      <ChartWidget
        config={porProveedor}
        actions={
          <Button
            size="small"
            variant="outlined"
            startIcon={showDetalle ? <VisibilityOffOutlinedIcon sx={{ fontSize: 16 }} /> : <VisibilityOutlinedIcon sx={{ fontSize: 16 }} />}
            onClick={() => setShowDetalle((v) => !v)}
            sx={{ fontSize: 11, fontWeight: 700, py: 0.4 }}
          >
            {showDetalle ? 'Ocultar Detalle' : 'Ver Detalle'}
          </Button>
        }
      />

      {showDetalle && (
        <MateriaPrimaTallaTable
          title="Detalle de Materia Prima por Talla"
          subtitle="Libras por proveedor y talla · rango de fechas del filtro · fuente: AV_MateriaPrima"
          icon={<Inventory2OutlinedIcon color="primary" sx={{ fontSize: 16 }} />}
          emptyText="Sin materia prima registrada en el rango seleccionado."
        />
      )}

      <ChartWidget config={porProveedorEntero} transform={toEntero} />

      <Box sx={{ height: TABLE_H, flexShrink: 0 }}>
        <MateriaPrimaProveedorWidget userId={userId} height={TABLE_H} />
      </Box>
    </Stack>
  );
}
