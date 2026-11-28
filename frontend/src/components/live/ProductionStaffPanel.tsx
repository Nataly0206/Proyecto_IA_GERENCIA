import { Fragment, useState } from 'react';
import { isAxiosError } from 'axios';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Alert, Box, Button, ButtonBase, Checkbox, Chip, Collapse, Dialog, DialogContent, DialogTitle, FormControlLabel, IconButton, LinearProgress, MenuItem, Paper, Popover, Skeleton,
  Stack, Table, TableBody, TableCell, TableContainer, TableFooter, TableHead, TableRow,
  TextField, ToggleButton, ToggleButtonGroup, Typography,
} from '@mui/material';
import RefreshOutlinedIcon from '@mui/icons-material/RefreshOutlined';
import FilterAltOutlinedIcon from '@mui/icons-material/FilterAltOutlined';
import CloseIcon from '@mui/icons-material/Close';
import { apiClient } from '../../api/client';
import type { StaffEmployee, StaffHistoryResponse, StaffKind, StaffResponse, StaffStatus } from '../../types/productionStaff';
import { formatPeriodo, formatValue } from '../../utils/format';
import StaffJourneyButton from './StaffJourneyButton';
import StaffTrend, { STAFF_TREND_QUERY_KEY } from './StaffTrend';

const todayInHonduras = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Tegucigalpa', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const weekdayLabels = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const NO_ACTIVITY = 'Sin actividad registrada';
/** Debe coincidir con ACTIVITY_PROCESS_SUFFIX del backend: grupos de personas sin actividad del catálogo. */
const ACTIVITY_PROCESS_SUFFIX = ' · sin actividad específica';
const AUX_PREFIX = 'AUX::';
const NO_LINE = 'Sin línea registrada';
/** Clave de agrupación por actividad: línea de producción + actividad del último chequeo (o proceso de la pesa). */
const activityKey = (person: StaffEmployee) => JSON.stringify([person.activityAssignment?.line?.replace(/\s+/g, ' ').trim() || NO_LINE, person.activity || NO_ACTIVITY]);
const activityParts = (key: string) => { try { const [line, activity] = JSON.parse(key) as [string, string]; return { line, activity }; } catch { return { line: NO_LINE, activity: key }; } };
const activityRank = (group: string) => group === NO_ACTIVITY ? 2 : group.endsWith(ACTIVITY_PROCESS_SUFFIX) ? 1 : 0;
type GroupBy = 'area' | 'activity' | 'department';
/** Lista oficial de departamentos de planta; debe coincidir con PLANT_DEPARTMENTS del backend (production-staff-department.ts). */
const PLANT_DEPARTMENT_SECTIONS = [
  { code: '1', label: 'Mano de obra directa', items: ['1.1 Descabezado', '1.2 Clasificado', '1.3 Pelado', '1.4 IQF', '1.5 Salmuera', '1.6 Recepción', '1.7 Cocinado', '1.8 Langosta', '1.9 Decoración Anillos', '1.10 Reempaque WSO'] },
  { code: '2', label: 'Mano de obra de apoyo', items: ['2.1 Bodega, empaque, código', '2.2 Calidad, lavandería y POES', '2.3 RRHH, gestión ambiental y mantenimiento'] },
];
const NO_DEPARTMENT = 'Sin departamento asignado';
type StaffGroupSelection = { label: string; rows: StaffEmployee[] } | null;
const staffStatusLabels: Record<StaffStatus, string> = {
  present: 'A · Asistió',
  absent: 'X · Falta',
  excused: 'Permiso / incapacidad',
  off: 'Descanso / vacaciones',
  noProduction: 'Sin producción',
  pending: 'Sin registro',
  conflict: 'Revisar',
};
const GROUP_STORAGE_KEY = 'personal:agrupar-por';
function storedGroupBy(): GroupBy {
  try {
    const stored = localStorage.getItem(GROUP_STORAGE_KEY);
    return stored === 'activity' || stored === 'department' ? stored : 'area';
  } catch { return 'area'; }
}
const kindLabels = { production: 'Obra', auxiliary: 'Auxiliares', supervisor: 'Supervisores' } as const;
/** Asistió según STB (chequeo o pesa); las tarjetas y columnas por tipo de personal usan esta regla. */
const stbPresent = (person: StaffEmployee) => person.stbAttendance ?? (person.hasCheck || person.sources.includes('weighing'));
const statusLabel = (person: StaffEmployee) => person.biometricEntry ? person.status === 'conflict' ? 'A · Entrada / revisar novedad' : 'A · Entrada confirmada' : person.status === 'present' ? 'Pesa / chequeo sin entrada' : person.derivedAbsence ? 'X · Sin chequeo/pesa al corte' : person.provisionalAbsence ? 'X · Falta provisional' : staffStatusLabels[person.status];
function countPeople(people: StaffEmployee[]) {
  const count = (status: StaffStatus) => people.filter(person => person.status === status).length;
  const present = people.filter(person => person.biometricEntry).length, absent = count('absent'), pending = count('pending'), conflict = count('conflict');
  const provisionalAbsent = people.filter(person => person.status === 'absent' && person.provisionalAbsence).length;
  return { biometricMarked: people.filter(p => p.biometricMarked).length, biometricEntry: people.filter(p => p.biometricEntry).length,
    biometricReview: people.filter(p => p.biometricReview).length, biometricWithoutPayment: people.filter(p => p.biometricMarked && !p.hasPositivePayment).length,
    checkedPeople: people.filter(p => p.hasCheck).length, total: people.length, present, absent, provisionalAbsent, derivedAbsent: people.filter(person => person.status === 'absent' && person.derivedAbsence).length, confirmedAbsent: people.filter(person => person.status === 'absent' && person.absenceRecorded).length, pending, conflict, excused: count('excused'), off: count('off'), noProduction: count('noProduction'),
    absenceRate: !pending && !conflict && !people.some(person => person.status === 'present' && !person.biometricEntry) && present + absent > 0 ? absent / (present + absent) * 100 : null };
}
const tableSx = {
  '& th, & td': { px: { xs: 0.75, sm: 1.5 }, py: 0.8, fontSize: { xs: 11, sm: 12.5 }, fontVariantNumeric: 'tabular-nums' },
  '& thead th': { bgcolor: '#f1f5f9', fontWeight: 800, whiteSpace: 'normal', lineHeight: 1.4 },
  '& th:first-of-type, & td:first-of-type': { position: 'sticky', left: 0, zIndex: 1, bgcolor: 'background.paper', whiteSpace: 'normal', boxShadow: '2px 0 3px #0f172a0d' },
  // Esquina fija: por encima de la primera columna fija y del resto del encabezado fijo.
  '& thead th:first-of-type': { bgcolor: '#f1f5f9', zIndex: 3 },
  '& tbody tr:nth-of-type(even) td': { bgcolor: '#fbfcfe' },
  '& tfoot td': { bgcolor: '#f1f5f9', fontWeight: 800 },
} as const;
// Las tablas de los modales deben ajustarse al panel y mostrar todo el texto.
const staffDetailTableSx = {
  width: '100%', tableLayout: 'fixed',
  '& th, & td': { whiteSpace: 'normal', overflowWrap: 'anywhere', verticalAlign: 'top', px: 1.25, py: 0.8, fontSize: 12 },
  '& .MuiChip-root': { maxWidth: '100%', height: 'auto', minHeight: 24 },
  '& .MuiChip-label': { whiteSpace: 'normal', overflowWrap: 'anywhere', py: 0.4 },
} as const;
function message(error: unknown) {
  return isAxiosError(error) && typeof error.response?.data?.error === 'string' ? error.response.data.error : 'No se pudieron consultar los chequeos y las pesas de Personal. Intenta actualizar.';
}

