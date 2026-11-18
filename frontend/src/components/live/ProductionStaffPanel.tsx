import { useState } from 'react';
import { isAxiosError } from 'axios';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert, Box, Button, Checkbox, Chip, Collapse, FormControlLabel, IconButton, LinearProgress, MenuItem, Paper, Popover, Skeleton,
  Stack, Table, TableBody, TableCell, TableContainer, TableFooter, TableHead, TableRow,
  TextField, ToggleButton, ToggleButtonGroup, Typography,
} from '@mui/material';
import RefreshOutlinedIcon from '@mui/icons-material/RefreshOutlined';
import FilterAltOutlinedIcon from '@mui/icons-material/FilterAltOutlined';
import { apiClient } from '../../api/client';
import type { StaffEmployee, StaffHistoryResponse, StaffKind, StaffResponse, StaffStatus } from '../../types/productionStaff';
import { formatPeriodo, formatValue } from '../../utils/format';

const todayInHonduras = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Tegucigalpa', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const weekdayLabels = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const kindLabels: Record<StaffKind, string> = { production: 'Obra', auxiliary: 'Auxiliar / apoyo', unknown: 'Sin clasificar' };
function countPeople(people: StaffEmployee[]) {
  const count = (status: StaffStatus) => people.filter(person => person.status === status).length;
  const present = count('present'), absent = count('absent'), pending = count('pending'), conflict = count('conflict');
  return { total: people.length, present, absent, pending, conflict,
    absenceRate: !pending && !conflict && present + absent > 0 ? absent / (present + absent) * 100 : null };
}
const tableSx = {
  '& th, & td': { px: { xs: 0.75, sm: 1.5 }, py: 0.8, fontSize: { xs: 11, sm: 12.5 }, fontVariantNumeric: 'tabular-nums' },
  '& thead th': { bgcolor: '#f1f5f9', fontWeight: 800, whiteSpace: 'normal', lineHeight: 1.4 },
  '& th:first-of-type, & td:first-of-type': { position: 'sticky', left: 0, zIndex: 1, bgcolor: 'background.paper', whiteSpace: 'normal', boxShadow: '2px 0 3px #0f172a0d' },
  '& thead th:first-of-type': { bgcolor: '#f1f5f9', zIndex: 2 },
  '& tbody tr:nth-of-type(even) td': { bgcolor: '#fbfcfe' },
  '& tfoot td': { bgcolor: '#f1f5f9', fontWeight: 800 },
} as const;
function message(error: unknown) {
  return isAxiosError(error) && typeof error.response?.data?.error === 'string' ? error.response.data.error : 'No se pudo consultar la asistencia de STBPayroll. Intenta actualizar.';
}

