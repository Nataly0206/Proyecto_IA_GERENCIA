import { useState } from 'react';
import { Alert, Avatar, Box, Button, Chip, LinearProgress, Paper, Skeleton, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Tooltip, Typography } from '@mui/material';
import RefreshOutlinedIcon from '@mui/icons-material/RefreshOutlined';
import InsightsOutlinedIcon from '@mui/icons-material/InsightsOutlined';
import ContentCutOutlinedIcon from '@mui/icons-material/ContentCutOutlined';
import SortOutlinedIcon from '@mui/icons-material/SortOutlined';
import SetMealOutlinedIcon from '@mui/icons-material/SetMealOutlined';
import AcUnitOutlinedIcon from '@mui/icons-material/AcUnitOutlined';
import { useQueries, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../api/client';

interface SummaryValue { rate: number | null; pounds: number; hours: number; groups: number }
interface Summary { today: string; updatedAt: string; periods: { key: string; label: string; from: string; to: string }[]; rows: { process: string; method: string; values: Record<string, SummaryValue> }[] }
const processes = ['Descabezado', 'Clasificado', 'Pelado', 'IQF'];
const colors = ['#c87822', '#008b83', '#5476bb', '#007fbb'];
const icons = [<ContentCutOutlinedIcon />, <SortOutlinedIcon />, <SetMealOutlinedIcon />, <AcUnitOutlinedIcon />];
const number = (value: number) => value.toLocaleString('en-US', { maximumFractionDigits: 2 });
const dateLabel = (date: string) => new Date(`${date}T12:00:00Z`).toLocaleDateString('es-HN', { timeZone: 'America/Tegucigalpa', day: '2-digit', month: 'short' });

export default function ProcessSummaryPage({ userId }: { userId: string }) {
  const [refreshing, setRefreshing] = useState(false);
  const queryClient = useQueryClient();
  const [refreshError, setRefreshError] = useState(false);
  const queries = useQueries({ queries: processes.map(process => ({
    queryKey: ['resumen-procesos', userId, process],
    queryFn: async () => (await apiClient.get<Summary>('/dashboard/resumen-procesos', { params: { process } })).data,
    staleTime: 5 * 60_000, gcTime: 30 * 60_000, refetchOnWindowFocus: false, refetchInterval: 5 * 60_000,
  })) });
  const fetching = queries.some(query => query.isFetching);
  const failed = queries.some(query => query.isError);
  const data = queries.find(query => query.data)?.data;
  const updatedAt = queries.map(query => query.data?.updatedAt).filter((value): value is string => !!value).sort()[0];
  const refresh = async () => {
    if (refreshing || fetching) return;
    setRefreshing(true);
    const results = await Promise.allSettled(processes.map(async process => {
      const { data } = await apiClient.get<Summary>('/dashboard/resumen-procesos', { params: { process, refresh: true } });
      queryClient.setQueryData(['resumen-procesos', userId, process], data);
    }));
    setRefreshError(results.some(result => result.status === 'rejected'));
    setRefreshing(false);
  };
  return <Stack spacing={{ xs: 1, sm: 3 }} sx={{ py: { xs: 0, sm: 2 }, height: '100%', minHeight: 0, overflow: 'auto' }}>
    <Stack direction="row" justifyContent="space-between" alignItems="center" gap={1} flexWrap={{ xs: 'nowrap', sm: 'wrap' }}>
      <Stack direction="row" spacing={{ xs: 0, sm: 1.5 }} alignItems="center">
        <Avatar variant="rounded" sx={{ bgcolor: 'primary.main', display: { xs: 'none', sm: 'flex' }, width: 46, height: 46 }}><InsightsOutlinedIcon /></Avatar>
        <Box><Typography variant="h5" fontWeight={800} sx={{ fontSize: { xs: 21, sm: 24 } }}>Productividad</Typography><Typography variant="body2" color="text.secondary" sx={{ display: { xs: 'none', sm: 'block' } }}>Productividad de la planta · libras por hora</Typography></Box>
      </Stack>
      <Button sx={{ flexShrink: 0, fontSize: { xs: 12, sm: 14 }, px: { xs: 1, sm: 2 } }} variant="outlined" startIcon={<RefreshOutlinedIcon />} disabled={refreshing || fetching} onClick={() => void refresh()}>{refreshing || fetching ? 'Actualizando…' : 'Actualizar'}</Button>
    </Stack>
    {(failed || refreshError) && <Alert severity="error">No se pudo actualizar el resumen. Intenta nuevamente con Actualizar.</Alert>}
    <Stack spacing={0.75} sx={{ display: { xs: 'flex', sm: 'none' } }}>
      <Typography variant="caption" color="text.secondary">Rendimiento · lbs/h</Typography>
      {processes.map((process, index) => {
        const query = queries[index];
        const row = query.data?.rows[0];
        return <Paper key={process} variant="outlined" sx={{ px: 1.25, py: 1, borderRadius: 2 }}>
          <Stack direction="row" justifyContent="space-between" alignItems="center" gap={0.5} mb={0.75}>
            <Typography fontWeight={800} sx={{ fontSize: 13, color: colors[index] }}>{process}</Typography>

          </Stack>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 0.5 }}>
            {['today', 'week', 'month', 'year'].map((key, column) => {
              const value = row?.values[key];
              const period = data?.periods.find(item => item.key === key);
              return <Tooltip key={key} title={period ? `${period.from} – ${period.to}` : ''}>
                <Box sx={{ minWidth: 0, textAlign: 'center', bgcolor: column === 0 ? 'rgba(0,127,187,.06)' : 'transparent', borderRadius: 1, py: 0.25 }}>
                  <Typography color="text.secondary" sx={{ fontSize: 10 }}>{['Hoy', 'Semana', 'Mes', 'Anual'][column]}</Typography>
                  {!value && !query.isError ? <Skeleton width="80%" sx={{ mx: 'auto' }} /> : <Typography sx={{ fontSize: 'clamp(11px, 3.5vw, 16px)', lineHeight: 1.5, fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: column === 0 ? 'primary.main' : 'text.primary' }}>{query.isError && !value ? 'Error' : value?.rate == null ? '—' : number(value.rate)}</Typography>}
                </Box>
              </Tooltip>;
            })}
          </Box>
        </Paper>;
      })}
      {(fetching || refreshing) && <LinearProgress sx={{ height: 2 }} />}
      <Typography color="text.secondary" sx={{ fontSize: 10 }}>{updatedAt ? `Actualizado ${new Date(updatedAt).toLocaleString('es-HN', { timeZone: 'America/Tegucigalpa' })}` : 'Esperando datos'}</Typography>
    </Stack>
    <Paper variant="outlined" sx={{ display: { xs: 'none', sm: 'block' }, borderRadius: 2, overflow: 'hidden', flexShrink: 0 }}>
      <Stack direction="row" justifyContent="space-between" gap={2} flexWrap="wrap" sx={{ p: 2.5, borderBottom: 1, borderColor: 'divider' }}>
        <Box><Typography fontWeight={800}>Rendimiento por proceso</Typography><Typography variant="body2" color="text.secondary">Una vista de hoy y del acumulado de cada período.</Typography></Box>
        <Chip size="small" label="lbs / hora" color="primary" variant="outlined" />
      </Stack>
      {(fetching || refreshing) && <LinearProgress sx={{ height: 2 }} />}
      <TableContainer><Table aria-label="Resumen de libras por hora por proceso" sx={{ minWidth: 760, '& th, & td': { borderColor: 'divider' } }}>
        <TableHead><TableRow sx={{ bgcolor: '#f5f8fc' }}>
          <TableCell sx={{ pl: 3, fontWeight: 800, width: '24%' }}>Proceso</TableCell>
          {(data?.periods ?? ['Hoy', 'Semana', 'Mes', 'Anual'].map(label => ({ key: label, label, from: '', to: '' }))).map((period, index) => <TableCell key={period.key} align="right" sx={{ py: 2.5, pr: 3, bgcolor: index === 0 ? 'rgba(0,127,187,.06)' : undefined }}>
            <Typography fontWeight={800} color={index === 0 ? 'primary.main' : 'text.primary'}>Lbs x hr {period.label.toLowerCase()}</Typography>
            <Typography variant="caption" color="text.secondary">{period.from ? period.from === period.to ? dateLabel(period.to) : `${dateLabel(period.from)} – ${dateLabel(period.to)}` : 'Cargando período…'}</Typography>
          </TableCell>)}

        </TableRow></TableHead>
        <TableBody>{processes.map((process, index) => {
          const query = queries[index];
          const row = query.data?.rows[0];
          return <TableRow key={process} hover sx={{ '&:last-child td, &:last-child th': { borderBottom: 0 } }}>
          <TableCell component="th" scope="row" sx={{ pl: 3, py: 3.5 }}><Stack direction="row" spacing={1.5} alignItems="center"><Avatar variant="rounded" sx={{ bgcolor: `${colors[index]}14`, color: colors[index], width: 38, height: 38 }}>{icons[index]}</Avatar><Typography fontWeight={800}>{process}</Typography></Stack></TableCell>
          {(data?.periods ?? ['today', 'week', 'month', 'year'].map(key => ({ key }))).map((period, column) => { const value = row?.values[period.key]; return <TableCell key={period.key} align="right" sx={{ pr: 3, bgcolor: column === 0 ? 'rgba(0,127,187,.025)' : undefined }}>
            {!value ? query.isError ? <Typography color="error.main" variant="caption">No disponible</Typography> : <Skeleton width={80} sx={{ ml: 'auto' }} /> : <Tooltip title={value.rate === null ? 'Sin lecturas con un intervalo de trabajo válido.' : row?.method === 'average' ? 'Promedio de rendimientos por grupo, igual al reporte IQF.' : `${number(value.pounds)} lb ÷ ${number(value.hours)} horas registradas`}>
              <Typography component="span" sx={{ fontSize: { xs: 20, md: 26 }, fontWeight: 800, fontVariantNumeric: 'tabular-nums', color: column === 0 ? 'primary.main' : 'text.primary' }}>{value.rate === null ? '—' : number(value.rate)}</Typography>
            </Tooltip>}
          </TableCell>; })}

        </TableRow>; })}</TableBody>
      </Table></TableContainer>
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="flex-end" gap={1} sx={{ px: 3, py: 2, bgcolor: '#f8fafc', borderTop: 1, borderColor: 'divider' }}>
        <Typography variant="caption" color="text.secondary">{updatedAt ? `Actualizado ${new Date(updatedAt).toLocaleString('es-HN', { timeZone: 'America/Tegucigalpa' })}` : 'Esperando datos'}</Typography>
      </Stack>
    </Paper>
  </Stack>;
}