export default function ProductionStaffPanel({ userId }: { userId: string }) {
  const today = todayInHonduras();
  const [date, setDate] = useState(today);
  const [tab, setTab] = useState<'day' | 'trend' | 'history'>('day');
  const [division, setDivision] = useState('');
    const [job, setJob] = useState('');
  const [kind, setKind] = useState<StaffKind | ''>('');
  const [shift, setShift] = useState('');
  const [evidenceFilter, setEvidenceFilter] = useState('');
  const [search, setSearch] = useState('');
  const [directoryOpen, setDirectoryOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [groupBy, setGroupBy] = useState<GroupBy>(storedGroupBy);
  const [staffGroupSelection, setStaffGroupSelection] = useState<StaffGroupSelection>(null);
  const [kindSelection, setKindSelection] = useState<{ kind: StaffKind; label: string; color: string } | null>(null);
  const changeGroupBy = (value: GroupBy) => {
    setGroupBy(value);
    try { localStorage.setItem(GROUP_STORAGE_KEY, value); } catch { /* preferencia opcional */ }
  };
  const requiredByDepartment: Record<string, number> = {
    '1.1 Descabezado': 19 + 9,
    '1.2 Clasificado': 17 + 17 + 16,
    '1.3 Pelado': 17 + 9 + 9 + 5 + 55,
    '1.4 IQF': 8 + 13 + 13 + 13,
    '1.6 Recepción': 6,
    '1.7 Cocinado': 12,
    '1.10 Reempaque WSO': 12,
  };
  const requiredIn = (group: string) => {
    const section = PLANT_DEPARTMENT_SECTIONS.find(item => item.label === group);
    const departments = !group ? PLANT_DEPARTMENT_SECTIONS.flatMap(item => item.items) : section?.items ?? [group];
    return departments.reduce((sum, department) => sum + (requiredByDepartment[department] ?? 0), 0);
  };
  const [methodOpen, setMethodOpen] = useState(false);
  const [includedWeekdays, setIncludedWeekdays] = useState<number[]>([0, 1, 2, 3, 4, 5, 6]);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<unknown>(null);
  const client = useQueryClient();
  const parsed = new Date(`${date}T12:00:00Z`);
  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(date) && date >= '2000-01-01' && date <= today && Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date;
  const queryKey = ['personal-produccion-operativo-v5', userId, date] as const;
  const historyKey = ['personal-produccion-operativo-historico-v4', userId, date] as const;
  const query = useQuery({
    queryKey, queryFn: async ({ signal }) => (await apiClient.get<StaffResponse>('/dashboard/personal-produccion', { params: { fecha: date }, signal })).data,
    enabled: validDate && tab === 'day', staleTime: 60_000, refetchInterval: tab === 'day' && date === today ? 60_000 : false,
  });
  const history = useQuery({
    queryKey: historyKey, queryFn: async ({ signal }) => (await apiClient.get<StaffHistoryResponse>('/dashboard/personal-produccion/historico', { params: { fecha: date }, signal })).data,
    enabled: validDate && tab === 'history', staleTime: 5 * 60_000,
  });
  const active = tab === 'day' ? query : history;
  const trendFetching = client.isFetching({ queryKey: [STAFF_TREND_QUERY_KEY] }) > 0;
  const refresh = async () => {
    if (tab === 'trend') { void client.invalidateQueries({ queryKey: [STAFF_TREND_QUERY_KEY] }); return; }
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
  const clearFilters = () => { setDivision(''); setShift(''); setJob(''); setKind(''); setEvidenceFilter(''); setSearch(''); };
  const people = (query.data?.employees ?? []).map(person => person.kind === 'unknown' || person.kind === 'machine' ? { ...person, kind: 'auxiliary' as const } : person).filter(person => (!division || person.division === division) && (!shift || person.shift === shift) && (!job || person.job === job) && (!kind || person.kind === kind));
  const evidenceMatches = (person: StaffEmployee) => !evidenceFilter || (evidenceFilter === 'marked' ? person.biometricMarked : evidenceFilter === 'entry' ? person.biometricEntry : evidenceFilter === 'review' ? person.biometricReview : evidenceFilter === 'unpaid' ? person.biometricMarked && !person.hasPositivePayment : person.hasCheck);
  const directoryPeople = people.filter(evidenceMatches).filter(person => !search || `${person.name} ${person.code} ${person.id}`.toLocaleLowerCase('es').includes(search.toLocaleLowerCase('es')));
  const absenceAvailable = query.data?.absenceDataAvailable ?? query.data?.source !== 'STB_data';
  const counted = countPeople(people);
  const counts = { ...counted, absenceRate: absenceAvailable ? counted.absenceRate : null };
  const mainAreas = [...[1, 2, 3, 4].map(number => `Pelado · Sala ${number}`), 'Descabezado', 'Clasificado'];
  // Por área, los auxiliares no se reparten en las salas: van contabilizados en su propio bloque al final.
  // Por actividad, la clave combina línea de producción y actividad (ver activityKey).
  const groupOf = (person: StaffEmployee) => groupBy === 'area'
    ? person.kind === 'auxiliary' ? `${AUX_PREFIX}${person.area}` : person.area
    : groupBy === 'department'
      ? person.plantDepartment ?? NO_DEPARTMENT
      : activityKey(person);
  const presentIn = (group: string) => people.filter(person => groupOf(person) === group && person.biometricEntry).length;
  const areaKeys = [...new Set(people.map(groupOf))];
  const groups = groupBy === 'area'
    ? [...mainAreas, ...areaKeys.filter(value => !mainAreas.includes(value) && !value.startsWith(AUX_PREFIX)).sort((a, b) => a.localeCompare(b, 'es', { numeric: true })),
      ...areaKeys.filter(value => value.startsWith(AUX_PREFIX)).sort((a, b) => presentIn(b) - presentIn(a) || a.localeCompare(b, 'es', { numeric: true }))]
    : groupBy === 'department'
      // La lista completa aunque tenga cero personas; lo que quede fuera de ella va al final.
      ? [...PLANT_DEPARTMENT_SECTIONS.flatMap(section => section.items), ...[...new Set(people.map(groupOf))].filter(value => !PLANT_DEPARTMENT_SECTIONS.some(section => section.items.includes(value))).sort((a, b) => Number(a === NO_DEPARTMENT) - Number(b === NO_DEPARTMENT) || a.localeCompare(b, 'es'))]
    // Por actividad: primero las del catálogo, luego los procesos sin actividad específica y al final quienes no registran nada;
    // dentro de cada bloque, de mayor a menor asistencia.
    : [...new Set(people.map(groupOf))].sort((a, b) => activityRank(activityParts(a).activity) - activityRank(activityParts(b).activity) || activityParts(a).line.localeCompare(activityParts(b).line, 'es', { numeric: true }) || presentIn(b) - presentIn(a) || a.localeCompare(b, 'es', { numeric: true }));
  const groupLabel = (group: string) => groupBy === 'area' ? group.replace(AUX_PREFIX, 'Auxiliares · ') : groupBy === 'activity' ? (({ line, activity }) => `${line} · ${activity}`)(activityParts(group)) : group;
  const emptyGroup = groupBy === 'area' ? 'Sin sala/área asignada' : groupBy === 'department' ? NO_DEPARTMENT : NO_ACTIVITY;
  const activeFilters = [division, shift, job, kind].filter(Boolean).length;
  const cell = (rows: StaffEmployee[], area: string, status?: StaffStatus, category?: StaffKind) => {
    const unavailable = (status === 'absent' && !absenceAvailable) || !query.data?.employees.length
      || (query.data.locationAvailable === false && !!area && area !== emptyGroup);
    const value = rows.filter(person => (!status || (status === 'present' ? (category ? stbPresent(person) : person.biometricEntry) : person.status === status)) && (!category || person.kind === category)).length;
    return <TableCell align="right" sx={{ fontWeight: status === 'present' || status === 'absent' ? 800 : 600, color: status === 'absent' ? 'error.main' : status === 'present' ? 'success.main' : 'text.primary' }}>{unavailable ? '—' : formatValue(value)}</TableCell>;
  };
  const auxiliaryCells = (rows: StaffEmployee[], group: string) => {
    if (groupBy !== 'department') return cell(rows, group, 'present', 'auxiliary');
    const required = requiredIn(group);
    const present = rows.filter(person => stbPresent(person) && person.kind === 'auxiliary').length;
    const unavailable = !query.data?.employees.length || (query.data.locationAvailable === false && !!group && group !== emptyGroup);
    const difference = present - required;
    return <>{cell(rows, group, 'present', 'auxiliary')}<TableCell align="right" sx={{ fontWeight: 700 }}>{formatValue(required)}</TableCell><TableCell align="right" title={`Auxiliares presentes: ${present} · Requeridos: ${required}`} sx={{ fontWeight: 800, color: difference < 0 ? 'error.main' : difference > 0 ? 'success.main' : 'text.primary' }}>{unavailable ? '—' : `${difference > 0 ? '+' : ''}${formatValue(difference)}`}</TableCell></>;
  };
  const bodyCells = (rows: StaffEmployee[], area: string) => <>{cell(rows, area, 'present')}{cell(rows, area, 'absent')}{cell(rows, area, 'present', 'production')}{auxiliaryCells(rows, area)}{cell(rows, area)}{cell(rows, area, 'present', 'supervisor')}{cell(rows, area, 'pending')}{cell(rows, area, 'conflict')}</>;
  const members = (category: StaffKind) => people.filter(person => person.kind === category);
  return <Stack spacing={1.5} sx={{ minWidth: 0 }}>
    <Paper variant="outlined" sx={{ px: 1.75, py: 1.25, borderRadius: 2.5, borderColor: '#e2e8f0', boxShadow: '0 2px 8px #0f172a03' }}>
      <Stack direction="row" gap={{ xs: 1.25, md: 2 }} useFlexGap flexWrap="wrap" alignItems="center" sx={{ '& > *': { flexShrink: 0 }, '& .MuiToggleButtonGroup-root': { height: 30 }, '& .MuiToggleButton-root': { textTransform: 'none', px: 0.9, py: 0.4, fontSize: 11, whiteSpace: 'nowrap' }, '& .MuiButton-root': { textTransform: 'none', fontSize: 11, minWidth: 0, px: 0.75 } }}>
        <Typography fontWeight={800} fontSize={15} title="Personal temporal · biométrico y recorrido de chequeos" sx={{ mr: 0.5 }}>Personal</Typography>
        <ToggleButtonGroup exclusive size="small" value={tab} onChange={(_, value) => value && setTab(value)} aria-label="Vista de asistencia"><ToggleButton value="day">Por sala</ToggleButton><ToggleButton value="trend">Tendencia</ToggleButton><ToggleButton value="history">Histórico</ToggleButton></ToggleButtonGroup>
        {tab !== 'trend' && <><TextField size="small" type="date" label={tab === 'day' ? 'Fecha' : 'Hasta la fecha'} value={date} onChange={event => { setDate(event.target.value); clearFilters(); }} error={!validDate} InputLabelProps={{ shrink: true }} inputProps={{ min: '2000-01-01', max: today }} sx={{ width: 138, '& input': { py: 0.65, px: 1, fontSize: 11 }, '& .MuiInputLabel-root': { fontSize: 11 } }} />
        <Button size="small" onClick={() => { setDate(today); clearFilters(); }}>Hoy</Button></>}
        {tab !== 'day' && <WeekdaySelector includedWeekdays={includedWeekdays} onWeekdaysChange={setIncludedWeekdays} />}
        {tab === 'day' && <Button size="small" startIcon={<FilterAltOutlinedIcon sx={{ fontSize: '14px !important' }} />} onClick={() => setFiltersOpen(value => !value)} aria-expanded={filtersOpen} aria-controls="staff-filters">Filtros{activeFilters ? ` (${activeFilters})` : ''}</Button>}
        {tab === 'day' && (() => {
          // Turno = TA/TB escrito en la línea o actividad del chequeo del día (sin TA/TB queda "Sin turno").
          const base = (query.data?.employees ?? []).filter(person => (!division || person.division === division) && (!job || person.job === job));
          const count = (value: string) => base.filter(person => person.shift === value && stbPresent(person)).length;
          return <ToggleButtonGroup size="small" exclusive value={shift} onChange={(_, value) => { if (value !== null) { setShift(value); setStaffGroupSelection(null); setKindSelection(null); } }} aria-label="Separar asistencia por turno">
            <ToggleButton value="">Todos</ToggleButton>
            <ToggleButton value="A">Turno A ({formatValue(count('A'))})</ToggleButton>
            <ToggleButton value="B">Turno B ({formatValue(count('B'))})</ToggleButton>
            <ToggleButton value="Sin turno registrado">Sin turno ({formatValue(count('Sin turno registrado'))})</ToggleButton>
          </ToggleButtonGroup>;
        })()}
        {tab === 'day' && <Stack direction="row" gap={1.25} alignItems="center">
          <Typography variant="caption" fontWeight={700} sx={{ whiteSpace: 'nowrap', fontSize: 11 }}>Agrupar por</Typography>
          <ToggleButtonGroup exclusive size="small" value={groupBy} onChange={(_, value) => { if (value) { changeGroupBy(value); setStaffGroupSelection(null); } }} aria-label="Agrupar personal por">
            <ToggleButton value="area">Área</ToggleButton><ToggleButton value="department">Departamento</ToggleButton><ToggleButton value="activity">Actividad</ToggleButton>
          </ToggleButtonGroup>
        </Stack>}
        <IconButton size="small" aria-label="Actualizar asistencia" disabled={tab === 'trend' ? trendFetching : refreshing || active.isFetching || !validDate} onClick={() => void refresh()} sx={{ ml: 'auto' }}><RefreshOutlinedIcon sx={{ fontSize: 17 }} /></IconButton>
      </Stack>
      <Collapse in={filtersOpen && tab === 'day'}><Box id="staff-filters" sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', md: 'repeat(4, minmax(0, 1fr))' }, gap: 1, mt: 1 }}>
        <TextField select size="small" label="División" value={division} onChange={event => setDivision(event.target.value)}><MenuItem value="">Todas las divisiones</MenuItem>{[...new Set(query.data?.employees.map(value => value.division) ?? [])].sort().map(value => <MenuItem key={value} value={value}>{value}</MenuItem>)}</TextField>
        <TextField select size="small" label="Puesto" value={job} onChange={event => setJob(event.target.value)}><MenuItem value="">Todos los puestos</MenuItem>{[...new Set(query.data?.employees.map(value => value.job) ?? [])].sort().map(value => <MenuItem key={value} value={value}>{value}</MenuItem>)}</TextField>
        <TextField select size="small" label="Tipo de personal" value={kind} onChange={event => setKind(event.target.value as StaffKind | '')}><MenuItem value="">Todo el personal</MenuItem>{(Object.keys(kindLabels) as (keyof typeof kindLabels)[]).map(value => <MenuItem key={value} value={value}>{kindLabels[value]}</MenuItem>)}</TextField>
      </Box>{!!activeFilters && <Button size="small" onClick={clearFilters} sx={{ mt: 0.5 }}>Limpiar filtros</Button>}</Collapse>
      {tab !== 'trend' && (active.isFetching || refreshing) && <LinearProgress sx={{ mt: 1, height: 2 }} />}
    </Paper>
    {tab !== 'trend' && !validDate && <Alert severity="warning" sx={{ py: 0 }}>Selecciona una fecha válida, hasta hoy.</Alert>}
    {tab !== 'trend' && (active.isError || !!refreshError) && <Alert severity="error" action={<Button color="inherit" size="small" onClick={() => void refresh()}>Reintentar</Button>}>{message(refreshError || active.error)}{active.data ? ' Se conserva la última consulta; revisa su hora de actualización.' : ''}</Alert>}
    {tab !== 'trend' && validDate && active.isLoading && <Skeleton variant="rounded" height={200} />}
    {tab === 'day' && query.data && <>
      {!query.data.employees.length && <Alert severity="info">Sin personal registrado en las fuentes para esta fecha.</Alert>}
      {(() => {
        const kindStats = (category: StaffKind) => { const rows = members(category); return { rows, present: rows.filter(stbPresent).length, total: rows.length, absent: rows.filter(person => person.status === 'absent').length }; };
        const kinds = ([
          { kind: 'production', label: 'Obra', color: '#1e40af' },
          { kind: 'auxiliary', label: 'Auxiliares', color: '#166534' },
          { kind: 'supervisor', label: 'Supervisores', color: '#9a3412' },
        ] as const).map(item => ({ ...item, ...kindStats(item.kind) }));
        const presentTotal = kinds.reduce((sum, item) => sum + item.present, 0);
        const evidence = (key: string) => { setEvidenceFilter(key); setSearch(''); setDirectoryOpen(true); };
        const tiles = [
          { label: 'Asistieron · A', value: formatValue(counts.present), detail: 'Entrada biométrica', color: '#0f766e', onClick: () => evidence('entry') },
          { label: 'Según biométrico', value: formatValue(counts.biometricMarked), detail: 'Alguna marca del día', color: '#2563eb', onClick: () => evidence('marked') },
          { label: 'Marca sin entrada', value: formatValue(counts.biometricReview), detail: 'Revisar', color: '#b45309', onClick: () => evidence('review') },
          { label: 'Chequeados', value: formatValue(counts.checkedPeople), detail: 'STB · personas únicas', color: '#6366f1', onClick: () => evidence('checks') },
          { label: 'Marca sin pesado', value: formatValue(counts.biometricWithoutPayment), detail: 'Sin pago positivo', color: '#0284c7', onClick: () => evidence('unpaid') },
          { label: 'Faltaron · X', value: absenceAvailable ? formatValue(counts.absent) : '—', detail: 'Registradas en Payroll', color: '#dc2626', onClick: () => setStaffGroupSelection({ label: 'Faltas registradas', rows: people.filter(person => person.status === 'absent') }) },
          { label: 'Personal total', value: formatValue(counts.total), detail: 'Padrón temporal', color: '#475569', onClick: () => evidence('') },
        ];
        const tileSx = { textAlign: 'left', display: 'block', px: 1.25, py: 0.9, borderRadius: 2, minWidth: 0, '&:hover': { bgcolor: '#f8fafc' } } as const;
        return <Paper variant="outlined" sx={{ borderRadius: 2.5, borderColor: '#e2e8f0', p: 0.5 }}>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', sm: 'repeat(4, minmax(0, 1fr))', lg: 'repeat(7, minmax(0, 1fr))' } }}>
            {tiles.map(tile => <ButtonBase key={tile.label} onClick={tile.onClick} sx={tileSx}>
              <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block', fontSize: 11 }}>{tile.label}</Typography>
              <Typography fontWeight={800} color={tile.color} sx={{ fontSize: 22, lineHeight: 1.2, fontVariantNumeric: 'tabular-nums' }}>{tile.value}</Typography>
              <Typography variant="caption" color="text.secondary" noWrap sx={{ display: 'block', fontSize: 10 }}>{tile.detail}</Typography>
            </ButtonBase>)}
          </Box>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, minmax(0, 1fr))' }, borderTop: '1px solid #e2e8f0', mt: 0.5, pt: 0.5 }}>
            {kinds.map(item => <ButtonBase key={item.kind} onClick={() => setKindSelection({ kind: item.kind, label: item.label, color: item.color })} sx={tileSx}>
              <Stack direction="row" alignItems="baseline" gap={0.75} useFlexGap flexWrap="wrap">
                <Typography fontWeight={800} color={item.color} sx={{ fontSize: 12 }}>{item.label}</Typography>
                <Typography fontWeight={800} color={item.color} sx={{ fontSize: 22, lineHeight: 1.2, fontVariantNumeric: 'tabular-nums' }}>{counts.total ? formatValue(item.present) : '—'}</Typography>
                <Typography variant="caption" color="text.secondary">asistieron de {formatValue(item.total)} · Faltaron: {absenceAvailable ? formatValue(item.absent) : '—'} · {presentTotal ? `${formatValue(item.present / presentTotal * 100, 'decimal')}%` : '—'}</Typography>
              </Stack>
              <Box sx={{ height: 4, borderRadius: 2, bgcolor: `${item.color}1f`, overflow: 'hidden', mt: 0.5 }}><Box sx={{ height: '100%', width: presentTotal ? `${item.present / presentTotal * 100}%` : 0, bgcolor: item.color }} /></Box>
            </ButtonBase>)}
          </Box>
        </Paper>;
      })()}
      <Paper variant="outlined" sx={{ borderRadius: 2.5, borderColor: '#e2e8f0', overflow: 'hidden' }}>
        <TableContainer sx={{ maxHeight: '75vh' }}><Table size="small" stickyHeader aria-label={groupBy === 'area' ? 'Asistencia por sala y área' : groupBy === 'department' ? 'Asistencia por departamento' : 'Asistencia por actividad'} sx={{ ...tableSx, tableLayout: 'fixed', width: groupBy === 'area' ? 885 : groupBy === 'department' ? 1155 : 1085, minWidth: '100%' }}>
          <colgroup>{[...(groupBy === 'area' ? [170] : groupBy === 'department' ? [210] : [190, 190]), 75, 75, 90, 90, ...(groupBy === 'department' ? [90, 90] : []), 75, 90, 90, 90].map((width, index) => <col key={index} style={{ width }} />)}</colgroup>
          <TableHead><TableRow>{groupBy === 'activity' ? <><TableCell>Línea de producción</TableCell><TableCell>Actividad</TableCell></> : <TableCell>{groupBy === 'area' ? 'Sala / área' : 'Departamento'}</TableCell>}<TableCell align="right" sx={{ color: 'success.main' }}>A · Asistieron</TableCell><TableCell align="right" sx={{ color: 'error.main' }}>X · Faltaron</TableCell><TableCell align="right">Obra presentes</TableCell><TableCell align="right">Auxiliares presentes</TableCell>{groupBy === 'department' && <><TableCell align="right">Auxiliares Requeridos</TableCell><TableCell align="right">Diferencia</TableCell></>}<TableCell align="right">Personal total</TableCell><TableCell align="right">Supervisores presentes</TableCell><TableCell align="right">Sin registro</TableCell><TableCell align="right">Revisar</TableCell></TableRow></TableHead>
          <TableBody>{groups.map((group, index) => {
            const rows = people.filter(person => groupOf(person) === group);
            const auxSectionStart = groupBy === 'area' && group.startsWith(AUX_PREFIX) && !groups[index - 1]?.startsWith(AUX_PREFIX);
            const deptSection = groupBy === 'department' ? PLANT_DEPARTMENT_SECTIONS.find(item => item.items[0] === group) : undefined;
            const section = auxSectionStart ? { title: 'Auxiliares (contabilizados aparte, no por sala)', rows: people.filter(person => person.kind === 'auxiliary') }
              : deptSection ? { title: `${deptSection.code}. ${deptSection.label}`, rows: people.filter(person => deptSection.items.includes(groupOf(person))) } : undefined;
            const indented = (groupBy === 'department' && PLANT_DEPARTMENT_SECTIONS.some(item => item.items.includes(group))) || (groupBy === 'area' && group.startsWith(AUX_PREFIX));
            const name = (label: string, bold: boolean) => <Button size="small" onClick={() => setStaffGroupSelection({ label: groupLabel(group), rows })} sx={{ p: 0, minWidth: 0, justifyContent: 'flex-start', textAlign: 'left', textTransform: 'none', fontSize: 'inherit', fontWeight: bold ? 800 : 600, lineHeight: 1.35 }}>{label}</Button>;
            const { line, activity } = groupBy === 'activity' ? activityParts(group) : { line: '', activity: '' };
            return <Fragment key={group}>
              {section && <TableRow sx={{ '& td': { bgcolor: '#eef2f7 !important', fontWeight: 800 } }}><TableCell colSpan={groupBy === 'activity' ? 2 : 1}><Button size="small" onClick={() => setStaffGroupSelection({ label: section.title, rows: section.rows })} sx={{ p: 0, minWidth: 0, justifyContent: 'flex-start', textAlign: 'left', textTransform: 'none', fontSize: 'inherit', fontWeight: 800, lineHeight: 1.35, color: 'text.primary' }}>{section.title}</Button></TableCell>{bodyCells(section.rows, section.title)}</TableRow>}
              <TableRow>
                {groupBy === 'activity'
                  ? <><TableCell>{name(line, true)}</TableCell><TableCell>{name(activity, false)}</TableCell></>
                  : <TableCell sx={indented ? { pl: { xs: 2, sm: 3 } } : undefined}>{name(group.replace(AUX_PREFIX, ''), !indented)}{rows.some(person => person.wildcard) && <Typography variant="caption" color="text.secondary" sx={{ display: 'block', fontSize: 10 }}>{rows.filter(person => person.wildcard).length} comodines incluidos</Typography>}</TableCell>}
                {bodyCells(rows, group)}
              </TableRow>
            </Fragment>;
          })}</TableBody>
          <TableFooter><TableRow><TableCell colSpan={groupBy === 'activity' ? 2 : 1}>Total</TableCell>{bodyCells(people, '')}</TableRow></TableFooter>
        </Table></TableContainer>
      </Paper>
    </>}
    {tab === 'trend' && <StaffTrend userId={userId} includedWeekdays={includedWeekdays} onDay={day => { setDate(day); setTab('day'); clearFilters(); }} />}
    {tab === 'history' && history.data && <StaffHistory data={history.data} includedWeekdays={includedWeekdays} onDay={day => { setDate(day); setTab('day'); clearFilters(); }} />}
    {tab !== 'trend' && active.data && <Box sx={{ px: 0.25 }}><Stack direction="row" justifyContent="space-between" gap={1} useFlexGap flexWrap="wrap" alignItems="center"><Typography variant="caption" color="text.secondary" sx={{ fontSize: 10 }}>Actualizado {new Date(active.data.updatedAt).toLocaleString('es-HN', { timeZone: 'America/Tegucigalpa' })}{tab === 'day' && date === today ? ' · Jornada en curso' : ''}</Typography><Button size="small" onClick={() => setMethodOpen(value => !value)} aria-expanded={methodOpen} aria-controls="staff-method" sx={{ fontSize: 11, py: 0 }}>Cómo se cuenta</Button></Stack>
      <Collapse in={methodOpen}><Paper id="staff-method" variant="outlined" sx={{ p: 1.25, mt: 0.5, borderRadius: 1.5 }}><Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.75 }}>Última asistencia disponible: {active.data.lastAttendance ? formatPeriodo(active.data.lastAttendance) : 'Sin datos'}</Typography>{active.data.limitations.map(text => <Typography key={text} variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.5 }}>{text}</Typography>)}</Paper></Collapse>
    </Box>}
    <Dialog open={directoryOpen} onClose={() => setDirectoryOpen(false)} fullWidth maxWidth="md">
      <DialogTitle>Personas y recorrido de chequeos</DialogTitle>
      <DialogContent>
        <Stack direction={{ xs: 'column', sm: 'row' }} gap={1} sx={{ py: 1 }}>
          <TextField size="small" label="Nombre, código o ID" value={search} onChange={event => setSearch(event.target.value)} fullWidth />
          <TextField select size="small" label="Registro" value={evidenceFilter} onChange={event => setEvidenceFilter(event.target.value)} sx={{ minWidth: 220 }}><MenuItem value="">Todo el padrón</MenuItem><MenuItem value="marked">Según biométrico</MenuItem><MenuItem value="entry">Según Chequeo</MenuItem><MenuItem value="review">Marca sin entrada</MenuItem><MenuItem value="unpaid">Con marca, sin pesado</MenuItem><MenuItem value="checks">Con chequeo de actividad</MenuItem></TextField>
        </Stack>
        <Typography variant="caption">{directoryPeople.length} personas · respeta los filtros de personal seleccionados</Typography>
        <TableContainer sx={{ maxHeight: '60vh' }}><Table size="small" stickyHeader><TableHead><TableRow><TableCell>Empleado</TableCell><TableCell>Estado</TableCell><TableCell>Recorrido</TableCell></TableRow></TableHead><TableBody>{directoryPeople.map(person => <TableRow key={person.id}><TableCell>{person.name}<Typography variant="caption" sx={{ display: 'block' }}>{person.code} · ID {person.id}</Typography></TableCell><TableCell>{statusLabel(person)}</TableCell><TableCell><StaffJourneyButton person={person} /></TableCell></TableRow>)}</TableBody></Table></TableContainer>
        {!directoryPeople.length && <Alert severity="info">Sin personas para esta selección.</Alert>}
        <Button onClick={() => setDirectoryOpen(false)} sx={{ mt: 1 }}>Cerrar</Button>
      </DialogContent>
    </Dialog>
    <StaffKindDialog absenceAvailable={absenceAvailable} selection={kindSelection} people={kindSelection ? members(kindSelection.kind) : []} onClose={() => setKindSelection(null)} />
    <Dialog open={!!staffGroupSelection} onClose={() => setStaffGroupSelection(null)} fullWidth maxWidth="xl" PaperProps={{ sx: { m: { xs: 1, sm: 3 }, width: { xs: 'calc(100% - 16px)', sm: 'calc(100% - 48px)' } } }}>
      <DialogTitle sx={{ px: 2, py: 1.25, borderBottom: '1px solid', borderColor: 'divider' }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1}>
          <Box>
            <Typography fontWeight={800}>{staffGroupSelection?.label ?? 'Personal'}</Typography>
            <Typography variant="caption" color="text.secondary">{staffGroupSelection?.rows.length ?? 0} personas</Typography>
          </Box>
          <IconButton size="small" onClick={() => setStaffGroupSelection(null)} aria-label="Cerrar"><CloseIcon /></IconButton>
        </Stack>
      </DialogTitle>
      <DialogContent sx={{ px: 0, pb: 0 }}>
        {(() => {
          const sortedRows = [...(staffGroupSelection?.rows ?? [])].sort((a, b) => a.name.localeCompare(b.name, 'es', { numeric: true }));
          const productionRows = sortedRows.filter(person => person.kind === 'production');
          const auxiliaryRows = sortedRows.filter(person => person.kind === 'auxiliary');
          const supervisorRows = sortedRows.filter(person => person.kind === 'supervisor');
          const peopleColumn = (title: string, rows: StaffEmployee[], color: string) => (
            <Box sx={{ minWidth: 0, flex: 1 }}>
              <Box sx={{ px: 1.25, py: 0.75, bgcolor: color, borderBottom: '1px solid', borderColor: 'divider' }}>
                <Typography fontSize={13} fontWeight={800}>{title}</Typography>
                <Typography variant="caption" color="text.secondary">{rows.length} personas</Typography>
              </Box>
              <TableContainer sx={{ maxHeight: 400 }}>
                    <Table size="small" stickyHeader aria-label={`Listado de personas de ${title}`} sx={staffDetailTableSx}>
                      <colgroup>{(groupBy === 'department' ? ['32%', '30%', '18%', '20%'] : ['40%', '38%', '22%']).map((width, index) => <col key={index} style={{ width }} />)}</colgroup>
                      <TableHead>
                        <TableRow>
                          <TableCell sx={{ fontWeight: 800 }}>Nombre</TableCell>
                          <TableCell sx={{ fontWeight: 800 }}>Puesto</TableCell>
                          <TableCell sx={{ fontWeight: 800 }}>Estado</TableCell>
                          {groupBy === 'department' && <TableCell sx={{ fontWeight: 800 }}>Línea de origen</TableCell>}
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {rows.map(person => (
                          <TableRow key={person.id} hover>
                            <TableCell sx={{ fontWeight: 700 }}>{person.name}<StaffJourneyButton person={person} /></TableCell>
                            <TableCell>{person.job}{person.dailyActivities?.map((item, index) => <Typography key={index} variant="caption" sx={{ display: 'block', whiteSpace: 'normal' }}>{item.activity} · {item.line} · {item.start?.slice(0, 5) ?? '—'}–{item.end?.slice(0, 5) ?? '—'}{item.hours !== null ? ` (${item.hours.toFixed(2)} h)` : ''}</Typography>)}</TableCell>
                            <TableCell>
                              <Chip
                                size="small"
                                title={person.reason} label={statusLabel(person)}
                                color={person.status === 'present' ? 'success' : person.status === 'absent' ? 'error' : person.status === 'pending' || person.status === 'conflict' ? 'warning' : 'default'}
                                variant="outlined"
                                sx={{ fontSize: 10 }}
                              />
                            </TableCell>
                            {groupBy === 'department' && <TableCell sx={{ fontSize: 11, color: 'text.secondary' }}>{person.plantDepartmentBasis}</TableCell>}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
              </TableContainer>
            </Box>
          );
          return <>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: 'repeat(2, minmax(0, 1fr))' }, gap: 0 }}>
              {peopleColumn('Obra', productionRows, '#eff6ff')}
              {peopleColumn('Auxiliares', auxiliaryRows, '#f0fdf4')}
              {peopleColumn('Supervisores', supervisorRows, '#fff7ed')}
            </Box>

          </>;
        })()}
      </DialogContent>
    </Dialog>
  </Stack>;
} 

