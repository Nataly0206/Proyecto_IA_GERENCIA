import { useEffect, useMemo, useState } from 'react';
import { Alert, Box, Button, Checkbox, Dialog, DialogContent, DialogTitle, Divider, FormControlLabel, IconButton, Popover, Stack, Typography } from '@mui/material';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { apiClient } from '../api/client';
import { AuthUser } from '../types/auth';
import { tienePermiso } from '../config/permissions';
import SortOutlinedIcon from '@mui/icons-material/SortOutlined';
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import CloseOutlinedIcon from '@mui/icons-material/CloseOutlined';
import PrecisionManufacturingOutlinedIcon from '@mui/icons-material/PrecisionManufacturingOutlined';
import ProcessFilters from '../components/filters/ProcessFilters';
import ResumenCards from '../components/live/ResumenCards';
import ClasificadoPorMaquinaHoyCards from '../components/live/ClasificadoPorMaquinaHoyCards';
import ChartWidget from '../components/charts/ChartWidget';
import ClasificadoTallaWidget from '../components/charts/ClasificadoTallaWidget';
import InventarioTallaTable from '../components/charts/InventarioTallaTable';
import { useProcesoResumen, useWidgetData } from '../hooks/useDashboardData';
import { ClasificadoResumen } from '../types';
import { formatPeriodo } from '../utils/format';
import { clasificadoWidgets } from '../config/dashboardConfig';

const [porMaquina, , porTallaDia, porTallaMes] = clasificadoWidgets;
const TABLE_H = 440;
const SIZE_ORDER_QUERY_KEY = ['clasificado', 'orden-tallas'] as const;
const MACHINES_STORAGE_KEY = 'clasificado-maquinas-ocultas:v1';
type SizeOrderResponse = { order: string[]; sizes: string[] };

function readHiddenMachines(userId: string): Set<string> {
  try {
    const raw = localStorage.getItem(`${MACHINES_STORAGE_KEY}:${userId}`);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed.filter((machine): machine is string => typeof machine === 'string') : []);
  } catch {
    return new Set();
  }
}

