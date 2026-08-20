import { DragEvent, useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert, Autocomplete, Box, Button, Checkbox, Chip, CircularProgress, IconButton, Paper,
  Popover, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField,
  Tooltip, Typography,
} from '@mui/material';
import FilterListIcon from '@mui/icons-material/FilterList';
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import RefreshOutlinedIcon from '@mui/icons-material/RefreshOutlined';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import { apiClient } from '../api/client';

const DIMENSIONS = {
  nombreCliente: 'Nombre cliente', noOrdenCompra: 'N.º orden compra', codigoExterno: 'Código externo',
  fechaProduccion: 'Fecha producción', codigoItem: 'Código item', estiloFinal: 'Estilo final',
  nombreItem: 'Nombre item', marca: 'Marca', talla: 'Talla', empaque: 'Empaque',
  tipoItem: 'Tipo item', disponibilidad: 'Disponibilidad',
} as const;
type Dimension = keyof typeof DIMENSIONS;
type InventoryItem = Record<Dimension, string> & { pesoKilos: number; cantidadSerial: number };
type Filters = Partial<Record<Dimension, string[]>>;
type AggregateRow = Record<Dimension, string> & { pesoKilos: number; cantidadSerial: number };

const DEFAULT_ROWS: Dimension[] = ['nombreCliente', 'estiloFinal', 'nombreItem'];
const DEFAULT_FILTERS: Filters = {
  nombreCliente: ['FRANCIA DP 2026 FRESCO', 'LFF UK 2026 FRESCO'],
};
const PREFERENCES_KEY = 'inventory-preferences';
const formatKilos = (value: number) => value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const formatSerials = (value: number) => value.toLocaleString('en-US', { maximumFractionDigits: 0 });

function aggregate(items: InventoryItem[], fields: Dimension[]): AggregateRow[] {
  const groups = new Map<string, AggregateRow>();
  for (const item of items) {
    const key = fields.map((field) => item[field]).join('\u0000');
    const current = groups.get(key);
    if (current) {
      current.pesoKilos += item.pesoKilos;
      current.cantidadSerial += item.cantidadSerial;
    } else {
      const row = { pesoKilos: item.pesoKilos, cantidadSerial: item.cantidadSerial } as AggregateRow;
      for (const field of Object.keys(DIMENSIONS) as Dimension[]) row[field] = fields.includes(field) ? item[field] : '';
      groups.set(key, row);
    }
  }
  return Array.from(groups.values()).sort((a, b) => fields.map((field) => a[field]).join('|').localeCompare(fields.map((field) => b[field]).join('|')));
}

function readPreferences(userId: string): { rowFields: Dimension[]; filters: Filters } {
  try {
    const parsed = JSON.parse(localStorage.getItem(`${PREFERENCES_KEY}:${userId}`) ?? '{}') as {
      rowFields?: unknown;
      filters?: unknown;
    };
    const rowFields = Array.isArray(parsed.rowFields)
      ? parsed.rowFields.filter((field): field is Dimension => typeof field === 'string' && field in DIMENSIONS)
      : [];
    const filters: Filters = {};
    if (parsed.filters && typeof parsed.filters === 'object') {
      for (const [field, values] of Object.entries(parsed.filters)) {
        if (field in DIMENSIONS && Array.isArray(values)) {
          filters[field as Dimension] = values.filter((value): value is string => typeof value === 'string');
        }
      }
    }
    const hasActiveFilters = Object.values(filters).some((values) => (values?.length ?? 0) > 0);
    return {
      rowFields: rowFields.length > 0 ? rowFields : DEFAULT_ROWS,
      filters: hasActiveFilters ? filters : DEFAULT_FILTERS,
    };
  } catch {
    return { rowFields: DEFAULT_ROWS, filters: DEFAULT_FILTERS };
  }
}