function StaffHistory({ data, includedWeekdays, onDay }: { data: StaffHistoryResponse; includedWeekdays: number[]; onDay: (day: string) => void }) {
  const absenceAvailable = data.days.some(day => day.absenceDataAvailable ?? data.source !== 'STB_data');
  const selectedDays = data.days.filter(day => includedWeekdays.includes(new Date(`${day.day}T12:00:00Z`).getUTCDay()));
  const closed = selectedDays.filter(day => day.day < data.today && day.total > 0);
  const rankedDays = [...closed].sort((a, b) => b.absent - a.absent || b.day.localeCompare(a.day));
  const maxDate = rankedDays[0]?.absent ? rankedDays[0] : null;
  const weekdays = weekdayLabels.flatMap((label, index) => {
    if (!includedWeekdays.includes(index)) return [];
    const days = closed.filter(day => (day.absenceDataAvailable ?? absenceAvailable) && new Date(`${day.day}T12:00:00Z`).getUTCDay() === index);
    const attendance = days.reduce((sum, day) => sum + day.present + day.absent, 0);
    const complete = absenceAvailable && days.every(day => !day.pending && !day.conflict);
    const absenceRate = complete && attendance > 0 ? days.reduce((sum, day) => sum + day.absent, 0) / attendance * 100 : null;
    return [{ label, absenceRate, count: days.length, total: days.reduce((sum, day) => sum + day.absent, 0), average: days.length ? days.reduce((sum, day) => sum + day.absent, 0) / days.length : null }];
  });
  const rankedWeekdays = [...weekdays].sort((a, b) => (b.average ?? -1) - (a.average ?? -1));
  const topWeekday = rankedWeekdays[0]?.average ? rankedWeekdays[0] : null;
  const max = Math.max(1, ...weekdays.map(day => day.average ?? 0));
  const totalAbsences = closed.reduce((sum, day) => sum + day.absent, 0);
  return <Stack spacing={1.5}>
    {!absenceAvailable && <Alert severity="info">No hay reporte de faltas confirmado para este período. Los estados pendientes no se convierten en faltas.</Alert>}
    {!includedWeekdays.length && <Alert severity="info">Selecciona al menos un día de la semana para ver el histórico.</Alert>}
    {!!includedWeekdays.length && !closed.length && <Alert severity="info">Sin días cerrados con datos para los días seleccionados.</Alert>}
    {absenceAvailable && <>
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: 'repeat(3, minmax(0, 1fr))' }, gap: 1 }}>
      <Paper variant="outlined" sx={{ p: 1, borderRadius: 1.5 }}><Typography variant="caption" fontWeight={700}>Faltas registradas · días cerrados</Typography><Typography fontSize={23} fontWeight={800} color="error.main">{absenceAvailable && closed.length ? formatValue(totalAbsences) : '—'}</Typography><Typography variant="caption" color="text.secondary">Personas-día: una persona puede faltar en varias fechas.</Typography></Paper>
      <Paper variant="outlined" sx={{ p: 1, borderRadius: 1.5 }}><Typography variant="caption" fontWeight={700}>Fecha con más faltas</Typography><Typography fontSize={17} fontWeight={800}>{maxDate ? formatPeriodo(maxDate.day) : closed.length ? 'Sin faltas registradas' : 'Sin datos'}</Typography><Typography variant="caption" color="text.secondary">{maxDate ? `${maxDate.absent} faltas registradas` : 'En los días cerrados consultados'}</Typography></Paper>
      <Paper variant="outlined" sx={{ p: 1, borderRadius: 1.5 }}><Typography variant="caption" fontWeight={700}>Día con mayor promedio de faltas</Typography><Typography fontSize={17} fontWeight={800}>{topWeekday?.label ?? (absenceAvailable && closed.length ? 'Sin faltas registradas' : 'Sin datos')}</Typography><Typography variant="caption" color="text.secondary">{topWeekday ? `${topWeekday.average!.toLocaleString('es-HN', { maximumFractionDigits: 1 })} por fecha · ${topWeekday.count} fechas` : 'En los días cerrados consultados'}</Typography></Paper>
    </Box>
    <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2 }}><Typography fontWeight={800}>¿Qué días se registran más faltas?</Typography><Typography variant="caption" color="text.secondary">Promedio por día de semana · {formatPeriodo(data.from)} a {formatPeriodo(data.to)} · todas las divisiones</Typography>
      <Stack spacing={1} sx={{ mt: 1.5 }}>{rankedWeekdays.map(day => <Box key={day.label} sx={{ display: 'grid', gridTemplateColumns: '70px 1fr 46px 54px', gap: 1, alignItems: 'center' }}><Typography variant="caption">{day.label}</Typography><Box sx={{ bgcolor: '#fde8e8', height: 12, borderRadius: 1, overflow: 'hidden' }}><Box sx={{ height: '100%', bgcolor: 'error.main', width: `${(day.average ?? 0) / max * 100}%`, borderRadius: 1 }} /></Box><Typography variant="caption" fontWeight={800} textAlign="right">{day.average === null ? '—' : day.average.toLocaleString('es-HN', { maximumFractionDigits: 1 })}</Typography><Typography variant="caption" color="error.main" fontWeight={800} textAlign="right">{day.absenceRate === null ? '—' : `${day.absenceRate.toLocaleString('es-HN', { maximumFractionDigits: 1 })}%`}</Typography></Box>)}</Stack>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1 }}>Se muestran el promedio de faltas por fecha y el porcentaje de inasistencia: X / (A + X) de cada día de la semana.</Typography>
    </Paper>
    </>}
    <Paper variant="outlined" sx={{ borderRadius: 2, overflow: 'hidden' }}><Typography fontWeight={800} sx={{ p: 1.5 }}>Registro diario · toca una fecha para ver las salas</Typography>
      <TableContainer sx={{ maxHeight: '70vh' }}><Table size="small" stickyHeader aria-label="Histórico de asistencias e inasistencias" sx={{ ...tableSx, minWidth: 780 }}><TableHead><TableRow><TableCell>Fecha</TableCell><TableCell align="right" sx={{ color: 'success.main' }}>A · Asistieron</TableCell><TableCell align="right" sx={{ color: 'error.main' }}>X · Faltaron</TableCell><TableCell align="right">Personal</TableCell><TableCell align="right">Sin registro</TableCell><TableCell align="right">Revisar</TableCell><TableCell align="right">Tasa de faltas</TableCell></TableRow></TableHead>
        <TableBody>{[...selectedDays].reverse().map(day => <TableRow key={day.day} hover><TableCell><Button size="small" onClick={() => onDay(day.day)} sx={{ p: 0, whiteSpace: 'nowrap', fontSize: 'inherit' }}>{formatPeriodo(day.day)}</Button>{day.day === data.today && <Typography variant="caption" sx={{ display: 'block' }}>Día en curso</Typography>}{day.total === 0 && <Typography variant="caption" sx={{ display: 'block' }}>Sin datos</Typography>}</TableCell>
          <TableCell align="right">{day.total ? formatValue(day.present) : '—'}</TableCell><TableCell align="right" sx={{ color: 'error.main', fontWeight: 800 }}>{(day.absenceDataAvailable ?? absenceAvailable) && day.total ? formatValue(day.absent) : '—'}</TableCell><TableCell align="right">{day.total ? formatValue(day.total) : '—'}</TableCell><TableCell align="right" sx={{ color: day.pending ? 'warning.dark' : undefined }}>{day.total ? formatValue(day.pending) : '—'}</TableCell><TableCell align="right">{day.total ? formatValue(day.conflict) : '—'}</TableCell><TableCell align="right">{day.absenceRate === null ? '—' : `${formatValue(day.absenceRate, 'decimal')}%`}</TableCell>
        </TableRow>)}</TableBody>
      </Table></TableContainer>
    </Paper>
  </Stack>;
}

