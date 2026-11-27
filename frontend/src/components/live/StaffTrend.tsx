import { useState } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { isAxiosError } from 'axios';
import {
  Alert, Box, Button, IconButton, LinearProgress, Paper, Skeleton, Stack, Table, TableBody, TableCell, TableContainer,
  TableFooter, TableHead, TableRow, ToggleButton, ToggleButtonGroup, Tooltip, Typography,
} from '@mui/material';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import { apiClient } from '../../api/client';
import type { StaffHistoryDay, StaffHistoryResponse } from '../../types/productionStaff';
import { formatPeriodo, formatValue } from '../../utils/format';

type Mode = 'month' | 'week';
type Period = { key: string; start: string; end: string };
type Summary = {
  period: Period; closed: boolean; days: number;
  present: number | null; absent: number | null; rate: number | null; roster: number | null;
  presentProduction: number | null; presentAuxiliary: number | null; presentMachine: number | null; presentSupervisor: number | null;
  hires: number; exits: number; hiresProduction: number; hiresAuxiliary: number;
};

export const STAFF_TREND_QUERY_KEY = 'personal-rango-operativo-v3';
const weekdayLabels = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const monthNames = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
/** Periodos visibles en el comparativo; se carga uno más para calcular el cambio del más antiguo. */
const VISIBLE: Record<Mode, number> = { month: 4, week: 8 };

const addDays = (day: string, amount: number) => { const date = new Date(`${day}T12:00:00Z`); date.setUTCDate(date.getUTCDate() + amount); return date.toISOString().slice(0, 10); };
const weekday = (day: string) => new Date(`${day}T12:00:00Z`).getUTCDay();
function periodOf(mode: Mode, day: string): Period {
  if (mode === 'month') {
    const start = `${day.slice(0, 7)}-01`;
    const next = new Date(`${start}T12:00:00Z`); next.setUTCMonth(next.getUTCMonth() + 1);
    return { key: day.slice(0, 7), start, end: addDays(next.toISOString().slice(0, 10), -1) };
  }
  // Semanas de lunes a domingo.
  const start = addDays(day, -((weekday(day) + 6) % 7));
  return { key: start, start, end: addDays(start, 6) };
}
const shiftPeriod = (mode: Mode, period: Period, amount: number) => periodOf(mode, mode === 'month'
  ? (() => { const date = new Date(`${period.start}T12:00:00Z`); date.setUTCMonth(date.getUTCMonth() + amount); return date.toISOString().slice(0, 10); })()
  : addDays(period.start, amount * 7));
function periodLabel(mode: Mode, period: Period) {
  if (mode === 'month') return `${monthNames[Number(period.start.slice(5, 7)) - 1]} ${period.start.slice(0, 4)}`;
  const short = (day: string) => `${Number(day.slice(8))} ${monthNames[Number(day.slice(5, 7)) - 1].slice(0, 3)}`;
  return `${short(period.start)} – ${short(period.end)}`;
}

/** Promedios por día trabajado (solo días cerrados y días de la semana incluidos); movimientos sobre todo el periodo. */
function summarize(period: Period, days: StaffHistoryDay[], included: number[], today: string): Summary {
  const inPeriod = days.filter(day => day.day >= period.start && day.day <= period.end && day.day <= today);
  const counted = inPeriod.filter(day => day.day < today && day.total > 0 && included.includes(weekday(day.day)));
  const n = counted.length;
  const absenceAvailable = n > 0 && counted.every(day => day.absenceDataAvailable ?? day.absenceRate !== null);
  const sum = (field: keyof StaffHistoryDay) => counted.reduce((total, day) => total + Number(day[field] ?? 0), 0);
  const all = (field: keyof StaffHistoryDay) => inPeriod.reduce((total, day) => total + Number(day[field] ?? 0), 0);
  const present = sum('present'), absent = sum('absent');
  const last = [...inPeriod].reverse().find(day => day.total > 0);
  return {
    period, closed: period.end < today, days: n,
    present: n ? present / n : null, absent: absenceAvailable ? absent / n : null,
    rate: absenceAvailable && counted.every(day => day.absenceRate !== null) && present + absent > 0 ? absent / (present + absent) * 100 : null,
    roster: last?.total ?? null,
    presentMachine: n ? sum('presentMachine') / n : null, presentSupervisor: n ? sum('presentSupervisor') / n : null,
    presentProduction: n ? sum('presentProduction') / n : null, presentAuxiliary: n ? sum('presentAuxiliary') / n : null,
    hires: all('hires'), exits: all('exits'), hiresProduction: all('hiresProduction'), hiresAuxiliary: all('hiresAuxiliary'),
  };
}