export default function ProductionStaffPanel({ userId }: { userId: string }) {
  const today = todayInHonduras();
  const [date, setDate] = useState(today);
  const [tab, setTab] = useState<'day' | 'history'>('day');
  const [division, setDivision] = useState('');
  const [shift, setShift] = useState('');
  const [job, setJob] = useState('');
  const [kind, setKind] = useState<StaffKind | ''>('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [methodOpen, setMethodOpen] = useState(false);
  const [includedWeekdays, setIncludedWeekdays] = useState<number[]>([0, 1, 2, 3, 4, 5, 6]);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<unknown>(null);
  const client = useQueryClient();
  const parsed = new Date(`${date}T12:00:00Z`);
  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(date) && date >= '2000-01-01' && date <= today && Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
  const queryKey = ['personal-produccion-reporte-ax-v4', userId, date] as const;
  const historyKey = ['personal-produccion-reporte-ax-historico-v4', userId, date] as const;
  const query = useQuery({
    queryKey, queryFn: async ({ signal }) => (await apiClient.get<StaffResponse>('/dashboard/personal-produccion', { params: { fecha: date }, signal })).data,
    enabled: validDate && tab === 'day', staleTime: 60_000, refetchInterval: tab === 'day' && date === today ? 60_000 : false,
  });
  const history = useQuery({
    queryKey: historyKey, queryFn: async ({ signal }) => (await apiClient.get<StaffHistoryResponse>('/dashboard/personal-produccion/historico', { params: { fecha: date }, signal })).data,
    enabled: validDate && tab === 'history', staleTime: 5 * 60_000,
  });
  const active = tab === 'day' ? query : history;
  const refresh = async () => {
    if (!validDate || refreshing || active.isFetching) return;
    setRefreshing(true); setRefreshError(null);
    try {
      if (tab === 'day') {
        const { data } = await apiClient.get<StaffResponse>('/dashboard/personal-produccion', { params: { fecha: date, refresh: true } });
        client.setQueryData(queryKey, data);
      } else {
        const { data } = await apiClient.get<StaffHistoryResponse>('/dashboard/personal-produccion/historico', { params: { fecha: date, refresh: true } });
        client.setQueryData(historyKey, data);
      }
    } catch (error) { setRefreshError(error); }
    finally { setRefreshing(false); }
  };
  const clearFilters = () => { setDivision(''); setShift(''); setJob(''); setKind(''); };
  const people = (query.data?.employees ?? []).filter(person => (!division || person.division === division) && (!shift || person.shift === shift) && (!job || person.job === job) && (!kind || person.kind === kind));
  const counts = countPeople(people);
  const mainAreas = [...[1, 2, 3, 4].map(number => `Pelado · Sala ${number}`), 'Descabezado', 'Clasificado'];
  const areas = [...mainAreas, ...[...new Set(people.map(person => person.area))].filter(value => !mainAreas.includes(value)).sort((a, b) => a.localeCompare(b, 'es', { numeric: true }))];
  const activeFilters = [division, shift, job, kind].filter(Boolean).length;
  const cell = (rows: StaffEmployee[], area: string, status?: StaffStatus, category?: StaffKind) => {
    const unavailable = !query.data?.employees.length || (query.data.locationAvailable === false && !!area && area !== 'Sin sala/área asignada');
    const value = rows.filter(person => (!status || person.status === status) && (!category || person.kind === category)).length;
    return <TableCell align="right" sx={{ fontWeight: status === 'present' || status === 'absent' ? 800 : 600, color: status === 'absent' ? 'error.main' : status === 'present' ? 'success.main' : 'text.primary' }}>{unavailable ? '—' : formatValue(value)}</TableCell>;
  };
  const bodyCells = (rows: StaffEmployee[], area: string) => <>{cell(rows, area, 'present')}{cell(rows, area, 'absent')}{cell(rows, area, 'present', 'production')}{cell(rows, area, 'present', 'auxiliary')}{cell(rows, area)}{cell(rows, area, 'present', 'unknown')}{cell(rows, area, 'pending')}{cell(rows, area, 'conflict')}</>;
  const members = (category: StaffKind) => people.filter(person => person.kind === category);
  return <Stack spacing={1} sx={{ minWidth: 0 }}>
    <Paper variant="outlined" sx={{ p: 1.25, borderRadius: 2 }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1}>
        <Box><Typography fontWeight={800} sx={{ fontSize: { xs: 17, sm: 20 } }}>Personal</Typography><Typography variant="caption" color="text.secondary">Asistencia por sala y área · planilla obra</Typography></Box>
        <IconButton size="small" aria-label="Actualizar asistencia" disabled={refreshing || active.isFetching || !validDate} onClick={() => void refresh()}><RefreshOutlinedIcon fontSize="small" /></IconButton>
      </Stack>
      <Stack direction="row" gap={0.75} useFlexGap flexWrap="wrap" alignItems="center" sx={{ mt: 1 }}>
        <ToggleButtonGroup exclusive size="small" value={tab} onChange={(_, value) => value && setTab(value)} sx={{ '& button': { textTransform: 'none', px: 1.1, py: 0.5, fontSize: 12 } }} aria-label="Vista de asistencia"><ToggleButton value="day">Por sala</ToggleButton><ToggleButton value="history">Inasistencias</ToggleButton></ToggleButtonGroup>
        <TextField size="small" type="date" label={tab === 'day' ? 'Fecha' : 'Hasta la fecha'} value={date} onChange={event => { setDate(event.target.value); clearFilters(); }} error={!validDate} InputLabelProps={{ shrink: true }} inputProps={{ min: '2000-01-01', max: today }} sx={{ width: 155, '& input': { py: 0.75, fontSize: 12 } }} />
        <Button size="small" onClick={() => { setDate(today); clearFilters(); }}>Hoy</Button>
        {tab === 'history' && <WeekdaySelector includedWeekdays={includedWeekdays} onWeekdaysChange={setIncludedWeekdays} />}
        {tab === 'day' && <Button size="small" startIcon={<FilterAltOutlinedIcon fontSize="small" />} onClick={() => setFiltersOpen(value => !value)} aria-expanded={filtersOpen} aria-controls="staff-filters">Filtros{activeFilters ? ` (${activeFilters})` : ''}</Button>}
      </Stack>
      <Collapse in={filtersOpen && tab === 'day'}><Box id="staff-filters" sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', md: 'repeat(4, minmax(0, 1fr))' }, gap: 1, mt: 1.5 }}>
        <TextField select size="small" label="División" value={division} onChange={event => setDivision(event.target.value)}><MenuItem value="">Todas las divisiones</MenuItem>{[...new Set(query.data?.employees.map(value => value.division) ?? [])].sort().map(value => <MenuItem key={value} value={value}>{value}</MenuItem>)}</TextField>
        <TextField select size="small" label="Turno de nómina" value={shift} onChange={event => setShift(event.target.value)}><MenuItem value="">Todos los turnos</MenuItem>{[...new Set(query.data?.employees.map(value => value.shift) ?? [])].sort().map(value => <MenuItem key={value} value={value}>{value}</MenuItem>)}</TextField>
        <TextField select size="small" label="Puesto" value={job} onChange={event => setJob(event.target.value)}><MenuItem value="">Todos los puestos</MenuItem>{[...new Set(query.data?.employees.map(value => value.job) ?? [])].sort().map(value => <MenuItem key={value} value={value}>{value}</MenuItem>)}</TextField>
        <TextField select size="small" label="Tipo de personal" value={kind} onChange={event => setKind(event.target.value as StaffKind | '')}><MenuItem value="">Todo el personal</MenuItem>{(Object.keys(kindLabels) as StaffKind[]).map(value => <MenuItem key={value} value={value}>{kindLabels[value]}</MenuItem>)}</TextField>
      </Box>{!!activeFilters && <Button size="small" onClick={clearFilters} sx={{ mt: 0.5 }}>Limpiar filtros</Button>}</Collapse>
      {(active.isFetching || refreshing) && <LinearProgress sx={{ mt: 1, height: 2 }} />}
    </Paper>
    {!validDate && <Alert severity="warning" sx={{ py: 0 }}>Selecciona una fecha válida, hasta hoy.</Alert>}
    {(active.isError || !!refreshError) && <Alert severity="error" action={<Button color="inherit" size="small" onClick={() => void refresh()}>Reintentar</Button>}>{message(refreshError || active.error)}{active.data ? ' Se conserva la última consulta; revisa su hora de actualización.' : ''}</Alert>}
    {active.data?.warnings.map(warning => <Alert key={warning} severity="warning" sx={{ py: 0, '& .MuiAlert-message': { fontSize: 12 } }}>{warning}</Alert>)}
    {validDate && active.isLoading && <Skeleton variant="rounded" height={200} />}
    {tab === 'day' && query.data && <>
      {!query.data.employees.length && <Alert severity="info">Sin registros de Payroll para esta fecha.</Alert>}
      <Paper variant="outlined" aria-label="Resumen de asistencia" sx={{ borderRadius: 2, overflow: 'hidden' }}>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', sm: 'repeat(4, minmax(0, 1fr))' } }}>
          {[
            { label: 'Asistieron · A', value: counts.present, color: 'success.main', detail: 'Asistencias de Payroll' },
            { label: 'Faltaron · X', value: counts.absent, color: 'error.main', detail: 'Inasistencias de Payroll' },
            { label: 'Personal en registro', value: counts.total, color: 'text.primary', detail: 'Personas únicas' },
            { label: 'Inasistencia', value: counts.absenceRate === null ? null : `${formatValue(counts.absenceRate, 'decimal')}%`, color: 'error.main', detail: counts.absenceRate === null ? 'Pendiente de revisión' : 'X / (A + X)' },
          ].map(stat => <Box key={stat.label} sx={{ px: 1.25, py: 1, borderRight: '1px solid', borderBottom: '1px solid', borderColor: 'divider', minWidth: 0 }}>
            <Typography variant="caption" fontWeight={700} sx={{ display: 'block', fontSize: 11, lineHeight: 1.4 }}>{stat.label}</Typography>
            <Typography fontWeight={800} sx={{ fontSize: { xs: 23, sm: 26 }, color: stat.color, lineHeight: 1.3, fontVariantNumeric: 'tabular-nums' }}>{!counts.total || stat.value === null ? '—' : typeof stat.value === 'number' ? formatValue(stat.value) : stat.value}</Typography>
            <Typography variant="caption" color="text.secondary" sx={{ fontSize: 10, lineHeight: 1.3 }}>{stat.detail}</Typography>
          </Box>)}
        </Box>
      </Paper>
      <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 1 }}>
        {([
          { kind: 'production', label: 'Personal de obra', color: '#1e40af', background: '#eff6ff' },
          { kind: 'auxiliary', label: 'Auxiliares', color: '#166534', background: '#f0fdf4' },
        ] as const).map(category => {
          const group = countPeople(members(category.kind));
          return <Paper key={category.kind} variant="outlined" aria-label={category.label} sx={{ p: 1.25, borderRadius: 2, bgcolor: category.background, minWidth: 0 }}>
            <Typography fontSize={12} fontWeight={800} color={category.color}>{category.label}</Typography>
            <Stack direction="row" alignItems="baseline" gap={0.75} useFlexGap flexWrap="wrap">
              <Typography fontSize={26} fontWeight={800} color={category.color} sx={{ lineHeight: 1.3, fontVariantNumeric: 'tabular-nums' }}>{counts.total ? formatValue(group.present) : '—'}</Typography>
              <Typography variant="caption" color="text.secondary" fontSize={11}>asistieron</Typography>
            </Stack>
            <Stack direction="row" gap={1} useFlexGap flexWrap="wrap" sx={{ mt: 0.25 }}>
              <Typography variant="caption" color="error.main" fontSize={11}>Faltaron: {counts.total ? formatValue(group.absent) : '—'}</Typography>
              <Typography variant="caption" color="text.secondary" fontSize={11}>En registro: {counts.total ? formatValue(group.total) : '—'}</Typography>
            </Stack>
          </Paper>;
        })}
      </Box>
      <Paper variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden' }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1} sx={{ px: 1.25, py: 1 }}><Typography fontWeight={800} fontSize={14}>Personal por sala y área</Typography><Stack direction="row" gap={0.5}><Chip size="small" label="A · Asistencia" color="success" variant="outlined" sx={{ fontSize: 10, height: 22 }} /><Chip size="small" label="X · Falta" color="error" variant="outlined" sx={{ fontSize: 10, height: 22 }} /></Stack></Stack>
        <TableContainer><Table size="small" aria-label="Asistencia por sala y área" sx={{ ...tableSx, tableLayout: 'fixed', width: 795, minWidth: '100%' }}>
          <colgroup>{[120, 75, 75, 90, 90, 75, 90, 90, 90].map((width, index) => <col key={index} style={{ width }} />)}</colgroup>
          <TableHead><TableRow><TableCell>Sala / área</TableCell><TableCell align="right" sx={{ color: 'success.main' }}>A · Asistieron</TableCell><TableCell align="right" sx={{ color: 'error.main' }}>X · Faltaron</TableCell><TableCell align="right">Obra presentes</TableCell><TableCell align="right">Auxiliares presentes</TableCell><TableCell align="right">En registro</TableCell><TableCell align="right">Presentes sin clasificar</TableCell><TableCell align="right">Sin registro</TableCell><TableCell align="right">Revisar</TableCell></TableRow></TableHead>
          <TableBody>{areas.map(area => { const rows = people.filter(person => person.area === area); return <TableRow key={area}><TableCell><Typography fontSize="inherit" fontWeight={700}>{area}</Typography>{rows.some(person => person.wildcard) && <Typography variant="caption" color="text.secondary" sx={{ fontSize: 10 }}>{rows.filter(person => person.wildcard).length} comodines incluidos</Typography>}</TableCell>{bodyCells(rows, area)}</TableRow>; })}</TableBody>
          <TableFooter><TableRow><TableCell>Total</TableCell>{bodyCells(people, '')}</TableRow></TableFooter>
        </Table></TableContainer>
      </Paper>
      {(counts.pending > 0 || counts.conflict > 0 || people.some(person => person.kind === 'unknown')) && <Stack direction="row" gap={0.5} useFlexGap flexWrap="wrap">
        {!!counts.pending && <Chip size="small" label={`Sin registro: ${counts.pending}`} color="warning" variant="outlined" />}
        {!!counts.conflict && <Chip size="small" label={`Por revisar: ${counts.conflict}`} color="warning" variant="outlined" />}
        {people.some(person => person.kind === 'unknown') && <Chip size="small" label={`Puesto sin clasificar: ${people.filter(person => person.kind === 'unknown').length}`} variant="outlined" />}
      </Stack>}
    </>}
    {tab === 'history' && history.data && <StaffHistory data={history.data} includedWeekdays={includedWeekdays} onDay={day => { setDate(day); setTab('day'); clearFilters(); }} />}
    {active.data && <Box sx={{ px: 0.25 }}><Stack direction="row" justifyContent="space-between" gap={1} useFlexGap flexWrap="wrap" alignItems="center"><Typography variant="caption" color="text.secondary" sx={{ fontSize: 10 }}>Actualizado {new Date(active.data.updatedAt).toLocaleString('es-HN', { timeZone: 'America/Tegucigalpa' })}{tab === 'day' && date === today ? ' · Jornada en curso' : ''}</Typography><Button size="small" onClick={() => setMethodOpen(value => !value)} aria-expanded={methodOpen} aria-controls="staff-method" sx={{ fontSize: 11, py: 0 }}>Cómo se cuenta</Button></Stack>
      <Collapse in={methodOpen}><Paper id="staff-method" variant="outlined" sx={{ p: 1.25, mt: 0.5, borderRadius: 1.5 }}><Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.75 }}>Última asistencia disponible: {active.data.lastAttendance ? formatPeriodo(active.data.lastAttendance) : 'Sin datos'}</Typography>{active.data.limitations.map(text => <Typography key={text} variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>{text}</Typography>)}</Paper></Collapse>
    </Box>}
  </Stack>;
}

