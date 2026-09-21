import { useMemo, useState } from 'react';
import { Box, Button, Stack } from '@mui/material';
import ShoppingCartOutlinedIcon from '@mui/icons-material/ShoppingCartOutlined';
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import VisibilityOffOutlinedIcon from '@mui/icons-material/VisibilityOffOutlined';
import ProcessFilters from '../components/filters/ProcessFilters';
import ResumenCards from '../components/live/ResumenCards';
import MateriaPrimaProveedorCombinedCards from '../components/charts/MateriaPrimaProveedorCombinedCards';
import MateriaPrimaProveedorWidget from '../components/charts/MateriaPrimaProveedorWidget';
import MateriaPrimaTallaTable from '../components/charts/MateriaPrimaTallaTable';
import { useProcesoResumen } from '../hooks/useDashboardData';
import { CompraMpResumen } from '../types';
import { formatPeriodo } from '../utils/format';
import { useHiddenProveedores } from '../utils/hiddenProveedores';

const TABLE_H = 460;
const WSO_A_HOSO_FACTOR = 0.65;
const toHoso = (value: number | undefined): number => (value ?? 0) / WSO_A_HOSO_FACTOR;

export default function CompraMateriaPrimaPage({ userId }: { userId: string }) {
  const [showDetalle, setShowDetalle] = useState(false);
  const [hiddenProveedores, setHiddenProveedores] = useHiddenProveedores(userId);
  const excludedProveedores = useMemo(
    () => Array.from(hiddenProveedores).sort().join(','),
    [hiddenProveedores],
  );
  const { data, isLoading, isError, error, dataUpdatedAt } =
    useProcesoResumen<CompraMpResumen>('compra-mp-resumen', excludedProveedores ? { excluded: excludedProveedores } : undefined);

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
        hint="Los contadores muestran libras HOSO equivalentes (valor ÷ 0.65) del día efectivo, semana y mes, excluyendo los proveedores ocultos en “Proveedores”; el desglose por proveedor responde al rango de fechas."
        hideTurno
      />

      <ResumenCards
        title="Materia Prima HOSO — Día, semana y mes"
        icon={<ShoppingCartOutlinedIcon color="primary" sx={{ fontSize: 16 }} />}
        liveBadge={false}
        isLoading={isLoading}
        isError={isError}
        errorText={error instanceof Error ? error.message : undefined}
        updatedAt={dataUpdatedAt}
        periodoLabel={semana}
        emptyText="Sin materia prima registrada."
        metrics={[
          { label: 'Libras — hoy', value: toHoso(data?.librasRecibidasHoy), unit: 'lbs' },
          { label: 'Libras — semana', value: toHoso(data?.librasRecibidasSemana), unit: 'lbs' },
          { label: 'Libras — mes', value: toHoso(data?.librasRecibidasMes), unit: 'lbs' },
          { label: 'Promedio por semana', value: toHoso(data?.librasPromedioSemana), unit: 'lbs/semana' },
        ]}
      />

      <MateriaPrimaProveedorCombinedCards hidden={hiddenProveedores} setHidden={setHiddenProveedores} actions={
        <Button size="small" variant="outlined" startIcon={showDetalle ? <VisibilityOffOutlinedIcon sx={{ fontSize: 16 }} /> : <VisibilityOutlinedIcon sx={{ fontSize: 16 }} />} onClick={() => setShowDetalle((v) => !v)} sx={{ fontSize: 11, fontWeight: 700, py: 0.4 }}>
          {showDetalle ? 'Ocultar Detalle' : 'Ver Detalle'}
        </Button>
      } />

      {showDetalle && (
        <MateriaPrimaTallaTable
          title="Detalle de Materia Prima por Talla"
          subtitle="Libras por proveedor y talla · rango de fechas del filtro · fuente: AV_MateriaPrima"
          icon={<Inventory2OutlinedIcon color="primary" sx={{ fontSize: 16 }} />}
          emptyText="Sin materia prima registrada en el rango seleccionado."
          hiddenProviders={hiddenProveedores}
        />
      )}

      <Box sx={{ height: TABLE_H, flexShrink: 0 }}>
        <MateriaPrimaProveedorWidget hidden={hiddenProveedores} height={TABLE_H} />
      </Box>
    </Stack>
  );
}
