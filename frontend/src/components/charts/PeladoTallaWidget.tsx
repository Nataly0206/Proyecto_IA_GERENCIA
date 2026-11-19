import { useFilters } from '../../context/FiltersContext';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Alert,
  Box,
  CircularProgress,
  InputAdornment,
  TextField,
  LinearProgress,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { usePeladoPorSala, useWidgetData } from '../../hooks/useDashboardData';
import { apiClient } from '../../api/client';
import { formatValue } from '../../utils/format';
import { getPeladoDetailPtSize, getTopPeelingPerformance, mergePeladoDetailSizes, normalizePeladoDetailSize } from '../../utils/peladoTallas';

type SizeOrderResponse = { order: string[]; sizes: string[] };

/**
 * Tabla de libras peladas por talla. Con scope="range" (diálogo "Ver por talla")
 * usa el rango y turno elegidos; con scope="today" ("Libras Peladas por Talla — Hoy")
 * usa siempre el día en curso. Las columnas son las mismas en ambos casos.
 */
export default function PeladoTallaWidget({ minHours = null, scope = 'range' }: { minHours?: number | null; scope?: 'range' | 'today' }) {
  const [staffPercentage, setStaffPercentage] = useState('20');
  const percentageValue = Number(staffPercentage);
  const validPercentage = staffPercentage.trim() !== '' && Number.isFinite(percentageValue) && percentageValue > 0 && percentageValue <= 100;
  const { filters } = useFilters();
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Tegucigalpa', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  // Hoy sale del mismo corte que Actividad por Sala, para que libras y totales cuadren.
  const liveDay = scope === 'today' || (filters.fechaInicial === today && filters.fechaFinal === today);
  const snapshot = usePeladoPorSala(minHours, filters.turno, liveDay);
  const report = useWidgetData('pelado-por-talla', minHours === null ? undefined : { minHours: String(minHours) }, !liveDay);
  const { isLoading, isError, error } = liveDay ? snapshot : report;
  const data = liveDay ? snapshot.data?.detalleTallas : report.data;
  const { data: sizeOrder } = useQuery<SizeOrderResponse>({
    queryKey: ['clasificado', 'orden-tallas'],
    queryFn: async () => (await apiClient.get<SizeOrderResponse>('/dashboard/pelado-orden-tallas')).data,
    staleTime: 5 * 60 * 1000,
  });
  const orderedSizes = useMemo(() => {
    const saved = [...new Set((sizeOrder?.order ?? []).map(normalizePeladoDetailSize))];
    const savedKeys = new Set(saved.map(size => size.toUpperCase()));
    const remaining = [...new Set((sizeOrder?.sizes ?? []).map(normalizePeladoDetailSize))]
      .filter(size => !savedKeys.has(size.toUpperCase()))
      .sort((a, b) => a.localeCompare(b, 'es', { numeric: true, sensitivity: 'base' }));
    return [...saved, ...remaining];
  }, [sizeOrder]);
  const rows = useMemo(() => {
    const positions = new Map(orderedSizes.map((size, index) => [size.toUpperCase(), index]));
    return mergePeladoDetailSizes(data ?? []).sort((a, b) => {
      const aSize = String(a.talla ?? 'Sin talla');
      const bSize = String(b.talla ?? 'Sin talla');
      const aPosition = positions.get(aSize.toUpperCase()) ?? Number.MAX_SAFE_INTEGER;
      const bPosition = positions.get(bSize.toUpperCase()) ?? Number.MAX_SAFE_INTEGER;
      return aPosition - bPosition
        || aSize.localeCompare(bSize, 'es', { numeric: true, sensitivity: 'base' });
    });
  }, [data, orderedSizes]);
  const total = rows.reduce((sum, row) => sum + Number(row.libras ?? 0), 0);
  // El total agrupa las horas individuales; el ranking global deduplica personas entre tallas.
  const totalRendimiento = rows[0]?.librasHoraPersonaPlanta ?? null;
  const topTotal = validPercentage ? getTopPeelingPerformance(rows[0]?.rendimientosPersonasPlanta, percentageValue) : null;
  const rendimiento = (value: unknown) => {
    if (value === null || value === undefined || !Number.isFinite(Number(value))) return '—';
    const number = Number(value);
    return number > 0 && number < 0.01 ? '< 0.01' : formatValue(number, 'decimal');
  };

  if (isLoading) {
    return <Box sx={{ minHeight: 180, display: 'grid', placeItems: 'center' }}><CircularProgress size={32} /></Box>;
  }
  if (isError) {
    return <Alert severity="error">Error al cargar el detalle: {error instanceof Error ? error.message : 'desconocido'}</Alert>;
  }
  if (rows.length === 0) {
    return <Alert severity="info">Sin libras por talla para los filtros seleccionados.</Alert>;
  }

  return (
    <Box>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
        {scope === 'today' ? 'Día en curso · no cambia con el filtro de fechas' : 'Rango de fechas y turno seleccionados'} · L/HP = libras de la talla ÷ horas trabajadas por sus personas · excluye SALA DESCABEZADO y registros anulados
      </Typography>
      {liveDay && snapshot.data && <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>Mismo corte que Actividad por Sala · actualizado {new Date(snapshot.data.actualizado).toLocaleTimeString('es-HN')}</Typography>}
      {minHours !== null && <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>Mismo filtro de actividad: salas con más de {minHours} horas por día.</Typography>}
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1.5} alignItems={{ xs: 'stretch', sm: 'center' }} sx={{ mb: 1.5 }}>
        <TextField label="Mejores personas" size="small" type="number" value={staffPercentage}
          onChange={event => setStaffPercentage(event.target.value)} error={!validPercentage}
          inputProps={{ min: 0.1, max: 100, step: 0.1 }}
          InputProps={{ endAdornment: <InputAdornment position="end">%</InputAdornment> }}
          helperText={!validPercentage ? 'Ingresa un porcentaje mayor que 0 y hasta 100.' : undefined}
          sx={{ width: { xs: '100%', sm: 200 }, flexShrink: 0 }} />
        <Typography variant="caption" color="text.secondary">Promedio del L/HP de las personas con mayor rendimiento en cada talla. Se redondea la cantidad de personas hacia arriba.</Typography>
      </Stack>
      <TableContainer sx={{ maxHeight: '65vh', border: '1px solid', borderColor: 'divider', borderRadius: 1.5 }}>
        <Table size="small" stickyHeader sx={{ tableLayout: 'fixed', minWidth: 820 }}>
          <TableHead>
            <TableRow>
              <TableCell sx={{ width: '16%', fontWeight: 800, bgcolor: '#164a8b', color: '#fff' }}>Talla WSO</TableCell>
              <TableCell sx={{ width: '16%', fontWeight: 800, bgcolor: '#164a8b', color: '#fff' }}>Talla PT</TableCell>
              <TableCell align="right" title="Libras de esta talla ÷ suma de horas trabajadas por sus personas" sx={{ width: '16%', fontWeight: 800, bgcolor: '#164a8b', color: '#fff' }}>Lbs/hora/persona</TableCell>
              <TableCell align="right" title="Promedio simple del L/HP de las personas con mayor rendimiento, calculado por talla" sx={{ width: '20%', fontWeight: 800, bgcolor: '#164a8b', color: '#fff' }}>Promedio L/HP · {validPercentage ? `mejores ${percentageValue}%` : 'selección'}</TableCell>
              <TableCell align="right" sx={{ width: '16%', fontWeight: 800, bgcolor: '#164a8b', color: '#fff' }}>Libras peladas</TableCell>
              <TableCell aria-label="Porcentaje del total" sx={{ width: '16%', fontWeight: 800, bgcolor: '#164a8b', color: '#fff' }}>%</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((row, index) => {
              const percentage = total > 0 ? Number(row.libras ?? 0) / total * 100 : 0;
              const selected = validPercentage ? getTopPeelingPerformance(row.rendimientosPersonas, percentageValue) : null;
              return <TableRow key={String(row.talla ?? 'Sin talla')} hover sx={{ bgcolor: index % 2 ? '#f8fafc' : '#fff' }}>
                <TableCell sx={{ fontWeight: 600 }}>{String(row.talla ?? 'Sin talla')}</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>{getPeladoDetailPtSize(String(row.talla ?? 'Sin talla'))}</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700, color: '#1e40af' }}>{rendimiento(row.librasHoraPersona)}{Number(row.personas ?? 0) > (Array.isArray(row.rendimientosPersonas) ? row.rendimientosPersonas.length : 0) && <Typography variant="caption" color="text.secondary" title="Solo entran las personas cuyas libras pagadas cuadran con las pesadas; las demás no tienen horas confiables." sx={{ display: 'block', fontSize: 10 }}>{Array.isArray(row.rendimientosPersonas) ? row.rendimientosPersonas.length : 0} de {formatValue(Number(row.personas ?? 0))} personas</Typography>}</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700, color: '#166534' }}>{rendimiento(selected?.rate)}{selected && <Typography variant="caption" sx={{ display: 'block', fontSize: 10 }}>{selected.count} de {selected.total} personas</Typography>}</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>{formatValue(Number(row.libras ?? 0), 'number')}</TableCell>
                <TableCell>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <LinearProgress variant="determinate" value={percentage} sx={{ flex: 1, height: 7, borderRadius: 1, bgcolor: '#e2e8f0', '& .MuiLinearProgress-bar': { bgcolor: '#1f7a5c', borderRadius: 1 } }} />
                    <Typography variant="caption" fontWeight={700} sx={{ width: 46, textAlign: 'right' }}>{percentage.toFixed(1)}%</Typography>
                  </Stack>
                </TableCell>
              </TableRow>;
            })}
            <TableRow>
              <TableCell colSpan={2} sx={{ fontWeight: 800, bgcolor: '#e8eef7', borderTop: '2px solid #b8c7d9' }}>Total</TableCell>
              <TableCell align="right" sx={{ fontWeight: 800, bgcolor: '#e8eef7', borderTop: '2px solid #b8c7d9', color: '#1e40af' }}>{rendimiento(totalRendimiento)}{Number(rows[0]?.personasPlanta ?? 0) > (Array.isArray(rows[0]?.rendimientosPersonasPlanta) ? rows[0].rendimientosPersonasPlanta.length : 0) && <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontSize: 10, fontWeight: 500 }}>{Array.isArray(rows[0]?.rendimientosPersonasPlanta) ? rows[0].rendimientosPersonasPlanta.length : 0} de {formatValue(Number(rows[0]?.personasPlanta ?? 0))} personas</Typography>}</TableCell>
              <TableCell align="right" sx={{ fontWeight: 800, bgcolor: '#e8eef7', borderTop: '2px solid #b8c7d9', color: '#166534' }}>{rendimiento(topTotal?.rate)}{topTotal && <Typography variant="caption" sx={{ display: 'block', fontSize: 10 }}>{topTotal.count} de {topTotal.total} personas</Typography>}</TableCell>
              <TableCell align="right" sx={{ fontWeight: 800, bgcolor: '#e8eef7', borderTop: '2px solid #b8c7d9' }}>
                {formatValue(total, 'number')}
              </TableCell>
              <TableCell align="right" sx={{ fontWeight: 800, bgcolor: '#e8eef7', borderTop: '2px solid #b8c7d9' }}>100.0%</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}