export default function InventoryPage({ userId }: { userId: string }) {
  const savedPreferences = useMemo(() => readPreferences(userId), [userId]);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [rowFields, setRowFields] = useState<Dimension[]>(savedPreferences.rowFields);
  const [filters, setFilters] = useState<Filters>(savedPreferences.filters);
  const [filterField, setFilterField] = useState<Dimension | null>(null);
  const [filterAnchor, setFilterAnchor] = useState<HTMLElement | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const { data } = await apiClient.get<{ items: InventoryItem[] }>('/inventory');
      setItems(data.items);
    } catch { setError('No se pudo cargar el inventario. Intenta nuevamente.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  useEffect(() => {
    try {
      localStorage.setItem(`${PREFERENCES_KEY}:${userId}`, JSON.stringify({ rowFields, filters }));
    } catch {
      // El almacenamiento puede estar bloqueado o lleno; la tabla continúa funcionando en la sesión actual.
    }
  }, [filters, rowFields, userId]);

  const availableFields = (Object.keys(DIMENSIONS) as Dimension[]).filter((field) => !rowFields.includes(field));
  const filteredItems = useMemo(() => items.filter((item) =>
    (Object.entries(filters) as [Dimension, string[]][]).every(([field, values]) => !values?.length || values.includes(item[field])),
  ), [items, filters]);
  const rows = useMemo(() => aggregate(filteredItems, rowFields), [filteredItems, rowFields]);
  const clientSections = useMemo(() => {
    if (!rowFields.includes('nombreCliente')) return [{ client: '', rows, pesoKilos: 0, cantidadSerial: 0 }];
    const sections = new Map<string, AggregateRow[]>();
    for (const row of rows) {
      const clientRows = sections.get(row.nombreCliente) ?? [];
      clientRows.push(row);
      sections.set(row.nombreCliente, clientRows);
    }
    return Array.from(sections, ([client, clientRows]) => ({
      client,
      rows: clientRows,
      pesoKilos: clientRows.reduce((sum, row) => sum + row.pesoKilos, 0),
      cantidadSerial: clientRows.reduce((sum, row) => sum + row.cantidadSerial, 0),
    })).sort((a, b) => a.client.localeCompare(b.client));
  }, [rows, rowFields]);
  const totalPeso = filteredItems.reduce((sum, item) => sum + item.pesoKilos, 0);
  const totalSerial = filteredItems.reduce((sum, item) => sum + item.cantidadSerial, 0);
  const filterOptions = useMemo(() => filterField
    ? Array.from(new Set(items.map((item) => item[filterField]))).sort((a, b) => a.localeCompare(b))
    : [], [items, filterField]);

  const startDrag = (event: DragEvent, field: Dimension) => event.dataTransfer.setData('text/plain', field);
  const dropField = (event: DragEvent, index?: number) => {
    event.preventDefault();
    const field = event.dataTransfer.getData('text/plain') as Dimension;
    if (!(field in DIMENSIONS)) return;
    setRowFields((current) => {
      const next = current.filter((item) => item !== field);
      next.splice(index ?? next.length, 0, field);
      return next;
    });
  };
  const openFilter = (event: React.MouseEvent<HTMLElement>, field: Dimension) => {
    setFilterField(field); setFilterAnchor(event.currentTarget);
  };

  return (
    <Stack sx={{ height: '100%', minHeight: 0, py: 1 }} spacing={1.25}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" gap={2} flexWrap="wrap">
        <Box><Typography variant="h5" fontWeight={800}>Inventario</Typography><Typography color="text.secondary">Organiza, agrupa y filtra el producto disponible.</Typography></Box>
        <Button variant="outlined" startIcon={<RefreshOutlinedIcon />} onClick={() => void load()} disabled={loading}>Actualizar</Button>
      </Stack>

      <Paper elevation={0} sx={{ border: 1, borderColor: 'divider', p: 1.25 }}>
        <Stack spacing={1}>
          <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap" useFlexGap>
            <Typography variant="caption" fontWeight={800} color="text.secondary" sx={{ width: 110 }}>CAMPOS</Typography>
            {availableFields.map((field) => (
              <Chip key={field} draggable onDragStart={(event) => startDrag(event, field)} icon={<DragIndicatorIcon />} label={DIMENSIONS[field]} size="small" variant="outlined" />
            ))}
          </Stack>
          <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap" useFlexGap onDragOver={(e) => e.preventDefault()} onDrop={(e) => dropField(e)} sx={{ minHeight: 38, p: 0.75, bgcolor: 'action.hover', border: '1px dashed', borderColor: 'divider', borderRadius: 1 }}>
            <Typography variant="caption" fontWeight={800} color="text.secondary" sx={{ width: 102 }}>FILAS</Typography>
            {rowFields.map((field, index) => (
              <Chip key={field} draggable onDragStart={(event) => startDrag(event, field)} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.stopPropagation(); dropField(e, index); }} onDelete={() => rowFields.length > 1 && setRowFields((current) => current.filter((item) => item !== field))} icon={<DragIndicatorIcon />} label={DIMENSIONS[field]} size="small" color="primary" variant="outlined" />
            ))}
            <Typography variant="caption" color="text.secondary">Arrastra campos aquí para incluirlos y reordenarlos</Typography>
          </Stack>
        </Stack>
      </Paper>

      {error && <Alert severity="error" action={<Button color="inherit" onClick={() => void load()}>Reintentar</Button>}>{error}</Alert>}

      <Popover open={Boolean(filterAnchor)} anchorEl={filterAnchor} onClose={() => setFilterAnchor(null)} anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}>
        {filterField && <Stack spacing={1.25} sx={{ width: 400, maxWidth: 'calc(100vw - 32px)', p: 1.5 }}>
          <Typography variant="subtitle2" fontWeight={800}>Filtrar: {DIMENSIONS[filterField]}</Typography>
          <Autocomplete multiple disableCloseOnSelect options={filterOptions} value={filters[filterField] ?? []} onChange={(_e, value) => setFilters((current) => ({ ...current, [filterField]: value }))} renderOption={(props, option, { selected }) => <li {...props}><Checkbox size="small" checked={selected} sx={{ mr: 1, p: .25 }} />{option}</li>} renderInput={(params) => <TextField {...params} size="small" placeholder="Buscar valores" autoFocus />} />
          <Stack direction="row" justifyContent="space-between" alignItems="center"><Typography variant="caption" color="text.secondary">{(filters[filterField]?.length ?? 0) || 'Todos los valores'}</Typography>{(filters[filterField]?.length ?? 0) > 0 && <Button size="small" onClick={() => setFilters((current) => ({ ...current, [filterField]: [] }))}>Limpiar</Button>}</Stack>
        </Stack>}
      </Popover>

      <TableContainer component={Paper} elevation={0} sx={{ border: 1, borderColor: 'divider', flex: 1 }}>
        {loading ? <Box sx={{ minHeight: 280, display: 'grid', placeItems: 'center' }}><CircularProgress /></Box> : rows.length === 0 ? <Stack sx={{ minHeight: 280 }} alignItems="center" justifyContent="center" spacing={1} color="text.secondary"><Inventory2OutlinedIcon sx={{ fontSize: 42 }} /><Typography>No hay resultados para los filtros seleccionados.</Typography></Stack> :
          <Table stickyHeader size="small" sx={{ borderCollapse: 'separate', borderSpacing: 0, '& th, & td': { borderRight: '1px solid', borderRightColor: 'divider', borderBottom: '1px solid', borderBottomColor: 'divider' }, '& th:last-child, & td:last-child': { borderRight: 0 } }}><TableHead><TableRow>
            {rowFields.map((field) => <TableCell key={field} sx={{ minWidth: 160, fontWeight: 800 }}><Stack direction="row" alignItems="center" spacing={.25}><span>{DIMENSIONS[field]}</span><Tooltip title="Filtrar"><IconButton size="small" color={(filters[field]?.length ?? 0) > 0 ? 'primary' : 'default'} onClick={(e) => openFilter(e, field)} sx={{ p: .4 }}><FilterListIcon sx={{ fontSize: 17 }} /></IconButton></Tooltip></Stack></TableCell>)}
            <TableCell align="right" sx={{ minWidth: 120, fontWeight: 800 }}>Peso kilos</TableCell><TableCell align="right" sx={{ minWidth: 120, fontWeight: 800 }}>Cantidad serial</TableCell>
          </TableRow></TableHead><TableBody>
            {clientSections.flatMap((section) => [
              ...section.rows.map((row, index) => <TableRow key={`${section.client}-${rowFields.map((field) => row[field]).join('|')}-${index}`} hover>{rowFields.map((field) => <TableCell key={field}>{row[field]}</TableCell>)}<TableCell align="right">{formatKilos(row.pesoKilos)}</TableCell><TableCell align="right">{formatSerials(row.cantidadSerial)}</TableCell></TableRow>),
              section.client && <TableRow key={`subtotal-${section.client}`} sx={{ bgcolor: 'rgba(22, 74, 139, 0.07)', '& td': { fontWeight: 800, borderTop: '2px solid', borderBottom: '2px solid', borderColor: 'primary.main', textDecoration: 'underline', textUnderlineOffset: '3px' } }}><TableCell colSpan={rowFields.length}>Subtotal {section.client}</TableCell><TableCell align="right">{formatKilos(section.pesoKilos)}</TableCell><TableCell align="right">{formatSerials(section.cantidadSerial)}</TableCell></TableRow>,
            ])}
            <TableRow sx={{ bgcolor: 'primary.main', '& td': { color: 'primary.contrastText', fontWeight: 800, borderTop: '3px double', borderBottom: '3px double', borderColor: 'primary.contrastText', textDecoration: 'underline', textUnderlineOffset: '3px' } }}><TableCell colSpan={rowFields.length}>Gran total</TableCell><TableCell align="right">{formatKilos(totalPeso)}</TableCell><TableCell align="right">{formatSerials(totalSerial)}</TableCell></TableRow>
          </TableBody></Table>}
      </TableContainer>
    </Stack>
  );
}
