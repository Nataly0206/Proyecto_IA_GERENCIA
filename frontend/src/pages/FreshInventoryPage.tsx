import { ReactNode, useMemo, useState } from 'react';
import {
  Alert, Box, Button, Card, Chip, Dialog, DialogContent, DialogTitle, IconButton,
  Skeleton, Stack, Table, TableBody, TableCell, TableContainer, TableHead,
  TableRow, ToggleButton, ToggleButtonGroup, Typography,
} from '@mui/material';
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import MoveToInboxOutlinedIcon from '@mui/icons-material/MoveToInboxOutlined';
import SetMealOutlinedIcon from '@mui/icons-material/SetMealOutlined';
import CategoryOutlinedIcon from '@mui/icons-material/CategoryOutlined';
import ContentCutOutlinedIcon from '@mui/icons-material/ContentCutOutlined';
import RefreshOutlinedIcon from '@mui/icons-material/RefreshOutlined';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import CloseOutlinedIcon from '@mui/icons-material/CloseOutlined';
import WidgetDataTable, { WidgetColumn } from '../components/charts/WidgetDataTable';
import { useWidgetData } from '../hooks/useDashboardData';
import { DashboardEndpoint } from '../types';
import { formatPeriodo, formatValue } from '../utils/format';

type Stage = 'recepcion' | 'cola' | 'clasificado' | 'pelado';
const stages: { id: Stage; title: string; endpoint: DashboardEndpoint; label: string; color: string; icon: ReactNode }[] = [
  { id: 'recepcion', title: 'Inventario Recepción', endpoint: 'inventario-fresco-recepcion', label: 'Cliente', color: '#164a8b', icon: <MoveToInboxOutlinedIcon /> },
  { id: 'cola', title: 'Cola sin clasificar', endpoint: 'inventario-fresco-cola', label: 'Cliente', color: '#b45309', icon: <SetMealOutlinedIcon /> },
  { id: 'clasificado', title: 'Cola clasificada', endpoint: 'inventario-fresco-clasificado', label: 'Talla', color: '#0f766e', icon: <CategoryOutlinedIcon /> },
  { id: 'pelado', title: 'Inventario Pelado', endpoint: 'inventario-fresco-pelado', label: 'Estilo', color: '#2e7d32', icon: <ContentCutOutlinedIcon /> },
];
const formatTime = (at: number) => new Date(at).toLocaleTimeString('es-HN', { hour: '2-digit', minute: '2-digit' });
const totals: WidgetColumn[] = [
  { key: 'bins', label: 'Bins', format: 'number', align: 'right', total: 'sum' },
  { key: 'libras', label: 'Libras', format: 'decimal', align: 'right', total: 'sum' },
];
const date: WidgetColumn = { key: 'fecha', label: 'Fecha', format: 'periodo' };
const details: WidgetColumn[] = [
  { key: 'finca', label: 'Finca', optional: true }, { key: 'laguna', label: 'Laguna', optional: true },
  { key: 'remision', label: 'Remisión', optional: true }, { ...date, optional: true },
];
const columns: Record<Stage, WidgetColumn[]> = {
  recepcion: [{ key: 'cliente', label: 'Cliente' }, ...totals, { key: 'tiempo', label: 'Mayor tiempo sin procesar', maximumByKey: 'minutosEspera' }, ...details],
  cola: [{ key: 'cliente', label: 'Cliente' }, ...totals, ...details.filter(c => c.key !== 'remision')],
  clasificado: [{ key: 'talla', label: 'Talla' }, { key: 'destino', label: 'Destino' }, ...totals,
    { key: 'tallaDestino', label: 'Talla y destino', optional: true }, ...details],
  pelado: [{ key: 'estilo', label: 'Estilo' }, ...totals,
    { key: 'destino', label: 'Destino', optional: true }, { key: 'talla', label: 'Talla', optional: true },
    { key: 'cliente', label: 'Cliente', optional: true }, ...details.filter(c => c.key !== 'remision')],
};
const group: Record<Stage, string> = { recepcion: 'cliente', cola: 'cliente', clasificado: 'tallaDestino', pelado: 'estilo' };


