import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Alert, Box, Tooltip, MenuItem, Paper, Skeleton, Stack, TextField, Typography, ToggleButton, ToggleButtonGroup, Table, TableBody, TableCell, TableContainer, TableHead, TableRow } from '@mui/material';
import { apiClient } from '../../api/client';
import { REFRESH_INTERVAL_MS } from '../../hooks/useDashboardData';
import { formatValue } from '../../utils/format';

type Workdays = {
  year: number; through: string; daysWorked: number; monthsCompleted: number;
  averageDaysPerMonth: number | null; currentMonthDays: number | null; poundsPerDay: number | null;
  months: { month: number; days: number; status: string }[];
};
const monthNames = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

export default function PeladoDiasTrabajados() {
  const currentYear = Number(new Intl.DateTimeFormat('en', { timeZone: 'America/Tegucigalpa', year: 'numeric' }).format(new Date()));
  const [year, setYear] = useState(currentYear);
  const [view, setView] = useState<'total' | 'mes'>('total');
  const { data, isLoading, isError } = useQuery({
    queryKey: ['pelado', 'dias-trabajados', year],
    queryFn: async ({ signal }) => (await apiClient.get<Workdays>('/dashboard/pelado-dias-trabajados', { params: { year }, signal })).data,
    refetchInterval: REFRESH_INTERVAL_MS,
  });
  const metrics = data ? [
    { label: 'Días trabajados acumulados', value: formatValue(data.daysWorked), detail: `Año ${year} · hasta ${data.through.split('-').reverse().join('/')}` },
    { label: 'Promedio de días por mes', value: data.averageDaysPerMonth === null ? '—' : formatValue(data.averageDaysPerMonth, 'decimal'), detail: data.monthsCompleted ? `${data.monthsCompleted} meses completos · incluye meses sin producción` : 'Disponible al completar el primer mes' },
    ...(data.currentMonthDays !== null ? [{ label: 'Días del mes en curso', value: formatValue(data.currentMonthDays), detail: 'Mes parcial · excluido del promedio mensual' }] : []),
    { label: 'Libras por día trabajado', value: data.poundsPerDay === null ? '—' : `${formatValue(data.poundsPerDay)} lbs`, detail: 'Producción del año / días con producción' },
  ] : [];

  return <Paper elevation={0} sx={{ px: 1.25, py: 1, border: 1, borderColor: 'divider', flexShrink: 0 }}>
    <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={0.75} mb={0.75} useFlexGap flexWrap="wrap">
      <Box>
        <Tooltip title="Cada fecha con producción cuenta una vez, entre todos los turnos y estilos, incluidos feriados y domingos trabajados.">
          <Typography variant="subtitle2" fontWeight={800} sx={{ fontSize: 13 }}>Dias trabajados</Typography>
        </Tooltip>
      </Box>
      <Stack direction="row" alignItems="center" spacing={1}>
        <ToggleButtonGroup size="small" exclusive value={view} onChange={(_event, next: 'total' | 'mes' | null) => next && setView(next)} sx={{ '& .MuiToggleButton-root': { px: 1.25, py: 0.5, fontSize: 11, fontWeight: 700, lineHeight: 1 } }}>
          <ToggleButton value="total" aria-label="Ver total de días trabajados">Total</ToggleButton>
          <ToggleButton value="mes" aria-label="Ver días trabajados por mes">Mes</ToggleButton>
        </ToggleButtonGroup>
      <TextField select size="small" label="Año" value={year} onChange={(event) => setYear(Number(event.target.value))} sx={{ minWidth: 88, flexShrink: 0, '& .MuiSelect-select': { py: 0.6, fontSize: 12 }, '& .MuiInputLabel-root': { fontSize: 12 } }}>
        {Array.from({ length: currentYear - 1999 }, (_, index) => currentYear - index).map((option) => <MenuItem key={option} value={option}>{option}</MenuItem>)}
      </TextField>
      </Stack>
    </Stack>
    {isLoading ? <Skeleton variant="rounded" height={58} /> : isError ? <Alert severity="error">No se pudieron cargar los días trabajados.</Alert> : data && <>
      {view === 'total' ? <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', md: `repeat(${metrics.length}, minmax(0, 1fr))` }, gap: 0.75 }}>
        {metrics.map((metric) => <Tooltip key={metric.label} title={metric.detail} enterTouchDelay={0}>
          <Box sx={{ px: 1, py: 0.6, borderRadius: 1, bgcolor: 'action.hover', minWidth: 0 }}>
            <Typography variant="caption" fontWeight={700} sx={{ display: 'block', fontSize: 11, lineHeight: 1.3 }}>{metric.label}</Typography>
            <Typography fontWeight={800} color="primary.main" sx={{ fontSize: 18, lineHeight: 1.3 }}>{metric.value}</Typography>
          </Box>
        </Tooltip>)}
      </Box> : <Box>
        <TableContainer>
          <Table size="small" aria-label={`Días trabajados por mes en ${year}`} sx={{ minWidth: 650, tableLayout: 'fixed', '& .MuiTableCell-root': { py: 0.6, px: 0.75, fontSize: 12, textAlign: 'center' }, '& .MuiTableHead-root .MuiTableCell-root': { fontWeight: 700, bgcolor: 'action.hover' } }}>
            <TableHead><TableRow>
              <TableCell sx={{ width: 70 }}>Mes</TableCell>
              {data.months.map((month) => <TableCell key={month.month}>{monthNames[month.month - 1]}</TableCell>)}
            </TableRow></TableHead>
            <TableBody><TableRow>
              <TableCell component="th" scope="row" sx={{ fontWeight: 700 }}>Días</TableCell>
              {data.months.map((month) => <TableCell key={month.month} sx={{ fontWeight: 800, color: month.status === 'current' ? 'primary.main' : 'text.primary' }}>
                <Tooltip title={month.status === 'current' ? 'Mes en curso · excluido del promedio' : month.status === 'future' ? 'Mes pendiente' : 'Mes completo'}>
                  <span>{month.status === 'future' ? '—' : formatValue(month.days)}{month.status === 'current' ? '*' : ''}</span>
                </Tooltip>
              </TableCell>)}
            </TableRow></TableBody>
          </Table>
        </TableContainer>
        <Stack direction="row" useFlexGap flexWrap="wrap" gap={2} sx={{ mt: 0.75 }}>
          <Typography variant="caption">Total acumulado: <strong>{formatValue(data.daysWorked)} días</strong></Typography>
          <Typography variant="caption">Promedio mensual: <strong>{data.averageDaysPerMonth === null ? '—' : formatValue(data.averageDaysPerMonth, 'decimal')} días</strong> · {data.monthsCompleted} meses completos</Typography>
        </Stack>
        <Typography variant="caption" color="text.secondary" display="block" sx={{ mt: 0.25, fontSize: 10.5 }}>Promedio sobre meses completos, incluidos los que no tuvieron producción. * Mes en curso.</Typography>
      </Box>}
      {data.daysWorked === 0 && <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>Sin producción registrada en el año seleccionado.</Typography>}
    </>}
  </Paper>;
}