function StaffHistory({ data, includedWeekdays, onDay }: { data: StaffHistoryResponse; includedWeekdays: number[]; onDay: (day: string) => void }) {
  const selectedDays = data.days.filter(day => includedWeekdays.includes(new Date(`${day.day}T12:00:00Z`).getUTCDay()));
  const closed = selectedDays.filter(day => day.day < data.today && day.total > 0);
  const rankedDays = [...closed].sort((a, b) => b.absent - a.absent || b.day.localeCompare(a.day));
  const maxDate = rankedDays[0]?.absent ? rankedDays[0] : null;
  const weekdays = weekdayLabels.flatMap((label, index) => {
    if (!includedWeekdays.includes(index)) return [];
    const days = closed.filter(day => new Date(`${day.day}T12:00:00Z`).getUTCDay() === index);
    const attendance = days.reduce((sum, day) => sum + day.present + day.absent, 0);
    const complete = days.every(day => !day.pending && !day.conflict);
    const absenceRate = complete && attendance > 0 ? days.reduce((sum, day) => sum + day.absent, 0) / attendance * 100 : null;
    return [{ label, absenceRate, count: days.length, total: days.reduce((sum, day) => sum + day.absent, 0), average: days.length ? days.reduce((sum, day) => sum + day.absent, 0) / days.length : null }];
  });
  const rankedWeekdays = [...weekdays].sort((a, b) => (b.average ?? -1) - (a.average ?? -1));
  const topWeekday = rankedWeekdays[0]?.average ? rankedWeekdays[0] : null;
  const max = Math.max(1, ...weekdays.map(day => day.average ?? 0));
  const totalAbsences = closed.reduce((sum, day) => sum + day.absent, 0);
  return <Stack spacing={1.5}>
    {!includedWeekdays.length && <Alert severity="info">Selecciona al menos un día de la semana para ver las inasistencias.</Alert>}
    {!!includedWeekdays.length && !closed.length && <Alert severity="info">Sin días cerrados con datos para los días seleccionados.</Alert>}
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, minmax(0, 1fr))' }, gap: 1 }}>
      <Paper variant="outlined" sx={{ p: 1, borderRadius: 1.5 }}><Typography variant="caption" fontWeight={700}>Faltas registradas · días cerrados</Typography><Typography fontSize={23} fontWeight={800} color="error.main">{closed.length ? formatValue(totalAbsences) : '—'}</Typography><Typography variant="caption" color="text.secondary">Personas-día: una persona puede faltar en varias fechas.</Typography></Paper>
      <Paper variant="outlined" sx={{ p: 1, borderRadius: 1.5 }}><Typography variant="caption" fontWeight={700}>Fecha con más faltas</Typography><Typography fontSize={17} fontWeight={800}>{maxDate ? formatPeriodo(maxDate.day) : closed.length ? 'Sin faltas registradas' : 'Sin datos'}</Typography><Typography variant="caption" color="text.secondary">{maxDate ? `${maxDate.absent} faltas registradas` : 'En los días cerrados consultados'}</Typography></Paper>
      <Paper variant="outlined" sx={{ p: 1, borderRadius: 1.5 }}><Typography variant="caption" fontWeight={700}>Día con mayor promedio de faltas</Typography><Typography fontSize={17} fontWeight={800}>{topWeekday?.label ?? (closed.length ? 'Sin faltas registradas' : 'Sin datos')}</Typography><Typography variant="caption" color="text.secondary">{topWeekday ? `${topWeekday.average!.toLocaleString('es-HN', { maximumFractionDigits: 1 })} por fecha · ${topWeekday.count} fechas` : 'En los días cerrados consultados'}</Typography></Paper>
    </Box>
    <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2 }}><Typography fontWeight={800}>¿Qué días se registran más faltas?</Typography><Typography variant="caption" color="text.secondary">Promedio por día de semana · {formatPeriodo(data.from)} a {formatPeriodo(data.to)} · todas las divisiones y turnos</Typography>
      <Stack spacing={1} sx={{ mt: 1.5 }}>{rankedWeekdays.map(day => <Box key={day.label} sx={{ display: 'grid', gridTemplateColumns: '70px 1fr 46px 54px', gap: 1, alignItems: 'center' }}><Typography variant="caption">{day.label}</Typography><Box sx={{ bgcolor: '#fde8e8', height: 12, borderRadius: 1, overflow: 'hidden' }}><Box sx={{ height: '100%', bgcolor: 'error.main', width: `${(day.average ?? 0) / max * 100}%`, borderRadius: 1 }} /></Box><Typography variant="caption" fontWeight={800} textAlign="right">{day.average === null ? '—' : day.average.toLocaleString('es-HN', { maximumFractionDigits: 1 })}</Typography><Typography variant="caption" color="error.main" fontWeight={800} textAlign="right">{day.absenceRate === null ? '—' : `${day.absenceRate.toLocaleString('es-HN', { maximumFractionDigits: 1 })}%`}</Typography></Box>)}</Stack>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>Se muestran el promedio de faltas por fecha y el porcentaje de inasistencia: X / (A + X) de cada día de la semana.</Typography>
    </Paper>
    <Paper variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden' }}><Typography fontWeight={800} sx={{ p: 1.5 }}>Registro diario · toca una fecha para ver las salas</Typography>
      <TableContainer><Table size="small" aria-label="Histórico de asistencias e inasistencias" sx={{ ...tableSx, minWidth: 780 }}><TableHead><TableRow><TableCell>Fecha</TableCell><TableCell align="right" sx={{ color: 'success.main' }}>A · Asistieron</TableCell><TableCell align="right" sx={{ color: 'error.main' }}>X · Faltaron</TableCell><TableCell align="right">Personal</TableCell><TableCell align="right">Sin registro</TableCell><TableCell align="right">Revisar</TableCell><TableCell align="right">Tasa de faltas</TableCell></TableRow></TableHead>
        <TableBody>{[...selectedDays].reverse().map(day => <TableRow key={day.day} hover><TableCell><Button size="small" onClick={() => onDay(day.day)} sx={{ p: 0, whiteSpace: 'nowrap', fontSize: 'inherit' }}>{formatPeriodo(day.day)}</Button>{day.day === data.today && <Typography variant="caption" sx={{ display: 'block' }}>Día en curso</Typography>}{day.total === 0 && <Typography variant="caption" sx={{ display: 'block' }}>Sin datos</Typography>}</TableCell>
          <TableCell align="right">{day.total ? formatValue(day.present) : '—'}</TableCell><TableCell align="right" sx={{ color: 'error.main', fontWeight: 800 }}>{day.total ? formatValue(day.absent) : '—'}</TableCell><TableCell align="right">{day.total ? formatValue(day.total) : '—'}</TableCell><TableCell align="right" sx={{ color: day.pending ? 'warning.dark' : undefined }}>{day.total ? formatValue(day.pending) : '—'}</TableCell><TableCell align="right">{day.total ? formatValue(day.conflict) : '—'}</TableCell><TableCell align="right">{day.absenceRate === null ? '—' : `${formatValue(day.absenceRate, 'decimal')}%`}</TableCell>
        </TableRow>)}</TableBody>
      </Table></TableContainer>
    </Paper>
  </Stack>;
}