const one = (value: number | null) => value === null ? '—' : value.toLocaleString('en-US', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const tableSx = {
  '& th, & td': { px: { xs: 0.75, sm: 1.25 }, py: 0.75, fontSize: { xs: 11, sm: 12.5 }, fontVariantNumeric: 'tabular-nums' },
  '& thead th': { bgcolor: '#f1f5f9', fontWeight: 800, whiteSpace: 'normal', lineHeight: 1.35 },
  '& th:first-of-type, & td:first-of-type': { position: 'sticky', left: 0, zIndex: 1, bgcolor: 'background.paper', boxShadow: '2px 0 3px #0f172a0d' },
  '& thead th:first-of-type': { bgcolor: '#f1f5f9', zIndex: 3 },
  '& tfoot td': { bgcolor: '#f1f5f9', fontWeight: 800 },
} as const;

/**
 * Cambio contra el periodo anterior: subir siempre es verde y bajar siempre es rojo.
 * Las tasas se comparan en puntos porcentuales.
 */
function Delta({ current, previous, points = false, decimals = true }: { current: number | null; previous: number | null; points?: boolean; decimals?: boolean }) {
  if (current === null || previous === null) return <Typography component="span" variant="caption" color="text.secondary">sin comparación</Typography>;
  const diff = current - previous;
  if (Math.abs(diff) < (decimals ? 0.05 : 0.5)) return <Typography component="span" variant="caption" color="text.secondary">= sin cambio</Typography>;
  const positive = diff > 0;
  const text = points ? `${Math.abs(diff).toFixed(1)} pts` : decimals ? one(Math.abs(diff)) : formatValue(Math.abs(diff));
  const percent = !points && previous > 0 ? ` (${(Math.abs(diff) / previous * 100).toFixed(1)}%)` : '';
  return <Typography component="span" variant="caption" fontWeight={800} sx={{ color: positive ? 'success.main' : 'error.main' }}>{diff > 0 ? '▲' : '▼'} {text}{percent}</Typography>;
}

export default function StaffTrend({ userId, includedWeekdays, onDay }: { userId: string; includedWeekdays: number[]; onDay: (day: string) => void }) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Tegucigalpa', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  const [mode, setMode] = useState<Mode>('month');
  const [anchor, setAnchor] = useState(today);
  const selected = periodOf(mode, anchor);
  const periods = Array.from({ length: VISIBLE[mode] + 1 }, (_, index) => shiftPeriod(mode, selected, index - VISIBLE[mode]));
  // Meses completos: el backend guarda cada mes en caché, así semanas y meses reutilizan lo ya consultado.
  const from = `${periods[0].start.slice(0, 7)}-01`;
  const to = [selected.end, today].sort()[0];
  const range = useQuery({
    queryKey: [STAFF_TREND_QUERY_KEY, userId, from, to],
    queryFn: async ({ signal }) => (await apiClient.get<StaffHistoryResponse>('/dashboard/personal-produccion/rango', { params: { desde: from, hasta: to }, signal })).data,
    staleTime: 60_000, placeholderData: keepPreviousData,
  });
  const days = range.data?.days ?? [];
  const summaries = periods.map(period => summarize(period, days, includedWeekdays, today));
  const current = summaries[summaries.length - 1];
  const previous = summaries[summaries.length - 2];
  const visible = summaries.slice(1).reverse();
  const maxPresent = Math.max(1, ...visible.map(row => row.present ?? 0));
  const canGoForward = shiftPeriod(mode, selected, 1).start <= today;
  const unit = mode === 'month' ? 'mes' : 'semana';
  const previousLabel = mode === 'month' ? 'mes anterior' : 'semana anterior';
  const excluded = weekdayLabels.filter((_, index) => !includedWeekdays.includes(index)).map(label => label.toLowerCase());

  const cards = current && previous ? [
    { label: 'Asistieron · promedio por día', value: one(current.present), color: 'success.main', delta: <Delta current={current.present} previous={previous.present} /> },
    { label: 'Faltaron · promedio por día', value: one(current.absent), color: 'error.main', delta: <Delta current={current.absent} previous={previous.absent} /> },
    { label: 'Inasistencia', value: current.rate === null ? '—' : `${current.rate.toFixed(2)}%`, color: 'error.main', delta: <Delta current={current.rate} previous={previous.rate} points /> },
    { label: current.closed ? 'Personal al cierre' : 'Personal actual', value: current.roster === null ? '—' : formatValue(current.roster), color: 'text.primary', delta: <Delta current={current.roster} previous={previous.roster} decimals={false} /> },
    { label: 'Ingresos a planilla', value: formatValue(current.hires), color: '#1e40af', delta: <Delta current={current.hires} previous={previous.hires} decimals={false} />, detail: `Obra ${current.hiresProduction} · Aux. ${current.hiresAuxiliary}` },
    { label: 'Retiros de planilla', value: formatValue(current.exits), color: '#9a3412', delta: <Delta current={current.exits} previous={previous.exits} decimals={false} />, detail: `Neto ${current.hires - current.exits >= 0 ? '+' : ''}${current.hires - current.exits}` },
    { label: 'Obra · asistieron por día', value: one(current.presentProduction), color: '#1e40af', delta: <Delta current={current.presentProduction} previous={previous.presentProduction} /> },
    { label: 'Supervisores · asistieron por día', value: one(current.presentSupervisor), color: '#9a3412', delta: <Delta current={current.presentSupervisor} previous={previous.presentSupervisor} /> },
    { label: 'Auxiliar · asistieron por día', value: one(current.presentAuxiliary), color: '#166534', delta: <Delta current={current.presentAuxiliary} previous={previous.presentAuxiliary} /> },
  ] : [];

  const detailDays = days.filter(day => day.day >= selected.start && day.day <= selected.end && includedWeekdays.includes(weekday(day.day)))
    .sort((a, b) => b.day.localeCompare(a.day));
  const counted = detailDays.filter(day => day.day < today && day.total > 0);
  const total = (field: keyof StaffHistoryDay, rows = counted) => rows.reduce((sum, day) => sum + Number(day[field] ?? 0), 0);
  const detailColumns: { field: keyof StaffHistoryDay; label: string; color?: string; group?: boolean }[] = [
    { field: 'present', label: 'A · Asistieron', color: 'success.main' }, { field: 'absent', label: 'X · Faltaron', color: 'error.main' },
    { field: 'total', label: 'Planilla' },
    { field: 'presentProduction', label: 'Obra asistieron', color: '#1e40af', group: true }, { field: 'absentProduction', label: 'Obra faltaron', color: 'error.main' },
    { field: 'presentAuxiliary', label: 'Aux. asistieron', color: '#166534', group: true }, { field: 'absentAuxiliary', label: 'Aux. faltaron', color: 'error.main' },
  ];

  return <Stack spacing={1.25}>
    <Paper variant="outlined" sx={{ p: 1.25, borderRadius: 2 }}>
      <Stack direction="row" alignItems="center" gap={1} useFlexGap flexWrap="wrap">
        <ToggleButtonGroup exclusive size="small" value={mode} onChange={(_, value: Mode | null) => value && setMode(value)} aria-label="Agrupar por" sx={{ '& button': { textTransform: 'none', px: 1.25, py: 0.4, fontSize: 12 } }}>
          <ToggleButton value="month">Por mes</ToggleButton><ToggleButton value="week">Por semana</ToggleButton>
        </ToggleButtonGroup>
        <Stack direction="row" alignItems="center" sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 1.5 }}>
          <IconButton size="small" aria-label={`${unit} anterior`} onClick={() => setAnchor(shiftPeriod(mode, selected, -1).start)}><ChevronLeftIcon fontSize="small" /></IconButton>
          <Typography fontWeight={800} fontSize={13} sx={{ minWidth: 128, textAlign: 'center', textTransform: mode === 'month' ? 'capitalize' : 'none' }}>{periodLabel(mode, selected)}</Typography>
          <IconButton size="small" aria-label={`${unit} siguiente`} disabled={!canGoForward} onClick={() => setAnchor(shiftPeriod(mode, selected, 1).start)}><ChevronRightIcon fontSize="small" /></IconButton>
        </Stack>
        <Button size="small" disabled={selected.start <= today && selected.end >= today} onClick={() => setAnchor(today)}>{mode === 'month' ? 'Mes actual' : 'Semana actual'}</Button>
      </Stack>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.75 }}>
        Promedios por día con datos{excluded.length ? `, sin ${excluded.join(', ')}` : ''}. El día en curso no entra en los promedios. Comparado contra el {previousLabel}.
      </Typography>
      {range.isFetching && <LinearProgress sx={{ mt: 1, height: 2 }} />}
    </Paper>

    {range.isError && <Alert severity="error">{isAxiosError(range.error) && typeof range.error.response?.data?.error === 'string' ? range.error.response.data.error : 'No se pudo consultar el reporte de pagos grupales de STB_data.'}</Alert>}
    {range.isLoading && <><Skeleton variant="rounded" height={150} /><Typography variant="caption" color="text.secondary">Consultando varios meses del reporte de pagos; la primera vez puede tardar unos segundos.</Typography></>}

    {range.data && current && <>
      {!current.closed && <Alert severity="info" sx={{ py: 0, '& .MuiAlert-message': { fontSize: 12 } }}>El {unit} está en curso: los promedios usan los {current.days} días cerrados hasta ayer.</Alert>}
      <Paper variant="outlined" aria-label={`Resumen de ${periodLabel(mode, selected)}`} sx={{ borderRadius: 2, overflow: 'hidden' }}>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', md: 'repeat(4, minmax(0, 1fr))' } }}>
          {cards.map(card => <Box key={card.label} sx={{ px: 1.25, py: 1, borderRight: '1px solid', borderBottom: '1px solid', borderColor: 'divider', minWidth: 0 }}>
            <Typography variant="caption" fontWeight={700} sx={{ display: 'block', fontSize: 11, lineHeight: 1.4 }}>{card.label}</Typography>
            <Typography fontWeight={800} sx={{ fontSize: { xs: 21, sm: 24 }, color: card.color, lineHeight: 1.3, fontVariantNumeric: 'tabular-nums' }}>{card.value}</Typography>
            <Box sx={{ lineHeight: 1.2 }}>{card.delta}<Typography component="span" variant="caption" color="text.secondary" sx={{ fontSize: 10 }}> vs {previousLabel}</Typography></Box>
            {card.detail && <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontSize: 10 }}>{card.detail}</Typography>}
          </Box>)}
        </Box>
      </Paper>

      <Paper variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden' }}>
        <Box sx={{ px: 1.25, py: 1 }}>
          <Typography fontWeight={800} fontSize={14}>Comparativo {mode === 'month' ? 'por mes' : 'por semana'}</Typography>
          <Typography variant="caption" color="text.secondary">Toca un {unit} para verlo en detalle · el cambio es contra el {previousLabel}</Typography>
        </Box>
        <TableContainer sx={{ maxHeight: '60vh' }}><Table size="small" stickyHeader aria-label={`Comparativo ${mode === 'month' ? 'mensual' : 'semanal'} de asistencia`} sx={{ ...tableSx, minWidth: 980 }}>
          <TableHead><TableRow>
            <TableCell>{mode === 'month' ? 'Mes' : 'Semana'}</TableCell><TableCell align="right">Días</TableCell>
            <TableCell align="right" sx={{ color: 'success.main', minWidth: 170 }}>Asistieron · prom./día</TableCell><TableCell align="right">Cambio</TableCell>
            <TableCell align="right" sx={{ color: 'error.main' }}>Faltaron · prom./día</TableCell><TableCell align="right">Inasistencia</TableCell>
            <TableCell align="right" sx={{ color: '#1e40af' }}>Obra · prom./día</TableCell><TableCell align="right" sx={{ color: '#166534' }}>Aux. · prom./día</TableCell>
            <TableCell align="right">Planilla al cierre</TableCell><TableCell align="right">Ingresos</TableCell><TableCell align="right">Retiros</TableCell><TableCell align="right">Neto</TableCell>
          </TableRow></TableHead>
          <TableBody>{visible.map((row, index) => {
            const before = visible[index + 1] ?? summaries[0];
            const isSelected = row.period.key === selected.key;
            const net = row.hires - row.exits;
            return <TableRow key={row.period.key} hover selected={isSelected} onClick={() => setAnchor(row.period.start)} sx={{ cursor: 'pointer', '&.Mui-selected td': { bgcolor: '#eef4ff' } }}>
              <TableCell sx={{ fontWeight: 800, whiteSpace: 'nowrap', textTransform: mode === 'month' ? 'capitalize' : 'none' }}>{periodLabel(mode, row.period)}{!row.closed && <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontSize: 10, textTransform: 'none' }}>En curso</Typography>}</TableCell>
              <TableCell align="right">{row.days || '—'}</TableCell>
              <TableCell align="right"><Stack direction="row" alignItems="center" justifyContent="flex-end" gap={1}>
                <Box sx={{ width: 70, height: 6, bgcolor: '#dcfce7', borderRadius: 3, overflow: 'hidden', display: { xs: 'none', sm: 'block' } }}><Box sx={{ width: `${(row.present ?? 0) / maxPresent * 100}%`, height: '100%', bgcolor: 'success.main' }} /></Box>
                <Typography fontWeight={800} fontSize="inherit" color="success.main">{one(row.present)}</Typography>
              </Stack></TableCell>
              <TableCell align="right"><Delta current={row.present} previous={before.present} /></TableCell>
              <TableCell align="right" sx={{ color: 'error.main', fontWeight: 700 }}>{one(row.absent)}</TableCell>
              <TableCell align="right" sx={{ color: 'error.main', fontWeight: 800 }}>{row.rate === null ? '—' : `${row.rate.toFixed(2)}%`}</TableCell>
              <TableCell align="right">{one(row.presentProduction)}</TableCell>
              <TableCell align="right">{one(row.presentAuxiliary)}</TableCell>
              <TableCell align="right">{row.roster === null ? '—' : formatValue(row.roster)}</TableCell>
              <TableCell align="right" sx={{ color: '#1e40af', fontWeight: 700 }}>{formatValue(row.hires)}</TableCell>
              <TableCell align="right" sx={{ color: '#9a3412', fontWeight: 700 }}>{formatValue(row.exits)}</TableCell>
              <TableCell align="right" sx={{ fontWeight: 800, color: net > 0 ? 'success.main' : net < 0 ? 'error.main' : 'text.secondary' }}>{net > 0 ? '+' : ''}{formatValue(net)}</TableCell>
            </TableRow>;
          })}</TableBody>
        </Table></TableContainer>
      </Paper>

      <Paper variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden' }}>
        <Box sx={{ px: 1.25, py: 1 }}>
          <Typography fontWeight={800} fontSize={14}>Detalle por día · <Box component="span" sx={{ textTransform: mode === 'month' ? 'capitalize' : 'none' }}>{periodLabel(mode, selected)}</Box></Typography>
          <Typography variant="caption" color="text.secondary">{formatPeriodo(selected.start)} a {formatPeriodo([selected.end, today].sort()[0])} · toca una fecha para ver las salas</Typography>
        </Box>
        <TableContainer sx={{ maxHeight: 520 }}><Table size="small" stickyHeader aria-label="Asistencia por día del periodo" sx={{ ...tableSx, minWidth: 980 }}>
          <TableHead><TableRow>
            <TableCell>Fecha</TableCell>
            {detailColumns.map(column => <TableCell key={column.field} align="right" sx={{ color: column.color, borderLeft: column.group ? '1px solid #e2e8f0' : undefined }}>{column.label}</TableCell>)}
            <TableCell align="right">Inasistencia</TableCell>
            <TableCell align="right" sx={{ borderLeft: '1px solid #e2e8f0', color: '#1e40af' }}>Ingresos</TableCell><TableCell align="right" sx={{ color: '#9a3412' }}>Retiros</TableCell>
          </TableRow></TableHead>
          <TableBody>{detailDays.map(day => {
            const hasData = day.total > 0;
            return <TableRow key={day.day} hover>
              <TableCell><Button size="small" onClick={() => onDay(day.day)} sx={{ p: 0, minWidth: 0, whiteSpace: 'nowrap', fontSize: 'inherit', fontWeight: 700, textTransform: 'none' }}>{weekdayLabels[weekday(day.day)].slice(0, 3)} {formatPeriodo(day.day).replace(/-\d{4}$/, '')}</Button>
                {day.day === today && <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontSize: 10 }}>En curso</Typography>}
                {!hasData && <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontSize: 10 }}>Sin datos</Typography>}</TableCell>
              {detailColumns.map(column => <TableCell key={column.field} align="right" sx={{ color: column.color, fontWeight: column.field === 'present' || column.field === 'absent' ? 800 : 500, borderLeft: column.group ? '1px solid #e2e8f0' : undefined }}>{hasData && !(column.field.startsWith('absent') && !(day.absenceDataAvailable ?? day.absenceRate !== null)) ? formatValue(Number(day[column.field] ?? 0)) : '—'}</TableCell>)}
              <TableCell align="right" sx={{ color: 'error.main', fontWeight: 800 }}>{day.absenceRate === null || !hasData ? '—' : `${formatValue(day.absenceRate, 'decimal')}%`}</TableCell>
              <TableCell align="right" sx={{ borderLeft: '1px solid #e2e8f0', color: '#1e40af' }}>{day.hires ? formatValue(day.hires) : '—'}</TableCell>
              <TableCell align="right" sx={{ color: '#9a3412' }}>{day.exits ? formatValue(day.exits) : '—'}</TableCell>
            </TableRow>;
          })}</TableBody>
          {counted.length > 0 && <TableFooter>
            {([['Total', 1], ['Promedio por día', counted.length]] as const).map(([label, divisor]) => <TableRow key={label}>
              <TableCell>{label === 'Total' ? `Total · ${counted.length} ${counted.length === 1 ? 'día' : 'días'}` : label}</TableCell>
              {detailColumns.map(column => <TableCell key={column.field} align="right" sx={{ color: column.color, borderLeft: column.group ? '1px solid #e2e8f0' : undefined }}>{divisor === 1 ? formatValue(total(column.field)) : one(total(column.field) / divisor)}</TableCell>)}
              <TableCell align="right" sx={{ color: 'error.main' }}>{current.rate === null ? '—' : `${current.rate.toFixed(2)}%`}</TableCell>
              <TableCell align="right" sx={{ borderLeft: '1px solid #e2e8f0', color: '#1e40af' }}>{label === 'Total' ? formatValue(total('hires', detailDays)) : ''}</TableCell>
              <TableCell align="right" sx={{ color: '#9a3412' }}>{label === 'Total' ? formatValue(total('exits', detailDays)) : ''}</TableCell>
            </TableRow>)}
          </TableFooter>}
        </Table></TableContainer>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', px: 1.25, py: 0.75 }}>
          Total y promedio usan los días cerrados mostrados (personas-día). Ingresos y retiros cuentan todos los días del {unit}, incluido el día en curso.
        </Typography>
      </Paper>
      <Tooltip title="Payroll conserva solo el último ingreso de cada persona: si alguien fue recontratado, su periodo anterior no aparece.">
        <Typography variant="caption" color="text.secondary" sx={{ px: 0.25, cursor: 'help' }}>Planilla por fecha: cada persona cuenta desde su ingreso y, si ya no está activa, hasta su retiro. ⓘ</Typography>
      </Tooltip>
    </>}
    {range.data && !days.length && <Alert severity="info">Sin personas en el reporte de pagos para este periodo.</Alert>}
  </Stack>;
}