type InventoryQuery = ReturnType<typeof useWidgetData>;
type SummaryRow = { key: string; label: string; destino: string; bins: number; libras: number; minutos: number; tiempo: string };

function InventoryPanel({ stage, query }: { stage: typeof stages[number]; query: InventoryQuery }) {
  const [view, setView] = useState<'resumen' | 'fecha' | 'destino'>('resumen');
  const [detailOpen, setDetailOpen] = useState(false);
  const summary = useMemo(() => {
    const grouped = new Map<string, SummaryRow>();
    let libras = 0, bins = 0;
    for (const row of query.data ?? []) {
      const label = view === 'fecha' ? String(row.fecha || 'Sin fecha') : view === 'destino' ? String(row.destino) : String(row[stage.id === 'clasificado' ? 'talla' : group[stage.id]]);
      const destino = view === 'resumen' && stage.id === 'clasificado' ? String(row.destino) : '';
      const key = JSON.stringify([label, destino]);
      const cell = grouped.get(key) ?? { key, label, destino, bins: 0, libras: 0, minutos: -1, tiempo: '—' };
      cell.bins += Number(row.bins) || 0; cell.libras += Number(row.libras) || 0;
      if (Number(row.minutosEspera) > cell.minutos) { cell.minutos = Number(row.minutosEspera); cell.tiempo = String(row.tiempo ?? '—'); }
      grouped.set(key, cell);
      libras += Number(row.libras) || 0; bins += Number(row.bins) || 0;
    }
    const rows = [...grouped.values()].sort((a, b) => view === 'fecha'
      ? b.label.localeCompare(a.label)
      : stage.id === 'clasificado' && view === 'resumen'
        ? a.label.localeCompare(b.label, 'es', { numeric: true }) || a.destino.localeCompare(b.destino)
        : b.libras - a.libras);
    return { rows, libras, bins };
  }, [query.data, stage.id, view]);
  const showDestination = stage.id === 'clasificado' && view === 'resumen';
  const showAge = stage.id === 'recepcion' && view === 'resumen';
  const count = 3 + Number(showDestination) + Number(showAge);
  const label = view === 'fecha' ? 'Fecha' : view === 'destino' ? 'Destino' : stage.label;
  const detailColumns = view === 'fecha' ? [date, ...totals, ...details.filter(c => c.key !== 'fecha')]
    : view === 'destino' ? [{ key: 'destino', label: 'Destino' }, ...totals, { key: 'estilo', label: 'Estilo', optional: true }, ...details]
    : columns[stage.id];
  return <Card component="section" aria-label={stage.title} sx={{
    display: 'flex', flexDirection: 'column', minWidth: 0, minHeight: 0, overflow: 'hidden',
    borderTop: `3px solid ${stage.color}`,
  }}>
    <Box sx={{ px: 2, pt: 1.25, pb: 1 }}>
      <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
        <Stack direction="row" alignItems="center" spacing={1} minWidth={0}>
          <Box sx={{ display: 'grid', placeItems: 'center', width: 28, height: 28, borderRadius: 1.5, flexShrink: 0,
            color: stage.color, bgcolor: `${stage.color}14`, '& svg': { fontSize: 17 } }}>{stage.icon}</Box>
          <Typography component="h2" variant="subtitle2" fontWeight={800} noWrap sx={{ fontSize: 13 }}>{stage.title}</Typography>
        </Stack>
        <Button size="small" startIcon={<VisibilityOutlinedIcon sx={{ fontSize: 16 }} />} onClick={() => setDetailOpen(true)}
          sx={{ minWidth: 0, minHeight: 30, whiteSpace: 'nowrap', fontSize: 12 }}>Ver detalle</Button>
      </Stack>
      <Stack direction="row" alignItems="baseline" spacing={1} sx={{ mt: 0.4, mb: 1 }}>
        {query.isLoading ? <Skeleton width={150} height={36} /> : <Typography component="p" fontWeight={800} color={stage.color}
          sx={{ fontSize: { xs: 24, lg: 28 }, lineHeight: 1.2, fontVariantNumeric: 'tabular-nums' }}>
          {query.data ? formatValue(summary.libras, 'decimal') : '—'} <Typography component="span" variant="body2" color="text.secondary">lbs</Typography>
        </Typography>}
        {query.data && <Chip size="small" label={`${formatValue(summary.bins, 'number')} bins`}
          sx={{ height: 20, fontWeight: 700, color: stage.color, bgcolor: `${stage.color}14`, '& .MuiChip-label': { px: 0.9, fontSize: 11 } }} />}
      </Stack>
      <ToggleButtonGroup exclusive size="small" value={view} onChange={(_event, value) => { if (value) setView(value); }}
        aria-label={`Agrupación de ${stage.title}`} sx={{ '& .MuiToggleButton-root': { px: 1.25, py: 0.4, fontSize: 11.5, fontWeight: 700, textTransform: 'none' },
          '& .MuiToggleButton-root.Mui-selected': { color: stage.color, bgcolor: `${stage.color}14` } }}>
        <ToggleButton value="resumen">Por {stage.label.toLowerCase()}</ToggleButton>
        <ToggleButton value="fecha">Por fecha</ToggleButton>
        {stage.id === 'pelado' && <ToggleButton value="destino">Por destino</ToggleButton>}
      </ToggleButtonGroup>
    </Box>
    {query.isError && <Alert severity="error" sx={{ mx: 1.5, mb: 1, py: 0 }}>
      {query.data ? 'No se pudo actualizar. Se muestra el último saldo disponible.' : 'No se pudo consultar el inventario.'}
    </Alert>}
    <TableContainer sx={{ flex: { md: 1 }, minHeight: { xs: 90, md: 0 }, maxHeight: { xs: 280, md: 'none' }, borderTop: 1, borderColor: 'divider' }}>
      <Table size="small" stickyHeader aria-label={`${stage.title} por ${label.toLowerCase()}`} sx={{
        '& .MuiTableCell-root': { px: { xs: 1, sm: 1.5 }, py: 0.7, fontSize: 12.5, borderColor: 'divider' },
        '& .MuiTableCell-head': { bgcolor: '#f1f5f9', fontWeight: 800, color: 'text.secondary', fontSize: 11.5, whiteSpace: 'nowrap' },
      }}>
        <TableHead><TableRow>
          <TableCell>{label}</TableCell>
          {showDestination && <TableCell>Destino</TableCell>}
          {showAge && <TableCell>Tiempo pendiente</TableCell>}
          <TableCell align="right">Bins</TableCell><TableCell align="right">Libras</TableCell>
        </TableRow></TableHead>
        <TableBody>
          {query.isLoading ? Array.from({ length: 3 }, (_, i) => <TableRow key={i}><TableCell colSpan={count}><Skeleton /></TableCell></TableRow>)
            : summary.rows.length === 0 ? <TableRow><TableCell colSpan={count} sx={{ height: 72, color: 'text.secondary', textAlign: 'center' }}>
              {query.isError ? 'Inventario no disponible' : 'Sin existencias pendientes'}
            </TableCell></TableRow>
              : summary.rows.map((row, i) => <TableRow key={row.key} hover sx={{ bgcolor: i % 2 ? '#f8fafc' : 'background.paper' }}>
                <TableCell component="th" scope="row" sx={{ fontWeight: 600 }}>{view === 'fecha' ? formatPeriodo(row.label) : row.label}</TableCell>
                {showDestination && <TableCell><Chip label={row.destino} size="small" variant="outlined" sx={{ height: 'auto', minHeight: 22, borderColor: 'divider', color: 'text.secondary', fontSize: 11, '& .MuiChip-label': { whiteSpace: 'normal', py: 0.2 } }} /></TableCell>}
                {showAge && <TableCell sx={{ color: 'text.secondary' }}>{row.tiempo}</TableCell>}
                <TableCell align="right" sx={{ fontVariantNumeric: 'tabular-nums', color: 'text.secondary' }}>{formatValue(row.bins, 'number')}</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{formatValue(row.libras, 'decimal')}</TableCell>
              </TableRow>)}
        </TableBody>
      </Table>
    </TableContainer>
    <Box sx={{ px: 2, py: 0.6, borderTop: 1, borderColor: 'divider', bgcolor: '#f8fafc' }}>
      <Typography variant="caption" color="text.secondary" sx={{ fontSize: 10.5 }}>
        {query.isFetching ? 'Actualizando…' : query.dataUpdatedAt ? `Actualizado ${formatTime(query.dataUpdatedAt)}` : 'Pendiente de consulta'}
      </Typography>
    </Box>
    <Dialog open={detailOpen} onClose={() => setDetailOpen(false)} fullWidth maxWidth="lg">
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Stack direction="row" alignItems="center" spacing={1}>
          <Box sx={{ display: 'flex', color: stage.color }}>{stage.icon}</Box><span>{stage.title}</span>
        </Stack><IconButton aria-label="Cerrar detalle" onClick={() => setDetailOpen(false)}><CloseOutlinedIcon /></IconButton>
      </DialogTitle>
      <DialogContent>
        {detailOpen && <WidgetDataTable key={view} title={`Detalle por ${label.toLowerCase()}`} endpoint={stage.endpoint}
          preferenceKey={`fresh-detail-${stage.id}-${view}`} icon={<Inventory2OutlinedIcon color="primary" sx={{ fontSize: 16 }} />}
          columns={detailColumns} groupByKey={view === 'fecha' ? 'fecha' : view === 'destino' ? 'destino' : group[stage.id]}
          defaultSortKey="libras" filterable stickySummary maxHeight={560}
          subtitle="Desactiva la agrupación para consultar fechas, fincas y lagunas de cada registro."
          emptyText="Sin existencias pendientes." />}
      </DialogContent>
    </Dialog>
  </Card>;
}

