import { useState } from 'react';
import { Alert, Box, Button, Chip, CircularProgress, Collapse, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, IconButton, Paper, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined';
import EditLoadDialog from '../components/EditLoadDialog';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import LoadReportTable from '../components/LoadReportTable';
import RefreshOutlinedIcon from '@mui/icons-material/RefreshOutlined';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../api/client';
import { Preload } from '../types/preload';
import { WeightUnit } from '../utils/weightUnits';

const dateLabel = (value: string, production = false) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString('es-HN', { timeZone: production ? 'UTC' : 'America/Tegucigalpa' });
};
const totals = (request: Preload) => request.items.reduce((sum, item) => ({
  requested: sum.requested + item.requested, assigned: sum.assigned + item.assigned,
  missing: sum.missing + item.missing, kg: sum.kg + item.pesoKilos,
}), { requested: 0, assigned: 0, missing: 0, kg: 0 });

export default function PreloadPage({ onInventory, userId, canViewInventory }: { canViewInventory: boolean; onInventory: () => void; userId: string }) {
  const cache = useQueryClient();
  const [deleteTarget, setDeleteTarget] = useState<Preload | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [deletedMessage, setDeletedMessage] = useState('');
  const [updating, setUpdating] = useState(false);
  const [updateMessage, setUpdateMessage] = useState('');
  const [updateError, setUpdateError] = useState('');
  const [editing, setEditing] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const invalidRange = !!from && !!to && from > to;
  const query = useQuery({
    queryKey: ['preloads', userId, from, to], enabled: !invalidRange,
    queryFn: async () => (await apiClient.get<{ requests: Preload[] }>('/inventory/preloads', { params: { from: from || undefined, to: to || undefined } })).data.requests,
  });
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [unit, setUnit] = useState<WeightUnit>('lbs');
  const requests = invalidRange ? [] : query.data ?? [];
  const selected = requests.find(request => request.id === selectedId) ?? requests[0];
  const updatePreload = async () => {
    if (!selected || updating) return;
    setUpdating(true); setUpdateMessage(''); setUpdateError('');
    try {
      const { data } = await apiClient.post<{ added: number }>(`/inventory/preloads/${selected.id}/refresh`, { revision: selected.revision });
      setUpdateMessage(data.added ? `Se agregaron ${data.added.toLocaleString()} seriales a la precarga.` : 'No hay existencias adicionales para completar los faltantes.');
      await Promise.all([cache.invalidateQueries({ queryKey: ['preloads'] }), cache.invalidateQueries({ queryKey: ['load-report'] }), cache.invalidateQueries({ queryKey: ['edit-load'] })]);
    } catch (err: any) { setUpdateError(err.response?.data?.error ?? 'No se pudo actualizar la precarga. Intenta nuevamente.'); }
    finally { setUpdating(false); }
  };
  const download = async () => {
    if (!selected || downloading) return;
    setDownloading(true); setDownloadError('');
    try {
      const response = await apiClient.get(`/inventory/preloads/${selected.id}/report`, { params: { unit, format: 'pdf' }, responseType: 'blob' });
      const url = URL.createObjectURL(response.data);
      const link = document.createElement('a'); link.href = url; link.download = `PRECARGA${selected.notes.trim() ? ' ' + selected.notes.trim().replace(/[<>:"/\\|?*\x00-\x1f]/g, '_') : ''}.pdf`;
      document.body.appendChild(link); link.click(); link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch { setDownloadError('No se pudo descargar la tabla. Intenta nuevamente.'); }
    finally { setDownloading(false); }
  };
  const remove = async () => {
    if (!deleteTarget || deleting) return;
    setDeleting(true); setDeleteError('');
    try {
      await apiClient.delete(`/inventory/preloads/${deleteTarget.id}`, { data: { revision: deleteTarget.revision } });
      cache.setQueriesData<Preload[]>({ queryKey: ['preloads', userId] }, old => old?.filter(load => load.id !== deleteTarget.id));
      setSelectedId(null); setHistoryOpen(true); setEditing(false);
      setDeletedMessage(`Carga #${deleteTarget.id} eliminada.`); setDeleteTarget(null);
      await cache.invalidateQueries({ queryKey: ['preloads'] });
      cache.removeQueries({ queryKey: ['load-report', userId, deleteTarget.id] });
    } catch (err: unknown) {
      const message = (err as { response?: { data?: { error?: string } } }).response?.data?.error;
      setDeleteError(message ?? 'No se pudo eliminar la carga. Intenta nuevamente.');
    } finally { setDeleting(false); }
  };
  const total = selected ? totals(selected) : null;
  return <Stack spacing={2} sx={{ height: '100%', minHeight: 0, py: 1, overflow: 'auto' }}>
    <Stack direction="row" justifyContent="space-between" gap={2} flexWrap="wrap"><Box><Typography variant="h5" fontWeight={800}>Carga</Typography><Typography color="text.secondary">Historial de cargas guardadas y distribución de producto por antigüedad.</Typography></Box><Stack direction="row" gap={1}>{canViewInventory && <Button onClick={onInventory}>Ir a Inventario PT</Button>}<Button variant="outlined" startIcon={<RefreshOutlinedIcon />} disabled={query.isFetching || invalidRange} onClick={() => void query.refetch()}>Actualizar</Button></Stack></Stack>
    {deletedMessage && <Alert severity="success" onClose={() => setDeletedMessage('')}>{deletedMessage}</Alert>}
    <Paper variant="outlined" sx={{ p: 2 }}><Stack spacing={2}>
      <Stack direction="row" alignItems="center" justifyContent="space-between"><Typography fontWeight={800}>Historial de cargas</Typography><IconButton size="small" aria-label={historyOpen ? 'Ocultar historial' : 'Mostrar historial'} aria-expanded={historyOpen} aria-controls="load-history" onClick={() => setHistoryOpen(open => !open)}>{historyOpen ? <ExpandLessIcon /> : <ExpandMoreIcon />}</IconButton></Stack>
      <Collapse in={historyOpen}><Stack id="load-history" spacing={2}>
      <Stack direction="row" gap={2} flexWrap="wrap" alignItems="center"><TextField type="date" size="small" label="Desde" InputLabelProps={{ shrink: true }} value={from} onChange={event => setFrom(event.target.value)} /><TextField type="date" size="small" label="Hasta" InputLabelProps={{ shrink: true }} value={to} onChange={event => setTo(event.target.value)} /><Button onClick={() => { setFrom(''); setTo(''); }}>Todas las fechas</Button><Typography variant="caption" color="text.secondary">Fecha de creación · hora de Honduras</Typography></Stack>
      {invalidRange && <Alert severity="warning">La fecha inicial debe ser anterior o igual a la final.</Alert>}
      {query.isError && <Alert severity="error">No se pudieron cargar las cargas. Intenta actualizar.</Alert>}
      {query.isLoading && !invalidRange ? <CircularProgress size={26} /> : !requests.length ? <Typography color="text.secondary">No hay cargas en el rango seleccionado.</Typography> : <TableContainer sx={{ maxHeight: 240 }}><Table stickyHeader size="small"><TableHead><TableRow>{['Carga', 'Fecha', 'Cliente', 'Solicitados', 'Asignados', 'Faltantes', 'Estado', ''].map(label => <TableCell key={label} align={['Solicitados', 'Asignados', 'Faltantes'].includes(label) ? 'center' : 'left'}>{label}</TableCell>)}</TableRow></TableHead><TableBody>{requests.map(request => {
        const sum = totals(request);
        return <TableRow key={request.id} selected={selected?.id === request.id} hover><TableCell>#{request.id}</TableCell><TableCell sx={{ whiteSpace: 'nowrap' }}>{dateLabel(request.createdAt)}</TableCell><TableCell>{[...new Set(request.items.map(group => group.item.nombreCliente).filter(Boolean))].join(', ') || '—'}</TableCell><TableCell align="center">{sum.requested.toLocaleString()}</TableCell><TableCell align="center">{sum.assigned.toLocaleString()}</TableCell><TableCell align="center">{sum.missing.toLocaleString()}</TableCell><TableCell><Chip size="small" label={sum.missing ? 'Con faltantes' : 'Completa'} color={sum.missing ? 'warning' : 'success'} /></TableCell><TableCell><Button size="small" disabled={updating} onClick={() => { setSelectedId(request.id); setHistoryOpen(false); setUpdateMessage(''); setUpdateError(''); }}>Ver detalle</Button></TableCell></TableRow>;
      })}</TableBody></Table></TableContainer>}
      </Stack></Collapse>
    </Stack></Paper>
    {selected && total && <>
      <Stack direction="row" gap={2} alignItems="center" flexWrap="wrap"><Typography variant="h6" fontWeight={800}>Carga #{selected.id}</Typography><Chip label={total.missing ? 'Con faltantes' : 'Completa'} color={total.missing ? 'warning' : 'success'} size="small" /><ToggleButtonGroup size="small" exclusive value={unit} onChange={(_, next) => { if (next) setUnit(next); }}><ToggleButton value="lbs">Libras</ToggleButton><ToggleButton value="kg">Kilos</ToggleButton></ToggleButtonGroup><Button variant="outlined" startIcon={<RefreshOutlinedIcon />} disabled={updating || editing || !total.missing} onClick={() => void updatePreload()}>{updating ? 'Actualizando precarga…' : 'Actualizar precarga'}</Button><Button disabled={updating} variant="contained" startIcon={<EditOutlinedIcon />} onClick={() => setEditing(true)}>Editar carga</Button><Button variant="outlined" startIcon={<DownloadOutlinedIcon />} disabled={downloading || updating} onClick={() => void download()}>{downloading ? 'Descargando…' : 'Descargar PDF'}</Button><Button disabled={updating} color="error" variant="outlined" startIcon={<DeleteOutlineIcon />} onClick={() => { setDeleteError(''); setDeleteTarget(selected); }}>Eliminar carga</Button></Stack>
      <Typography color="text.secondary">Solicitados: {total.requested.toLocaleString()} · Asignados: {total.assigned.toLocaleString()} · Faltantes: {total.missing.toLocaleString()} seriales</Typography>
      {selected.notes && <Typography sx={{ whiteSpace: 'pre-wrap' }}>Código Embarque: {selected.notes}</Typography>}
      {total.missing > 0 && <Alert severity="warning">Carga parcial. Los faltantes quedan registrados para revisión; no se sustituyen automáticamente por otros productos.</Alert>}
      {updateMessage && <Alert severity="info" onClose={() => setUpdateMessage('')}>{updateMessage}</Alert>}
      {updateError && <Alert severity="error" onClose={() => setUpdateError('')}>{updateError}</Alert>}
      {downloadError && <Alert severity="error">{downloadError}</Alert>}
      {editing && <EditLoadDialog load={selected} onClose={() => setEditing(false)} />}
      <LoadReportTable loadId={selected.id} unit={unit} userId={userId} />
    </>}
    <Dialog open={!!deleteTarget} onClose={() => { if (!deleting) setDeleteTarget(null); }} maxWidth="xs" fullWidth>
      <DialogTitle>Eliminar carga #{deleteTarget?.id}</DialogTitle>
      <DialogContent>
        <DialogContentText>La carga dejará de aparecer en el historial. Su información se conserva mediante borrado lógico y el inventario no se modifica.</DialogContentText>
        {deleteError && <Alert severity="error" sx={{ mt: 2 }}>{deleteError}</Alert>}
      </DialogContent>
      <DialogActions>
        <Button disabled={deleting} onClick={() => setDeleteTarget(null)}>Cancelar</Button>
        <Button color="error" variant="contained" disabled={deleting} onClick={() => void remove()}>{deleting ? 'Eliminando…' : 'Eliminar carga'}</Button>
      </DialogActions>
    </Dialog>
  </Stack>;
}
