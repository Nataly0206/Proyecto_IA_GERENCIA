import { useMemo, useState } from 'react';
import { Box, Stack, ToggleButton } from '@mui/material';
import ShoppingCartOutlinedIcon from '@mui/icons-material/ShoppingCartOutlined';
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import VisibilityOffOutlinedIcon from '@mui/icons-material/VisibilityOffOutlined';
import CalendarMonthOutlinedIcon from '@mui/icons-material/CalendarMonthOutlined';
import ProcessFilters from '../components/filters/ProcessFilters';
import ResumenCards from '../components/live/ResumenCards';
import MateriaPrimaProveedorCombinedCards from '../components/charts/MateriaPrimaProveedorCombinedCards';
import MateriaPrimaProveedorWidget from '../components/charts/MateriaPrimaProveedorWidget';
import MateriaPrimaTallaTable from '../components/charts/MateriaPrimaTallaTable';
import MateriaPrimaProveedorDiarioTable from '../components/charts/MateriaPrimaProveedorDiarioTable';
import { useProcesoResumen } from '../hooks/useDashboardData';
import { CompraMpResumen } from '../types';
import { formatPeriodo } from '../utils/format';
import { useHiddenProveedores } from '../utils/hiddenProveedores';

const TABLE_H = 460;
const WSO_A_HOSO_FACTOR = 0.65;
const toHoso = (value: number | undefined): number => (value ?? 0) / WSO_A_HOSO_FACTOR;

export default function CompraMateriaPrimaPage({ userId }: { userId: string }) {
  const [showDetalle, setShowDetalle] = useState(false);
  const [periodReport, setPeriodReport] = useState<'dia' | 'semana' | null>(null);
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
        showWhenAllZero
        metrics={[
          { label: 'Libras — hoy', value: toHoso(data?.librasRecibidasHoy), unit: 'lbs' },
          { label: 'Libras — semana', value: toHoso(data?.librasRecibidasSemana), unit: 'lbs' },
          { label: 'Libras — mes', value: toHoso(data?.librasRecibidasMes), unit: 'lbs' },
          { label: 'Promedio por semana', value: toHoso(data?.librasPromedioSemana), unit: 'lbs/semana' },
        ]}
      />

      <MateriaPrimaProveedorCombinedCards hidden={hiddenProveedores} setHidden={setHiddenProveedores} actions={[
          <ToggleButton key="dia" value="dia" selected={periodReport === 'dia'} aria-label="Ver reporte diario"
            onClick={() => setPeriodReport((value) => value === 'dia' ? null : 'dia')}>
            <CalendarMonthOutlinedIcon sx={{ fontSize: 14, mr: 0.5 }} />Diario
          </ToggleButton>
          ,<ToggleButton key="semana" value="semana" selected={periodReport === 'semana'} aria-label="Ver reporte semanal"
            onClick={() => setPeriodReport((value) => value === 'semana' ? null : 'semana')}>
            <CalendarMonthOutlinedIcon sx={{ fontSize: 14, mr: 0.5 }} />Semanal
          </ToggleButton>
          ,<ToggleButton key="detalle" value="detalle" selected={showDetalle} aria-label="Ver detalle por talla" onClick={() => setShowDetalle((value) => !value)}>
            {showDetalle ? <VisibilityOffOutlinedIcon sx={{ fontSize: 14, mr: 0.5 }} /> : <VisibilityOutlinedIcon sx={{ fontSize: 14, mr: 0.5 }} />}
            Detalle
          </ToggleButton>
      ]} />

      {periodReport && <MateriaPrimaProveedorDiarioTable hiddenProviders={hiddenProveedores} period={periodReport} />}

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