export default function FreshInventoryPage() {
  const reception = useWidgetData('inventario-fresco-recepcion');
  const tail = useWidgetData('inventario-fresco-cola');
  const classified = useWidgetData('inventario-fresco-clasificado');
  const peeled = useWidgetData('inventario-fresco-pelado');
  const queries = [reception, tail, classified, peeled];
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const refresh = async () => {
    setRefreshing(true); setError('');
    try {
      const results = await Promise.allSettled(queries.map(query => query.refreshNow()));
      if (results.some(result => result.status === 'rejected')) setError('No se pudieron actualizar todos los inventarios. Intenta nuevamente.');
    } finally { setRefreshing(false); }
  };
  const loaded = queries.filter(query => query.dataUpdatedAt).map(query => query.dataUpdatedAt);
  const updatedAt = loaded.length ? Math.min(...loaded) : 0;
  return <Stack spacing={1.5} sx={{ height: '100%', minHeight: 0, overflowY: 'auto', overflowX: 'hidden', py: 1 }}>
    <Stack direction="row" justifyContent="space-between" alignItems="center" gap={2} flexWrap="wrap" sx={{ flexShrink: 0 }}>
      <Box>
        <Stack direction="row" alignItems="center" spacing={1}>
          <Typography component="h1" variant="h5" fontWeight={800}>Inventario Fresco</Typography>
          <Chip size="small" label="EN VIVO" color="success" variant="outlined"
            sx={{ fontWeight: 700, height: 18, '& .MuiChip-label': { fontSize: 9.5, px: 0.75 } }} />
        </Stack>
        <Typography color="text.secondary">
          Existencias pendientes por etapa · se actualiza cada 5 minutos{updatedAt ? ` · última lectura ${formatTime(updatedAt)}` : ''}
        </Typography>
      </Box>
      <Button variant="outlined" startIcon={<RefreshOutlinedIcon />} disabled={refreshing} onClick={() => void refresh()} sx={{ flexShrink: 0 }}>
        {refreshing ? 'Actualizando…' : 'Actualizar'}
      </Button>
    </Stack>
    {error && <Alert severity="error">{error}</Alert>}
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'repeat(2, minmax(0, 1fr))' },
      gridTemplateRows: { md: 'repeat(2, minmax(260px, 1fr))' }, gap: 1.5, flex: { md: 1 }, minHeight: { md: 0 }, pb: { xs: 1.5, md: 0 } }}>
      {stages.map((stage, index) => <InventoryPanel key={stage.id} stage={stage} query={queries[index]} />)}
    </Box>
  </Stack>;
}