/** Personas de cada tipo de personal agrupadas por departamento de planta; cada departamento se despliega. */
function StaffKindDialog({ selection, people, onClose, absenceAvailable }: { absenceAvailable: boolean; selection: { kind: StaffKind; label: string; color: string } | null; people: StaffEmployee[]; onClose: () => void }) {
  const [status, setStatus] = useState<'all' | 'present' | 'absent'>('all');
  const [openDepartment, setOpenDepartment] = useState<string | null>(null);
  const departmentOf = (person: StaffEmployee) => person.plantDepartment ?? NO_DEPARTMENT;
  const official = PLANT_DEPARTMENT_SECTIONS.flatMap(section => section.items);
  const departments = [...new Set(people.map(departmentOf))].sort((a, b) => {
    const rank = (value: string) => { const index = official.indexOf(value); return index >= 0 ? index : value === NO_DEPARTMENT ? 10_000 : 5_000; };
    return rank(a) - rank(b) || a.localeCompare(b, 'es');
  });
  const visible = (person: StaffEmployee) => status === 'all' || (status === 'present' ? stbPresent(person) : person.status === status);
  const close = () => { onClose(); setStatus('all'); setOpenDepartment(null); };
  const totals = { ...countPeople(people), present: people.filter(stbPresent).length };
  return <Dialog open={!!selection} onClose={close} fullWidth maxWidth="md">
    <DialogTitle sx={{ px: 2, py: 1.25, borderBottom: '1px solid', borderColor: 'divider' }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1}>
        <Box>
          <Typography fontWeight={800} color={selection?.color}>{selection?.label}</Typography>
          <Typography variant="caption" color="text.secondary">{formatValue(totals.present)} asistieron · Faltas: {absenceAvailable ? formatValue(totals.absent) : 'pendientes de cierre'} · {formatValue(totals.total)} en total · toca un departamento para ver las personas</Typography>
        </Box>
        <IconButton size="small" onClick={close} aria-label="Cerrar"><CloseIcon /></IconButton>
      </Stack>
      <ToggleButtonGroup exclusive size="small" value={status} onChange={(_, value) => value && setStatus(value)} aria-label="Mostrar personas" sx={{ mt: 1, '& button': { textTransform: 'none', px: 1.1, py: 0.25, fontSize: 12 } }}>
        <ToggleButton value="all">Todos</ToggleButton><ToggleButton value="present">Asistieron</ToggleButton><ToggleButton value="absent" disabled={!absenceAvailable}>Faltaron</ToggleButton>
      </ToggleButtonGroup>
    </DialogTitle>
    <DialogContent sx={{ p: 0 }}>
      {!people.length && <Alert severity="info" sx={{ m: 2 }}>Sin personas de este tipo para la fecha y filtros seleccionados.</Alert>}
      {!!people.length && <TableContainer sx={{ maxHeight: '65vh' }}><Table size="small" stickyHeader aria-label="Personas por departamento" sx={{ ...tableSx, '& td:first-of-type': { position: 'static', boxShadow: 'none' }, '& thead th:first-of-type': { boxShadow: 'none' } }}>
        <TableHead><TableRow><TableCell>Departamento</TableCell><TableCell align="right" sx={{ color: 'success.main' }}>Asistieron</TableCell><TableCell align="right" sx={{ color: 'error.main' }}>Faltaron</TableCell><TableCell align="right">Personal total</TableCell></TableRow></TableHead>
        <TableBody>{departments.map(department => {
          const rows = people.filter(person => departmentOf(person) === department);
          const group = { ...countPeople(rows), present: rows.filter(stbPresent).length };
          const listed = rows.filter(visible).sort((a, b) => a.name.localeCompare(b.name, 'es'));
          const expanded = openDepartment === department;
          if (status !== 'all' && !listed.length) return null;
          return <Fragment key={department}>
            <TableRow hover onClick={() => setOpenDepartment(expanded ? null : department)} sx={{ cursor: 'pointer', '& td': { fontWeight: 700 } }} aria-expanded={expanded}>
              <TableCell><Stack direction="row" alignItems="center" gap={0.5}><Box component="span" sx={{ display: 'inline-block', width: 14, color: 'text.secondary', transition: 'transform 150ms', transform: expanded ? 'rotate(90deg)' : 'none' }}>›</Box>{department}</Stack></TableCell>
              <TableCell align="right" sx={{ color: 'success.main' }}>{formatValue(group.present)}</TableCell>
              <TableCell align="right" sx={{ color: 'error.main' }}>{absenceAvailable ? formatValue(group.absent) : '—'}</TableCell>
              <TableCell align="right">{formatValue(group.total)}</TableCell>
            </TableRow>
            {expanded && <TableRow><TableCell colSpan={4} sx={{ p: '0 !important', bgcolor: '#f8fafc !important' }}>
              <Table size="small" aria-label={`Personas de ${department}`} sx={staffDetailTableSx}>
                <colgroup><col style={{ width: '40%' }} /><col style={{ width: '38%' }} /><col style={{ width: '22%' }} /></colgroup>
                <TableHead><TableRow><TableCell sx={{ fontWeight: 800 }}>Nombre</TableCell><TableCell sx={{ fontWeight: 800 }}>Puesto</TableCell><TableCell sx={{ fontWeight: 800 }}>Estado</TableCell></TableRow></TableHead>
                <TableBody>{listed.map(person => <TableRow key={person.id}>
                  <TableCell sx={{ fontWeight: 700 }}>{person.name}<StaffJourneyButton person={person} /></TableCell>
                  <TableCell>{person.job}{person.dailyActivities?.map((item, index) => <Typography key={index} variant="caption" sx={{ display: 'block', whiteSpace: 'normal' }}>{item.activity} · {item.line} · {item.start?.slice(0, 5) ?? '—'}–{item.end?.slice(0, 5) ?? '—'}{item.hours !== null ? ` (${item.hours.toFixed(2)} h)` : ''}</Typography>)}</TableCell>
                  <TableCell><Chip size="small" variant="outlined" title={person.reason} label={statusLabel(person)} color={person.status === 'present' ? 'success' : person.status === 'absent' ? 'error' : person.status === 'pending' || person.status === 'conflict' ? 'warning' : 'default'} sx={{ fontSize: 10 }} /></TableCell>
                </TableRow>)}</TableBody>
              </Table>
            </TableCell></TableRow>}
          </Fragment>;
        })}</TableBody>
      </Table></TableContainer>}
    </DialogContent>
  </Dialog>;
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
