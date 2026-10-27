import { useState } from 'react';
import { Accordion, AccordionDetails, AccordionSummary, Alert, Button, Checkbox, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography } from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../api/client';
import { Preload, StockItem } from '../types/preload';
interface Lot { key: string; item: StockItem; current: number; assigned: number; maximum: number }
interface EditData {
  revision: number; groups: { key: string; item: StockItem; requested: number; excludedLots: string[]; lots: Lot[] }[];
  edits: { revision: number; createdAt: string; createdBy: string; reason: string }[];
}
export default function EditLoadDialog({ load, onClose }: { load: Preload; onClose: () => void }) {
  const query = useQuery({ queryKey: ['edit-load', load.id], staleTime: 0, refetchOnWindowFocus: false,
    queryFn: async () => (await apiClient.get<EditData>(`/inventory/preloads/${load.id}/edit`)).data });
  if (!query.data) return <Dialog open onClose={onClose} fullWidth maxWidth="lg"><DialogTitle>Editar carga #{load.id}</DialogTitle><DialogContent>{query.isError ? <Alert severity="error">No se pudieron consultar las existencias. <Button onClick={() => void query.refetch()}>Reintentar</Button></Alert> : <CircularProgress />}</DialogContent><DialogActions><Button onClick={onClose}>Cerrar</Button></DialogActions></Dialog>;
  return <Editor key={query.data.revision} load={load} data={query.data} onClose={onClose} refresh={() => query.refetch()} refreshing={query.isFetching} />;
}
function Editor({ load, data, onClose, refresh, refreshing }: { load: Preload; data: EditData; onClose: () => void; refresh: () => unknown; refreshing: boolean }) {
  const cache = useQueryClient();
  const [requested, setRequested] = useState<Record<string, string>>(() => Object.fromEntries(data.groups.map(group => [group.key, String(group.requested)])));
  const [quantities, setQuantities] = useState<Record<string, string>>(() => Object.fromEntries(data.groups.flatMap(group => group.lots.map(lot => [lot.key, String(lot.assigned)]))));
  const [excluded, setExcluded] = useState<Record<string, boolean>>(() => Object.fromEntries(data.groups.flatMap(group => (group.excludedLots ?? []).map(key => [key, true]))));
  const [notes, setNotes] = useState(load.notes);
  const [reason, setReason] = useState('');
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const amount = (lot: Lot) => Number(quantities[lot.key] ?? 0);
  const sum = (lots: Lot[]) => lots.reduce((total, lot) => total + amount(lot), 0);
  const invalid = data.groups.some(group => !Number.isSafeInteger(Number(requested[group.key])) || Number(requested[group.key]) < 0 || sum(group.lots) > Number(requested[group.key]) || group.lots.some(lot => !Number.isSafeInteger(amount(lot)) || amount(lot) < 0 || amount(lot) > lot.maximum));
  const complete = (group: EditData['groups'][number]) => {
    let remaining = Math.max(0, Number(requested[group.key]) - sum(group.lots));
    const next = { ...quantities };
    for (const lot of group.lots) {
      const added = excluded[lot.key] ? 0 : Math.min(remaining, Math.max(0, lot.current - amount(lot)));
      next[lot.key] = String(amount(lot) + added); remaining -= added;
    }
    setQuantities(next);
  };
  const save = async () => {
    if (saving || invalid || !reason.trim()) return;
    setSaving(true); setError('');
    try {
      await apiClient.put(`/inventory/preloads/${load.id}`, { revision: data.revision, notes, reason, lines: data.groups.map(group => ({ key: group.key, requested: Number(requested[group.key]), excludedLots: [...new Set([...(group.excludedLots ?? []), ...group.lots.map(lot => lot.key)])].filter(key => excluded[key]), allocations: group.lots.filter(lot => amount(lot) > 0).map(lot => ({ key: lot.key, quantity: amount(lot) })) })) });
      await Promise.all([cache.invalidateQueries({ queryKey: ['preloads'] }), cache.invalidateQueries({ queryKey: ['load-report'] })]);
      onClose();
    } catch (err: any) { setError(err.response?.data?.error ?? 'No se pudieron guardar los cambios. Intenta nuevamente.'); }
    finally { setSaving(false); }
  };
  const needle = search.trim().toLocaleLowerCase();
  return <Dialog open onClose={() => { if (!saving) onClose(); }} fullWidth maxWidth="xl">
    <DialogTitle>Editar carga #{load.id}</DialogTitle>
    <DialogContent dividers><Stack spacing={2}>
      <Typography color="text.secondary">Ajusta los seriales por producción. Para reemplazar producto que no se pudo mandar, quita su cantidad y agrégala en otra producción del mismo ítem. Puedes buscar en otras órdenes del mismo cliente. Al reducir o quitar una producción, queda marcada como No completar para que el autocompletado busque el reemplazo en otra.</Typography>
      <Stack direction="row" gap={2}><TextField fullWidth size="small" label="Buscar ítem, orden, producción, finca o laguna" value={search} onChange={event => setSearch(event.target.value)} /><Button disabled={saving || refreshing} onClick={() => void refresh()} sx={{ minWidth: 180 }}>{refreshing ? 'Actualizando…' : 'Actualizar existencias'}</Button></Stack>
      {error && <Alert severity="error">{error}</Alert>}
      {data.groups.map(group => {
        const assigned = sum(group.lots); const target = Number(requested[group.key]);
        const matchesItem = `${group.item.nombreItem} ${group.item.nombreCliente}`.toLocaleLowerCase().includes(needle);
        const lots = group.lots.filter(lot => !needle || matchesItem || [lot.item.noOrdenCompra, lot.item.codigoProduccion, lot.item.codigoExterno, lot.item.nombreFinca, lot.item.laguna, lot.item.fechaProduccion].join(' ').toLocaleLowerCase().includes(needle));
        if (needle && !matchesItem && !lots.length) return null;
        return <Accordion key={group.key} defaultExpanded disableGutters><AccordionSummary expandIcon={<ExpandMoreIcon />}><Stack><Typography fontWeight={700}>{group.item.nombreItem} · {group.item.nombreCliente}</Typography><Typography variant="caption" color={assigned > target ? 'error.main' : 'text.secondary'}>Solicitados: {target.toLocaleString()} · Asignados: {assigned.toLocaleString()} · Faltantes: {Math.max(0, target - assigned).toLocaleString()}</Typography></Stack></AccordionSummary><AccordionDetails><Stack spacing={1.5}>
          <Stack direction="row" spacing={2} alignItems="center"><TextField label="Seriales solicitados" size="small" type="number" value={requested[group.key]} disabled={saving} inputProps={{ min: 0, step: 1 }} onChange={event => setRequested(current => ({ ...current, [group.key]: event.target.value }))} /><Button disabled={saving || invalid} onClick={() => complete(group)}>Completar con los más antiguos</Button></Stack>
          <TableContainer sx={{ maxHeight: 340 }}><Table stickyHeader size="small"><TableHead><TableRow>{['Orden', 'Producción', 'Finca', 'Laguna', 'Fecha', 'Color', 'Disponibles ahora', 'En carga', 'No completar', ''].map(label => <TableCell key={label}>{label}</TableCell>)}</TableRow></TableHead><TableBody>{lots.map(lot => <TableRow key={lot.key} sx={{ bgcolor: amount(lot) > 0 ? 'action.hover' : undefined }}><TableCell>{lot.item.noOrdenCompra}</TableCell><TableCell>{lot.item.codigoProduccion || lot.item.codigoExterno}</TableCell><TableCell>{lot.item.nombreFinca || '—'}</TableCell><TableCell>{lot.item.laguna || '—'}</TableCell><TableCell sx={{ whiteSpace: 'nowrap' }}>{lot.item.fechaProduccion}</TableCell><TableCell>{lot.item.color || '—'}</TableCell><TableCell align="right">{lot.current.toLocaleString()}{!lot.current && lot.assigned > 0 && <Typography display="block" variant="caption">Asignación guardada: {lot.assigned}</Typography>}</TableCell><TableCell><TextField size="small" type="number" value={quantities[lot.key] ?? '0'} disabled={saving} error={!Number.isSafeInteger(amount(lot)) || amount(lot) < 0 || amount(lot) > lot.maximum} helperText={amount(lot) > lot.maximum ? `Máximo ${lot.maximum}` : undefined} inputProps={{ min: 0, max: lot.maximum, step: 1, 'aria-label': `Seriales producción ${lot.item.codigoProduccion || lot.item.codigoExterno}` }} onChange={event => { const value = event.target.value; setQuantities(current => ({ ...current, [lot.key]: value })); if (Number(value) < lot.assigned) setExcluded(current => ({ ...current, [lot.key]: true })); }} sx={{ width: 115 }} /></TableCell><TableCell><Checkbox checked={!!excluded[lot.key]} disabled={saving} inputProps={{ 'aria-label': `No completar producción ${lot.item.codigoProduccion || lot.item.codigoExterno}` }} onChange={(_, checked) => setExcluded(current => ({ ...current, [lot.key]: checked }))} /></TableCell><TableCell><Button size="small" disabled={saving || !amount(lot)} onClick={() => { setQuantities(current => ({ ...current, [lot.key]: '0' })); setExcluded(current => ({ ...current, [lot.key]: true })); }}>Quitar</Button></TableCell></TableRow>)}</TableBody></Table></TableContainer>
        </Stack></AccordionDetails></Accordion>;
      })}
      {invalid && <Alert severity="warning">Revisa las cantidades: usa seriales enteros y no asignes más de lo solicitado ni del máximo de cada producción.</Alert>}
      <TextField label="Referencia u observaciones" value={notes} disabled={saving} multiline minRows={2} inputProps={{ maxLength: 2000 }} onChange={event => setNotes(event.target.value)} />
      <TextField required label="Motivo del cambio" placeholder="Ej.: se reemplazan seriales que no se pudieron mandar." value={reason} disabled={saving} multiline minRows={2} inputProps={{ maxLength: 2000 }} onChange={event => setReason(event.target.value)} />
      {!!data.edits.length && <Accordion disableGutters><AccordionSummary expandIcon={<ExpandMoreIcon />}>Cambios anteriores ({data.edits.length})</AccordionSummary><AccordionDetails><Stack spacing={1}>{data.edits.map(edit => <Typography key={edit.revision} variant="body2">Revisión {edit.revision} · {new Date(edit.createdAt).toLocaleString('es-HN', { timeZone: 'America/Tegucigalpa' })} · {edit.createdBy}: {edit.reason}</Typography>)}</Stack></AccordionDetails></Accordion>}
    </Stack></DialogContent>
    <DialogActions><Button disabled={saving} onClick={onClose}>Cancelar</Button><Button variant="contained" disabled={saving || refreshing || invalid || !reason.trim()} onClick={() => void save()}>{saving ? 'Guardando…' : 'Guardar cambios'}</Button></DialogActions>
  </Dialog>;
}