export default function ClasificadoPage({ user }: { user: AuthUser }) {
  const queryClient = useQueryClient();
  const [tallaOpen, setTallaOpen] = useState(false);
  const [orderSaving, setOrderSaving] = useState(false);
  const [orderError, setOrderError] = useState('');
  const [machineAnchor, setMachineAnchor] = useState<HTMLElement | null>(null);
  const [hiddenMachines, setHiddenMachines] = useState<Set<string>>(() => readHiddenMachines(user.id));
  const [machinesPreferencesUserId, setMachinesPreferencesUserId] = useState<string | null>(null);
  const [machinesSaveError, setMachinesSaveError] = useState('');
  const { data, isLoading, isError, error, dataUpdatedAt } =
    useProcesoResumen<ClasificadoResumen>('clasificado-resumen');
  const { data: machineData } = useWidgetData('clasificado-por-maquina');
  const { data: sizeOrder, isError: sizeOrderError } = useQuery<SizeOrderResponse>({
    queryKey: SIZE_ORDER_QUERY_KEY,
    queryFn: async () => (await apiClient.get<SizeOrderResponse>('/dashboard/clasificado-orden-tallas')).data,
    refetchInterval: 30_000,
  });
  const orderedSizes = useMemo(() => {
    const sizes = new Set(sizeOrder?.sizes ?? []);
    return [
      ...(sizeOrder?.order ?? []).filter((size) => sizes.delete(size)),
      ...Array.from(sizes),
    ];
  }, [sizeOrder]);
  const canOrderSizes = tienePermiso(user, 'ordenar_tallas_clasificado');
  const machines = useMemo(() => Array.from(new Set(
    (machineData ?? []).map((row) => String(row.maquina ?? '')),
  )).filter(Boolean).sort(), [machineData]);
  const visibleMachines = machines.filter((machine) => !hiddenMachines.has(machine)).length;

  useEffect(() => {
    let active = true;
    setMachinesPreferencesUserId(null);
    apiClient.get<{ hiddenMachines: string[] | null }>('/dashboard/clasificado-preferencias-maquinas')
      .then(({ data }) => {
        if (!active) return;
        setHiddenMachines(Array.isArray(data.hiddenMachines)
          ? new Set(data.hiddenMachines)
          : readHiddenMachines(user.id));
        setMachinesPreferencesUserId(user.id);
      })
      .catch(() => {
        if (active) setMachinesSaveError('No se pudo cargar la selección de máquinas guardada.');
      });
    return () => { active = false; };
  }, [user.id]);

  useEffect(() => {
    try {
      localStorage.setItem(`${MACHINES_STORAGE_KEY}:${user.id}`, JSON.stringify(Array.from(hiddenMachines)));
    } catch {
      // La selección permanece activa durante esta sesión.
    }
  }, [hiddenMachines, user.id]);

  useEffect(() => {
    if (machinesPreferencesUserId !== user.id) return;
    const timeout = window.setTimeout(() => {
      void apiClient.put('/dashboard/clasificado-preferencias-maquinas', {
        hiddenMachines: Array.from(hiddenMachines),
      }).then(() => setMachinesSaveError(''))
        .catch(() => setMachinesSaveError('No se pudo guardar la selección de máquinas.'));
    }, 300);
    return () => window.clearTimeout(timeout);
  }, [hiddenMachines, machinesPreferencesUserId, user.id]);

  const toggleMachine = (machine: string) => {
    setHiddenMachines((previous) => {
      const next = new Set(previous);
      if (next.has(machine)) next.delete(machine); else next.add(machine);
      return next;
    });
  };

  const reorderSize = async (source: string, target: string) => {
    if (!canOrderSizes || orderSaving || !sizeOrder) return;
    const next = [...orderedSizes];
    const sourceIndex = next.indexOf(source);
    const targetIndex = next.indexOf(target);
    if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) return;
    next.splice(sourceIndex, 1);
    next.splice(targetIndex, 0, source);
    setOrderSaving(true);
    setOrderError('');
    const previous = sizeOrder;
    queryClient.setQueryData<SizeOrderResponse>(SIZE_ORDER_QUERY_KEY, { ...previous, order: next });
    try {
      await apiClient.put('/dashboard/clasificado-orden-tallas', { order: next });
      await queryClient.invalidateQueries({ queryKey: SIZE_ORDER_QUERY_KEY });
    } catch (requestError) {
      queryClient.setQueryData(SIZE_ORDER_QUERY_KEY, previous);
      setOrderError(axios.isAxiosError(requestError)
        ? requestError.response?.data?.error ?? 'No se pudo guardar el orden.'
        : 'No se pudo guardar el orden.');
    } finally {
      setOrderSaving(false);
    }
  };

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

      <ClasificadoPorMaquinaHoyCards />

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
            label: 'Libras clasificadas semana',
            value: data?.librasClasificadasSemana ?? 0,
            unit: 'lbs',
          },
          {
            label: 'Libras clasificadas mes',
            value: data?.librasClasificadasMes ?? 0,
            unit: 'lbs',
          },
          {
            label: 'Libras clasificadas por hora hoy',
            value: data?.librasClasificadasPorHora ?? 0,
            unit: 'lbs/h',
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
        transform={(rows) => rows.filter((row) => !hiddenMachines.has(String(row.maquina ?? '')))}
        emptyText={machines.length > 0
          ? 'Ninguna máquina seleccionada — marca al menos una en “Máquinas”.'
          : 'Sin datos para los filtros seleccionados.'}
        actions={
          <Stack direction="row" spacing={1} alignItems="center">
            <Button size="small" variant="outlined" startIcon={<PrecisionManufacturingOutlinedIcon />}
              onClick={(event) => setMachineAnchor(event.currentTarget)} sx={{ whiteSpace: 'nowrap', fontWeight: 700 }}>
              Máquinas ({visibleMachines}/{machines.length})
            </Button>
            <Button
              size="small"
              variant="outlined"
              startIcon={<VisibilityOutlinedIcon />}
              onClick={() => setTallaOpen(true)}
              sx={{ whiteSpace: 'nowrap', fontWeight: 700 }}
            >
              Ver por talla
            </Button>
          </Stack>
        }
      />
      <Popover open={Boolean(machineAnchor)} anchorEl={machineAnchor} onClose={() => setMachineAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}>
        <Box sx={{ p: 1.5, minWidth: 220, maxHeight: 320, overflowY: 'auto' }}>
          <Stack direction="row" justifyContent="space-between" alignItems="center" mb={0.5}>
            <Typography variant="caption" fontWeight={800} color="text.secondary">MÁQUINAS</Typography>
            <Stack direction="row" spacing={1}>
              <Button size="small" sx={{ fontSize: 11, minWidth: 0, p: 0 }} onClick={() => setHiddenMachines(new Set())}>Todas</Button>
              <Button size="small" sx={{ fontSize: 11, minWidth: 0, p: 0 }} onClick={() => setHiddenMachines(new Set(machines))}>Ninguna</Button>
            </Stack>
          </Stack>
          <Divider sx={{ mb: 0.5 }} />
          <Stack spacing={0}>
            {machines.map((machine) => <FormControlLabel key={machine} sx={{ '& .MuiFormControlLabel-label': { fontSize: 13 }, ml: 0 }}
              control={<Checkbox size="small" checked={!hiddenMachines.has(machine)} onChange={() => toggleMachine(machine)} />}
              label={machine} />)}
            {machines.length === 0 && <Typography variant="caption" color="text.secondary">Sin máquinas en el período.</Typography>}
          </Stack>
        </Box>
      </Popover>
      {machinesSaveError && <Alert severity="error" onClose={() => setMachinesSaveError('')}>{machinesSaveError}</Alert>}
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
      {sizeOrderError && <Alert severity="error">No se pudo cargar el orden compartido de las tallas.</Alert>}
      {orderError && <Alert severity="error" onClose={() => setOrderError('')}>{orderError}</Alert>}
      {canOrderSizes && <Typography variant="caption" color="text.secondary">
        {orderSaving ? 'Guardando orden de columnas…' : 'Arrastra los encabezados de talla en cualquiera de las tablas para ordenarlos para todos los usuarios.'}
      </Typography>}
      <Box sx={{ height: TABLE_H, flexShrink: 0 }}>
        <ChartWidget config={porTallaDia} columnOrder={orderedSizes} onColumnReorder={canOrderSizes && !orderSaving && sizeOrder ? reorderSize : undefined} />
      </Box>
      <Box sx={{ height: TABLE_H, flexShrink: 0 }}>
        <ChartWidget config={porTallaMes} columnOrder={orderedSizes} onColumnReorder={canOrderSizes && !orderSaving && sizeOrder ? reorderSize : undefined} />
      </Box>
    </Stack>
  );
}
