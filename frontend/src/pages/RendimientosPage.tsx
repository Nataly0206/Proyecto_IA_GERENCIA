import { DragEvent, useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert, Autocomplete, Box, Button, Checkbox, Chip, CircularProgress, Collapse, IconButton,
  InputAdornment, Paper, Popover, Stack, Table, TableBody, TableCell, TableContainer, TableHead,
  TableRow, TableSortLabel, TextField, Tooltip, Typography,
} from '@mui/material';
import FilterListIcon from '@mui/icons-material/FilterList';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import RefreshOutlinedIcon from '@mui/icons-material/RefreshOutlined';
import SearchIcon from '@mui/icons-material/Search';
import TrendingUpOutlinedIcon from '@mui/icons-material/TrendingUpOutlined';
import dayjs from 'dayjs';
import { apiClient } from '../api/client';
import ProcessFilters from '../components/filters/ProcessFilters';
import { useFilters } from '../context/FiltersContext';
import { getDateFilterError } from '../utils/dateFilters';

const COLUMNS = {
  fechaDescongelado: { label: 'Fecha descongelado', kind: 'date' },
  tipoEstilo: { label: 'Tipo estilo', kind: 'text' },
  salida: { label: 'Salida', kind: 'text' },
  totalLibrasDescongeladas: { label: 'Total libras descongeladas', kind: 'number' },
  librasProgramaProducidas: { label: 'Libras programa producidas', kind: 'number' },
  promedioPrograma: { label: 'Promedio programa', kind: 'percent' },
  librasRechazoProducidas: { label: 'Libras rechazo producidas', kind: 'number' },
  promedioRechazo: { label: 'Promedio rechazo', kind: 'percent' },
  totalLibrasProducidas: { label: 'Total libras producidas', kind: 'number' },
  promedioGeneral: { label: 'Promedio general', kind: 'percent' },
} as const;

type Column = keyof typeof COLUMNS;
type Row = {
  fechaDescongelado: string;
  tipoEstilo: string;
  salida: string;
  totalLibrasDescongeladas: number;
  librasProgramaProducidas: number;
  promedioPrograma: number;
  librasRechazoProducidas: number;
  promedioRechazo: number;
  totalLibrasProducidas: number;
  promedioGeneral: number;
};
type ValueFilters = Partial<Record<Column, string[]>>;
type RangeFilters = Partial<Record<Column, { min: string; max: string }>>;
type Preferences = { columns: Column[]; valueFilters: ValueFilters; rangeFilters: RangeFilters };

const ALL_COLUMNS = Object.keys(COLUMNS) as Column[];
const DEFAULT_PREFERENCES: Preferences = { columns: ALL_COLUMNS, valueFilters: {}, rangeFilters: {} };
const formatNumber = (value: number) => value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const formatPercent = (value: number) => value.toLocaleString('en-US', { style: 'percent', minimumFractionDigits: 2, maximumFractionDigits: 2 });

function normalizePreferences(value: unknown): Preferences {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return DEFAULT_PREFERENCES;
  const input = value as Partial<Preferences>;
  const columns = Array.isArray(input.columns)
    ? input.columns.filter((column): column is Column => typeof column === 'string' && column in COLUMNS)
    : [];
  return {
    columns: columns.length ? Array.from(new Set(columns)) : ALL_COLUMNS,
    valueFilters: input.valueFilters && typeof input.valueFilters === 'object' ? input.valueFilters : {},
    rangeFilters: input.rangeFilters && typeof input.rangeFilters === 'object' ? input.rangeFilters : {},
  };
}

function displayValue(row: Row, column: Column): string {
  const value = row[column];
  if (column === 'fechaDescongelado') return dayjs(String(value)).format('DD-MMM-YYYY');
  if (COLUMNS[column].kind === 'percent') return formatPercent(Number(value));
  if (COLUMNS[column].kind === 'number') return formatNumber(Number(value));
  return String(value);
}

