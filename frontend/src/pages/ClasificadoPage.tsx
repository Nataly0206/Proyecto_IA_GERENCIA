import { useState } from 'react';
import { Box, Button, Dialog, DialogContent, DialogTitle, IconButton, Stack } from '@mui/material';
import SortOutlinedIcon from '@mui/icons-material/SortOutlined';
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import CloseOutlinedIcon from '@mui/icons-material/CloseOutlined';
import ProcessFilters from '../components/filters/ProcessFilters';
import ResumenCards from '../components/live/ResumenCards';
import ChartWidget from '../components/charts/ChartWidget';
import ClasificadoTallaWidget from '../components/charts/ClasificadoTallaWidget';
import InventarioTallaTable from '../components/charts/InventarioTallaTable';
import { useProcesoResumen } from '../hooks/useDashboardData';
import { ClasificadoResumen } from '../types';
import { formatPeriodo } from '../utils/format';
import { clasificadoWidgets } from '../config/dashboardConfig';

const [porMaquina, , porTallaDia, porTallaMes] = clasificadoWidgets;
const TABLE_H = 440;

export default function ClasificadoPage() {
  const [tallaOpen, setTallaOpen] = useState(false);
  const { data, isLoading, isError, error, dataUpdatedAt } =
    useProcesoResumen<ClasificadoResumen>('clasificado-resumen');

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
        title="Filtros de clasificado"
        hint="Los contadores muestran el día, la semana y el mes en curso; el inventario es el disponible ahora. Las tarjetas y las tablas por talla responden al rango de fechas y turno."
      />

      <ResumenCards
        title="Clasificado — Libras"
        icon={<SortOutlinedIcon color="primary" sx={{ fontSize: 16 }} />}
        isLoading={isLoading}
        isError={isError}
        errorText={error instanceof Error ? error.message : undefined}
        periodoLabel={semana}
        updatedAt={dataUpdatedAt}
        emptyText="Sin clasificado registrado en el período."
        metrics={[
          {
            label: 'Libras clasificadas hoy',
            value: data?.librasClasificadasHoy ?? 0,
            unit: 'lbs',
            tone: 'good',
          },
          {
            label: 'Libras clasificadas por semana',
            value: data?.librasClasificadasSemana ?? 0,
            unit: 'lbs',
          },
          {
            label: 'Libras clasificadas por mes',
            value: data?.librasClasificadasMes ?? 0,
            unit: 'lbs',
          },
          {
            label: 'Libras clasificadas por hora',
            value: data?.librasClasificadasPorHora ?? 0,
            unit: 'lbs/h',
            format: 'decimal',
          },
        ]}
      />

      <InventarioTallaTable
        title="Inventario de Clasificado Disponible"
        subtitle="Bins y libras por talla · EnInventario = 1, Transferido = 0, Procesado = 0 · fuente: CL_InventarioClasificado"
        icon={<Inventory2OutlinedIcon color="primary" sx={{ fontSize: 16 }} />}
        endpoint="clasificado-inventario"
      />

      <ChartWidget
        config={porMaquina}
        actions={
          <Button
            size="small"
            variant="outlined"
            startIcon={<VisibilityOutlinedIcon />}
            onClick={() => setTallaOpen(true)}
            sx={{ whiteSpace: 'nowrap', fontWeight: 700 }}
          >
            Ver por talla
          </Button>
        }
      />
      <Dialog open={tallaOpen} onClose={() => setTallaOpen(false)} fullWidth maxWidth="md">
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', py: 1.5 }}>
          Detalle de libras clasificadas por talla
          <IconButton aria-label="Cerrar detalle por talla" onClick={() => setTallaOpen(false)}>
            <CloseOutlinedIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers sx={{ p: 1.5 }}>
          {tallaOpen && <ClasificadoTallaWidget />}
        </DialogContent>
      </Dialog>
      <Box sx={{ height: TABLE_H, flexShrink: 0 }}>
        <ChartWidget config={porTallaDia} />
      </Box>
      <Box sx={{ height: TABLE_H, flexShrink: 0 }}>
        <ChartWidget config={porTallaMes} />
      </Box>
    </Stack>
  );
}