function WeekdaySelector({ includedWeekdays, onWeekdaysChange }: { includedWeekdays: number[]; onWeekdaysChange: (days: number[]) => void }) {
  const [daysAnchor, setDaysAnchor] = useState<HTMLElement | null>(null);
  return (
    <Box>
      <Button size="small" variant="outlined" startIcon={<FilterAltOutlinedIcon fontSize="small" />} onClick={event => setDaysAnchor(event.currentTarget)} aria-expanded={Boolean(daysAnchor)} aria-controls={daysAnchor ? 'staff-weekdays' : undefined} sx={{ textTransform: 'none', fontSize: 12 }}>Días de la semana ({includedWeekdays.length}/7)</Button>
      <Popover open={Boolean(daysAnchor)} anchorEl={daysAnchor} onClose={() => setDaysAnchor(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}>
        <Box id="staff-weekdays" sx={{ p: 1.5, width: 270, maxWidth: 'calc(100vw - 32px)' }}>
          <Typography fontSize={13} fontWeight={800}>Días de la semana a incluir</Typography>
          <Stack direction="row" gap={1} sx={{ my: 0.5 }}><Button size="small" onClick={() => onWeekdaysChange([0, 1, 2, 3, 4, 5, 6])}>Todos</Button><Button size="small" onClick={() => onWeekdaysChange([])}>Ninguno</Button></Stack>
          <Stack role="group" aria-label="Días de la semana a incluir">
            {[1, 2, 3, 4, 5, 6, 0].map(index => <FormControlLabel key={index} sx={{ ml: 0, '& .MuiFormControlLabel-label': { fontSize: 13 } }} label={weekdayLabels[index]} control={<Checkbox size="small" checked={includedWeekdays.includes(index)} onChange={(_, checked) => onWeekdaysChange(checked ? [...includedWeekdays, index] : includedWeekdays.filter(day => day !== index))} />} />)}
          </Stack>
          <Typography variant="caption" color="text.secondary">Los días desmarcados se excluyen de los indicadores, el gráfico y el registro diario.</Typography>
        </Box>
      </Popover>
    </Box>
  );
}