function summarizeRows(rows: Row[]): Row {
  const totalLibrasDescongeladas = rows.reduce((sum, row) => sum + row.totalLibrasDescongeladas, 0);
  const librasProgramaProducidas = rows.reduce((sum, row) => sum + row.librasProgramaProducidas, 0);
  const librasRechazoProducidas = rows.reduce((sum, row) => sum + row.librasRechazoProducidas, 0);
  const totalLibrasProducidas = librasProgramaProducidas + librasRechazoProducidas;
  return {
    fechaDescongelado: 'Gran total', tipoEstilo: '', salida: '', totalLibrasDescongeladas,
    librasProgramaProducidas, promedioPrograma: totalLibrasDescongeladas ? librasProgramaProducidas / totalLibrasDescongeladas : 0,
    librasRechazoProducidas, promedioRechazo: totalLibrasDescongeladas ? librasRechazoProducidas / totalLibrasDescongeladas : 0,
    totalLibrasProducidas, promedioGeneral: totalLibrasDescongeladas ? totalLibrasProducidas / totalLibrasDescongeladas : 0,
  };
}

export default function RendimientosPage({ userId }: { userId: string }) {
  const { filters } = useFilters();
  const [rows, setRows] = useState<Row[]>([]);
  const [todayRows, setTodayRows] = useState<Row[]>([]);
  const [columns, setColumns] = useState<Column[]>(ALL_COLUMNS);
  const [valueFilters, setValueFilters] = useState<ValueFilters>({});
  const [rangeFilters, setRangeFilters] = useState<RangeFilters>({});
  const [filterColumn, setFilterColumn] = useState<Column | null>(null);
  const [filterAnchor, setFilterAnchor] = useState<HTMLElement | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<{ column: Column; direction: 'asc' | 'desc' }>({ column: 'fechaDescongelado', direction: 'asc' });
  const [loading, setLoading] = useState(false);
  const [todayLoading, setTodayLoading] = useState(false);
  const [lastTodayUpdate, setLastTodayUpdate] = useState<Date | null>(null);
  const [error, setError] = useState('');
  const [preferencesReady, setPreferencesReady] = useState(false);
  const dateError = getDateFilterError(filters);

  const load = useCallback(async () => {
    if (dateError) return;
    setLoading(true); setError('');
    try {
      const { data } = await apiClient.get<{ rows: Row[] }>('/rendimientos', {
        params: { fechaInicial: filters.fechaInicial, fechaFinal: filters.fechaFinal },
      });
      setRows(data.rows);
    } catch {
      setError('No se pudo cargar el reporte de rendimientos. Intenta nuevamente.');
    } finally { setLoading(false); }
  }, [dateError, filters.fechaFinal, filters.fechaInicial]);

  const loadToday = useCallback(async () => {
    const today = dayjs().format('YYYY-MM-DD');
    setTodayLoading(true);
    try {
      const { data } = await apiClient.get<{ rows: Row[] }>('/rendimientos', {
        params: { fechaInicial: today, fechaFinal: today },
      });
      setTodayRows(data.rows);
      setLastTodayUpdate(new Date());
    } catch {
      // Conserva la última lectura correcta si una actualización automática falla.
    } finally { setTodayLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    void loadToday();
    const interval = window.setInterval(() => { void loadToday(); }, 60_000);
    return () => window.clearInterval(interval);
  }, [loadToday]);
  useEffect(() => {
    let active = true;
    apiClient.get<{ preferences: Preferences | null }>('/rendimientos/preferences')
      .then(({ data }) => {
        if (!active) return;
        const preferences = normalizePreferences(data.preferences);
        setColumns(preferences.columns); setValueFilters(preferences.valueFilters); setRangeFilters(preferences.rangeFilters);
      })
      .finally(() => { if (active) setPreferencesReady(true); });
    return () => { active = false; };
  }, [userId]);
  useEffect(() => {
    if (!preferencesReady) return;
    const timer = window.setTimeout(() => {
      void apiClient.put('/rendimientos/preferences', { columns, valueFilters, rangeFilters }).catch(() => undefined);
    }, 350);
    return () => window.clearTimeout(timer);
  }, [columns, preferencesReady, rangeFilters, valueFilters]);

  const availableColumns = ALL_COLUMNS.filter((column) => !columns.includes(column));
  const filterOptions = useMemo(() => filterColumn && !['number', 'percent'].includes(COLUMNS[filterColumn].kind)
    ? Array.from(new Set(rows.map((row) => String(row[filterColumn])))).sort((a, b) => a.localeCompare(b))
    : [], [filterColumn, rows]);
  const filteredRows = useMemo(() => rows.filter((row) => {
    const needle = search.trim().toLocaleLowerCase();
    if (needle && !ALL_COLUMNS.some((column) => displayValue(row, column).toLocaleLowerCase().includes(needle))) return false;
    for (const [column, values] of Object.entries(valueFilters) as [Column, string[]][]) {
      if (values?.length && !values.includes(String(row[column]))) return false;
    }
    for (const [column, range] of Object.entries(rangeFilters) as [Column, { min: string; max: string }][]) {
      const value = Number(row[column]);
      if (range?.min !== '' && Number.isFinite(Number(range.min)) && value < Number(range.min)) return false;
      if (range?.max !== '' && Number.isFinite(Number(range.max)) && value > Number(range.max)) return false;
    }
    return true;
  }).sort((a, b) => {
    const left = a[sort.column]; const right = b[sort.column];
    const comparison = typeof left === 'number' && typeof right === 'number'
      ? left - right : String(left).localeCompare(String(right));
    return sort.direction === 'asc' ? comparison : -comparison;
  }), [rangeFilters, rows, search, sort, valueFilters]);

  const totals = useMemo(() => summarizeRows(filteredRows), [filteredRows]);
  const todayTotals = useMemo(() => summarizeRows(todayRows), [todayRows]);

  const startDrag = (event: DragEvent, column: Column) => event.dataTransfer.setData('text/plain', column);
  const dropColumn = (event: DragEvent, index?: number) => {
    event.preventDefault();
    const column = event.dataTransfer.getData('text/plain') as Column;
    if (!(column in COLUMNS)) return;
    setColumns((current) => {
      const next = current.filter((item) => item !== column);
      next.splice(index ?? next.length, 0, column);
      return next;
    });
  };
  const openFilter = (event: React.MouseEvent<HTMLElement>, column: Column) => {
    setFilterColumn(column); setFilterAnchor(event.currentTarget);
  };
  const changeSort = (column: Column) => setSort((current) => ({
    column,
    direction: current.column === column && current.direction === 'asc' ? 'desc' : 'asc',
  }));
  const isNumericFilter = filterColumn && ['number', 'percent'].includes(COLUMNS[filterColumn].kind);

  return (
    <Stack sx={{ height: '100%', minHeight: 0, py: 1 }} spacing={1.25}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" gap={2} flexWrap="wrap">
        <Box><Typography variant="h5" fontWeight={800}>Rendimientos</Typography><Typography color="text.secondary">Rendimientos diarios de producción, configurables y filtrables.</Typography></Box>
        <Button variant="outlined" startIcon={<RefreshOutlinedIcon />} onClick={() => { void load(); void loadToday(); }} disabled={loading || todayLoading || Boolean(dateError)}>Actualizar</Button>
      </Stack>

      <ProcessFilters
        title="Filtros del reporte"
        subtitle="Ajusta el período de la tabla de rendimientos"
        hideTurno
        hideChartValues
        hint="Las tarjetas de hoy son independientes de este rango; los filtros se aplican solamente a la tabla."
      />

      <Box>
        <Stack direction="row" alignItems="baseline" justifyContent="space-between" sx={{ mb: .75 }}>
          <Typography variant="subtitle2" fontWeight={800}>Resumen de hoy</Typography>
          <Typography variant="caption" color="text.secondary">
            {todayLoading ? 'Actualizando…' : lastTodayUpdate ? `Actualizado ${dayjs(lastTodayUpdate).format('HH:mm:ss')}` : 'Sin actualizar'}
          </Typography>
        </Stack>
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', md: 'repeat(5, minmax(0, 1fr))' }, gap: 1 }}>
          {[
            { label: 'Libras descongeladas', value: formatNumber(todayTotals.totalLibrasDescongeladas) },
            { label: 'Programa producido', value: formatNumber(todayTotals.librasProgramaProducidas) },
            { label: 'Rechazo producido', value: formatNumber(todayTotals.librasRechazoProducidas) },
            { label: 'Total producido', value: formatNumber(todayTotals.totalLibrasProducidas) },
            { label: 'Rendimiento general', value: formatPercent(todayTotals.promedioGeneral) },
          ].map((card) => (
            <Paper key={card.label} elevation={0} sx={{ minWidth: 0, border: 1, borderColor: 'divider', p: 1.25 }}>
              <Typography variant="caption" color="text.secondary" fontWeight={700}>{card.label}</Typography>
              <Typography variant="h6" fontWeight={800} noWrap sx={{ mt: .25 }}>{todayLoading && !lastTodayUpdate ? '—' : card.value}</Typography>
            </Paper>
          ))}
        </Box>
      </Box>

      <Paper elevation={0} sx={{ border: 1, borderColor: 'divider', p: 1.25 }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1}>
          <TextField size="small" placeholder="Buscar en todos los datos" value={search} onChange={(event) => setSearch(event.target.value)} sx={{ width: { xs: '100%', sm: 360 } }} InputProps={{ startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment> }} />
          <Tooltip title={filtersOpen ? 'Ocultar configuración' : 'Configurar columnas'}><IconButton size="small" onClick={() => setFiltersOpen((open) => !open)}>{filtersOpen ? <ExpandLessIcon /> : <ExpandMoreIcon />}</IconButton></Tooltip>
        </Stack>
        <Collapse in={filtersOpen}>
          <Stack spacing={1} sx={{ pt: 1 }}>
            <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap" useFlexGap>
              <Typography variant="caption" fontWeight={800} color="text.secondary" sx={{ width: 110 }}>DISPONIBLES</Typography>
              {availableColumns.map((column) => <Chip key={column} draggable onDragStart={(event) => startDrag(event, column)} icon={<DragIndicatorIcon />} label={COLUMNS[column].label} size="small" variant="outlined" onClick={() => setColumns((current) => [...current, column])} />)}
            </Stack>
            <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap" useFlexGap onDragOver={(event) => event.preventDefault()} onDrop={(event) => dropColumn(event)} sx={{ minHeight: 38, p: .75, bgcolor: 'action.hover', border: '1px dashed', borderColor: 'divider', borderRadius: 1 }}>
              <Typography variant="caption" fontWeight={800} color="text.secondary" sx={{ width: 102 }}>COLUMNAS</Typography>
              {columns.map((column, index) => <Chip key={column} draggable onDragStart={(event) => startDrag(event, column)} onDragOver={(event) => event.preventDefault()} onDrop={(event) => { event.stopPropagation(); dropColumn(event, index); }} onDelete={() => columns.length > 1 && setColumns((current) => current.filter((item) => item !== column))} icon={<DragIndicatorIcon />} label={COLUMNS[column].label} size="small" color="primary" variant="outlined" />)}
            </Stack>
          </Stack>
        </Collapse>
      </Paper>

      {dateError && <Alert severity="warning">{dateError}</Alert>}
      {error && <Alert severity="error" action={<Button color="inherit" onClick={() => void load()}>Reintentar</Button>}>{error}</Alert>}

      <Popover open={Boolean(filterAnchor)} anchorEl={filterAnchor} onClose={() => setFilterAnchor(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}>
        {filterColumn && <Stack spacing={1.25} sx={{ width: 400, maxWidth: 'calc(100vw - 32px)', p: 1.5 }}>
          <Typography variant="subtitle2" fontWeight={800}>Filtrar: {COLUMNS[filterColumn].label}</Typography>
          {isNumericFilter ? <Stack direction="row" spacing={1}><TextField type="number" size="small" label={COLUMNS[filterColumn].kind === 'percent' ? 'Mínimo (decimal)' : 'Mínimo'} value={rangeFilters[filterColumn]?.min ?? ''} onChange={(event) => setRangeFilters((current) => ({ ...current, [filterColumn]: { min: event.target.value, max: current[filterColumn]?.max ?? '' } }))} /><TextField type="number" size="small" label={COLUMNS[filterColumn].kind === 'percent' ? 'Máximo (decimal)' : 'Máximo'} value={rangeFilters[filterColumn]?.max ?? ''} onChange={(event) => setRangeFilters((current) => ({ ...current, [filterColumn]: { min: current[filterColumn]?.min ?? '', max: event.target.value } }))} /></Stack>
            : <Autocomplete multiple disableCloseOnSelect options={filterOptions} value={valueFilters[filterColumn] ?? []} onChange={(_event, value) => setValueFilters((current) => ({ ...current, [filterColumn]: value }))} renderOption={(props, option, { selected }) => <li {...props}><Checkbox size="small" checked={selected} sx={{ mr: 1, p: .25 }} />{filterColumn === 'fechaDescongelado' ? dayjs(option).format('DD-MMM-YYYY') : option}</li>} renderInput={(params) => <TextField {...params} size="small" placeholder="Buscar valores" autoFocus />} />}
          <Button size="small" onClick={() => { setValueFilters((current) => ({ ...current, [filterColumn]: [] })); setRangeFilters((current) => ({ ...current, [filterColumn]: { min: '', max: '' } })); }}>Limpiar filtro</Button>
        </Stack>}
      </Popover>

      <TableContainer component={Paper} elevation={0} sx={{ border: 1, borderColor: 'divider', flex: 1 }}>
        {loading ? <Box sx={{ minHeight: 280, display: 'grid', placeItems: 'center' }}><CircularProgress /></Box> : filteredRows.length === 0 ? <Stack sx={{ minHeight: 280 }} alignItems="center" justifyContent="center" spacing={1} color="text.secondary"><TrendingUpOutlinedIcon sx={{ fontSize: 42 }} /><Typography>No hay rendimientos para el rango y filtros seleccionados.</Typography></Stack> :
          <Table stickyHeader size="small" sx={{ minWidth: columns.length * 150, '& th, & td': { borderRight: '1px solid', borderRightColor: 'divider' }, '& th:last-child, & td:last-child': { borderRight: 0 } }}>
            <TableHead><TableRow>{columns.map((column) => <TableCell key={column} align={['text', 'date'].includes(COLUMNS[column].kind) ? 'left' : 'right'} sx={{ minWidth: 150, fontWeight: 800 }}><Stack direction="row" alignItems="center" justifyContent={['text', 'date'].includes(COLUMNS[column].kind) ? 'flex-start' : 'flex-end'} spacing={.25}><TableSortLabel active={sort.column === column} direction={sort.column === column ? sort.direction : 'asc'} onClick={() => changeSort(column)}>{COLUMNS[column].label}</TableSortLabel><Tooltip title="Filtrar"><IconButton size="small" color={(valueFilters[column]?.length ?? 0) > 0 || Boolean(rangeFilters[column]?.min || rangeFilters[column]?.max) ? 'primary' : 'default'} onClick={(event) => openFilter(event, column)} sx={{ p: .4 }}><FilterListIcon sx={{ fontSize: 17 }} /></IconButton></Tooltip></Stack></TableCell>)}</TableRow></TableHead>
            <TableBody>
              {filteredRows.map((row, index) => <TableRow key={`${row.fechaDescongelado}-${row.tipoEstilo}-${row.salida}-${index}`} hover>{columns.map((column) => <TableCell key={column} align={['text', 'date'].includes(COLUMNS[column].kind) ? 'left' : 'right'}>{displayValue(row, column)}</TableCell>)}</TableRow>)}
              <TableRow sx={{ position: 'sticky', bottom: 0, bgcolor: 'primary.main', '& td': { color: 'primary.contrastText', fontWeight: 800, borderTop: '3px double', borderColor: 'primary.contrastText' } }}>{columns.map((column, index) => <TableCell key={column} align={['text', 'date'].includes(COLUMNS[column].kind) ? 'left' : 'right'}>{index === 0 ? 'Gran total' : typeof totals[column] === 'number' ? displayValue(totals, column) : ''}</TableCell>)}</TableRow>
            </TableBody>
          </Table>}
      </TableContainer>
      <Typography variant="caption" color="text.secondary">{filteredRows.length.toLocaleString('es-HN')} filas visibles de {rows.length.toLocaleString('es-HN')}</Typography>
    </Stack>
  );
}
