import { useEffect, useState } from 'react';
import { Accordion, AccordionDetails, AccordionSummary, Alert, Autocomplete, Button, Chip, createFilterOptions, Checkbox, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography } from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../api/client';
import { Preload } from '../types/preload';
import { prepareLoadAddition, refreshAddedLoadGroup, type EditableLoadGroup, type EditableLoadLot } from '../utils/loadEditAddition';
type Lot = EditableLoadLot;
interface EditData {
  revision: number; groups: EditableLoadGroup[]; additionalGroups: EditableLoadGroup[];
  edits: { revision: number; createdAt: string; createdBy: string; reason: string }[];
}
export default function EditLoadDialog({ load, onClose }: { load: Preload; onClose: () => void }) {
  const query = useQuery({ queryKey: ['edit-load', load.id], staleTime: 0, gcTime: 0, refetchOnMount: 'always', refetchOnWindowFocus: true, refetchInterval: 30000,
    queryFn: async () => (await apiClient.get<EditData>(`/inventory/preloads/${load.id}/edit`)).data });
  if (!query.data || !query.isFetchedAfterMount) return <Dialog open onClose={onClose} fullWidth maxWidth="lg"><DialogTitle>Editar carga #{load.id}</DialogTitle><DialogContent>{query.isError ? <Alert severity="error">No se pudieron consultar las existencias. <Button onClick={() => void query.refetch()}>Reintentar</Button></Alert> : <CircularProgress />}</DialogContent><DialogActions><Button onClick={onClose}>Cerrar</Button></DialogActions></Dialog>;
  return <Editor key={query.data.revision} load={load} data={query.data} onClose={onClose} refresh={() => query.refetch()} refreshing={query.isFetching} refreshError={query.isError} updatedAt={query.dataUpdatedAt} />;
}
function Editor({ load, data, onClose, refresh, refreshing, refreshError, updatedAt }: { load: Preload; data: EditData; onClose: () => void; refresh: () => unknown; refreshing: boolean; refreshError: boolean; updatedAt: number }) {
  const cache = useQueryClient();
  const [requested, setRequested] = useState<Record<string, string>>(() => Object.fromEntries(data.groups.map(group => [group.key, String(group.requested)])));
  const [quantities, setQuantities] = useState<Record<string, string>>(() => Object.fromEntries(data.groups.flatMap(group => group.lots.map(lot => [lot.key, String(lot.assigned)]))));
  const [excluded, setExcluded] = useState<Record<string, boolean>>(() => Object.fromEntries(data.groups.flatMap(group => (group.excludedLots ?? []).map(key => [key, true]))));
  const [added, setAdded] = useState<Record<string, EditableLoadGroup>>({});
  const [newItemKey, setNewItemKey] = useState('');
  const [itemSearch, setItemSearch] = useState('');
  const [newRequested, setNewRequested] = useState('1');
  const [addedMessage, setAddedMessage] = useState('');
  useEffect(() => {
    setAdded(current => Object.fromEntries(Object.entries(current).map(([key, group]) => [key, refreshAddedLoadGroup(group, data.additionalGroups?.find(option => option.key === key))])));
  }, [data.additionalGroups]);
  const groups = [...Object.values(added).map(group => refreshAddedLoadGroup(group, data.additionalGroups?.find(option => option.key === group.key))), ...data.groups];
  const options = (data.additionalGroups ?? []).filter(group => !groups.some(current => current.key === group.key));
  const selectedNewItem = options.find(group => group.key === newItemKey) ?? null;
  const [notes, setNotes] = useState(load.notes);
  const [reason, setReason] = useState('');
  const [search, setSearch] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const amount = (lot: Lot) => Number(quantities[lot.key] ?? 0);
  const available = (lot: Lot) => Math.max(0, lot.current - amount(lot));
  const sum = (lots: Lot[]) => lots.reduce((total, lot) => total + amount(lot), 0);
  const invalid = groups.some(group => !Number.isSafeInteger(Number(requested[group.key])) || Number(requested[group.key]) < 0 || (!!added[group.key] && Number(requested[group.key]) === 0) || sum(group.lots) > Number(requested[group.key]) || group.lots.some(lot => !Number.isSafeInteger(amount(lot)) || amount(lot) < 0 || amount(lot) > lot.maximum));
  const complete = (group: EditData['groups'][number]) => {
    let remaining = Math.max(0, Number(requested[group.key]) - sum(group.lots));
    const next = { ...quantities };
    for (const lot of group.lots) {
      const added = excluded[lot.key] ? 0 : Math.min(remaining, available(lot));
      next[lot.key] = String(amount(lot) + added); remaining -= added;
    }
    setQuantities(next);
  };
  const save = async () => {
    if (saving || invalid || !reason.trim() || !notes.trim()) return;
    setSaving(true); setError('');
    try {
      await apiClient.put(`/inventory/preloads/${load.id}`, { revision: data.revision, notes, reason, lines: groups.map(group => ({ key: group.key, requested: Number(requested[group.key]), excludedLots: [...new Set([...(group.excludedLots ?? []), ...group.lots.map(lot => lot.key)])].filter(key => excluded[key]), allocations: group.lots.filter(lot => amount(lot) > 0).map(lot => ({ key: lot.key, quantity: amount(lot) })) })) });
      await Promise.all([cache.invalidateQueries({ queryKey: ['preloads'] }), cache.invalidateQueries({ queryKey: ['load-report'] }), cache.invalidateQueries({ queryKey: ['edit-load'] })]);
      onClose();
    } catch (err: any) { setError(err.response?.data?.error ?? 'No se pudieron guardar los cambios. Intenta nuevamente.'); }
    finally { setSaving(false); }
  };
  const addItem = () => {
    if (!selectedNewItem || saving || refreshing || refreshError || !Number.isSafeInteger(Number(newRequested)) || Number(newRequested) <= 0) return;
    const proposal = prepareLoadAddition(selectedNewItem, Number(newRequested));
    setAdded(current => ({ ...current, [selectedNewItem.key]: selectedNewItem }));
    setRequested(current => ({ ...current, [selectedNewItem.key]: newRequested }));
    setQuantities(current => ({ ...current, ...proposal.quantities }));
    setAddedMessage(`${selectedNewItem.item.nombreItem}: ${newRequested} seriales solicitados, ${Number(newRequested) - proposal.missing} asignados${proposal.missing ? ` y ${proposal.missing} faltantes` : ''}.`);
    setNewItemKey(''); setItemSearch(''); setNewRequested('1'); setSearch(''); setError('');
  };
  const removeAddedItem = (group: EditableLoadGroup) => {
    setAdded(current => { const next = { ...current }; delete next[group.key]; return next; });
    setRequested(current => { const next = { ...current }; delete next[group.key]; return next; });
    setQuantities(current => { const next = { ...current }; group.lots.forEach(lot => { delete next[lot.key]; }); return next; });
    setExcluded(current => { const next = { ...current }; group.lots.forEach(lot => { delete next[lot.key]; }); return next; });
    setAddedMessage('');
  };
  const needle = search.trim().toLocaleLowerCase();
  return <Dialog open onClose={() => { if (!saving) onClose(); }} fullWidth maxWidth="xl">
    <DialogTitle>Editar carga #{load.id}</DialogTitle>
    <DialogContent dividers><Stack spacing={2}>
      <Typography color="text.secondary">Ajusta los seriales por producción. Para reemplazar producto que no se pudo mandar, quita su cantidad y agrégala en otra producción del mismo ítem. Puedes buscar en otras órdenes del mismo cliente. Al reducir o quitar una producción, queda marcada como No completar para que el autocompletado busque el reemplazo en otra.</Typography>
      <Stack spacing={1} sx={{ p: 1.5, border: '1px solid', borderColor: 'divider', borderRadius: 2, bgcolor: '#f8fafc' }}>
        <Typography fontWeight={700}>Agregar más ítems a esta carga</Typography>
        <Stack direction={{ xs: 'column', md: 'row' }} gap={1} alignItems={{ md: 'flex-start' }}>
          <Autocomplete<EditableLoadGroup> autoHighlight options={options} value={selectedNewItem} inputValue={itemSearch} onInputChange={(_, value) => setItemSearch(value)} onChange={(_, value) => setNewItemKey(value?.key ?? '')} disabled={saving || refreshing || refreshError} isOptionEqualToValue={(option, value) => option.key === value.key}
            getOptionLabel={option => [option.item.codigoItem, option.item.nombreItem, option.item.talla, option.item.marca, option.item.empaque, option.item.estiloFinal].filter(Boolean).join(' · ')}
            filterOptions={createFilterOptions({ limit: 60, stringify: option => [option.item.codigoItem, option.item.nombreItem, option.item.nombreCliente, option.item.talla, option.item.marca, option.item.empaque, option.item.estiloFinal, option.item.tipoItem].join(' ') })}
            noOptionsText={options.length ? 'Sin coincidencias. Prueba otro nombre o código.' : 'No hay otros ítems con existencia para el cliente de esta carga.'}
            renderOption={(props, option) => <li {...props} key={option.key}><Stack><Typography variant="body2" fontWeight={700}>{option.item.codigoItem} · {option.item.nombreItem}</Typography><Typography variant="caption" color="text.secondary">{[option.item.nombreCliente, option.item.talla, option.item.marca, option.item.empaque, option.item.estiloFinal].filter(Boolean).join(' · ')} · {option.inventoryTotal.toLocaleString()} seriales disponibles</Typography></Stack></li>}
            renderInput={params => <TextField {...params} size="small" label="Buscar ítem para agregar" placeholder="Escribe nombre, código, talla, marca o empaque…" />} sx={{ flex: 1, minWidth: 0 }} />
          <TextField size="small" type="number" label="Seriales solicitados" value={newRequested} disabled={saving} inputProps={{ min: 1, step: 1 }} error={!!newRequested && (!Number.isSafeInteger(Number(newRequested)) || Number(newRequested) <= 0)} onChange={event => setNewRequested(event.target.value)} sx={{ width: { xs: '100%', md: 160 } }} />
          <Button variant="contained" disabled={saving || refreshing || refreshError || !selectedNewItem || !Number.isSafeInteger(Number(newRequested)) || Number(newRequested) <= 0} onClick={addItem} sx={{ minHeight: 40, whiteSpace: 'nowrap' }}>Agregar ítem</Button>
        </Stack>
        <Typography variant="caption" color="text.secondary">Ítems del mismo cliente con existencia y orden. Se proponen las producciones más antiguas; puedes ajustar sus cantidades antes de guardar.</Typography>
        {addedMessage && <Alert severity="success" onClose={() => setAddedMessage('')}>{addedMessage}</Alert>}
      </Stack>
      <Stack direction="row" gap={2}><TextField fullWidth size="small" label="Buscar ítem, orden, producción, finca o laguna" value={search} onChange={event => setSearch(event.target.value)} /><Button disabled={saving || refreshing} onClick={() => void refresh()} sx={{ minWidth: 180 }}>{refreshing ? 'Actualizando…' : 'Actualizar existencias'}</Button></Stack>
      {refreshError ? <Alert severity="error">No se pudieron actualizar las existencias. Los valores mostrados corresponden a la última consulta correcta. Pulsa Actualizar existencias para reintentar.</Alert> : <Typography variant="caption" color="text.secondary">Existencias consultadas a las {new Date(updatedAt).toLocaleTimeString('es-HN', { timeZone: 'America/Tegucigalpa' })}. Se actualizan cada 30 segundos.</Typography>}
      {error && <Alert severity="error">{error}</Alert>}
      {groups.map(group => {
        const assigned = sum(group.lots); const target = Number(requested[group.key]);
        const matchesItem = `${group.item.nombreItem} ${group.item.nombreCliente}`.toLocaleLowerCase().includes(needle);
        const lots = group.lots.filter(lot => !needle || matchesItem || [lot.item.noOrdenCompra, lot.item.codigoProduccion, lot.item.codigoExterno, lot.item.nombreFinca, lot.item.laguna, lot.item.fechaProduccion].join(' ').toLocaleLowerCase().includes(needle));
        if (needle && !matchesItem && !lots.length) return null;
        return <Accordion key={group.key} defaultExpanded disableGutters><AccordionSummary expandIcon={<ExpandMoreIcon />}><Stack><Typography fontWeight={700}>{group.item.nombreItem} · {group.item.nombreCliente} {added[group.key] && <Chip size="small" color="success" variant="outlined" label="Nuevo ítem" />}</Typography><Typography variant="caption" color={assigned > target ? 'error.main' : 'text.secondary'}>Solicitados: {target.toLocaleString()} · Asignados: {assigned.toLocaleString()} · Saldo total: {Math.max(0, group.inventoryTotal - assigned).toLocaleString()} · Disponibles por agregar: {group.lots.reduce((total, lot) => total + available(lot), 0).toLocaleString()} · Faltantes: {Math.max(0, target - assigned).toLocaleString()}</Typography></Stack></AccordionSummary><AccordionDetails><Stack spacing={1.5}>
          <Alert severity="info">Inventario total del ítem: {group.inventoryTotal.toLocaleString()} · En carga: {assigned.toLocaleString()} · Saldo total: {Math.max(0, group.inventoryTotal - assigned).toLocaleString()}. Se usan las mismas existencias de Inventario PT, incluyendo todos los estados y solo producciones con orden.</Alert>
          <Stack direction="row" spacing={2} alignItems="center" flexWrap="wrap">{added[group.key] && <Button color="error" size="small" disabled={saving} onClick={() => removeAddedItem(group)}>Quitar ítem nuevo</Button>}<TextField label="Seriales solicitados" size="small" type="number" value={requested[group.key]} disabled={saving} inputProps={{ min: 0, step: 1 }} onChange={event => setRequested(current => ({ ...current, [group.key]: event.target.value }))} /><Button disabled={saving || invalid} onClick={() => complete(group)}>Completar con los más antiguos</Button></Stack>
          <TableContainer sx={{ maxHeight: 340 }}><Table stickyHeader size="small"><TableHead><TableRow>{['Orden', 'Producción', 'Finca', 'Laguna', 'Fecha', 'Color', 'Estado', 'Inventario actual', 'Disponibles por agregar', 'En carga', 'No completar', ''].map(label => <TableCell key={label}>{label}</TableCell>)}</TableRow></TableHead><TableBody>{lots.map(lot => <TableRow key={lot.key} sx={{ bgcolor: amount(lot) > 0 ? 'action.hover' : undefined }}><TableCell>{lot.item.noOrdenCompra}</TableCell><TableCell>{lot.item.codigoProduccion || lot.item.codigoExterno}</TableCell><TableCell>{lot.item.nombreFinca || '—'}</TableCell><TableCell>{lot.item.laguna || '—'}</TableCell><TableCell sx={{ whiteSpace: 'nowrap' }}>{lot.item.fechaProduccion}</TableCell><TableCell>{lot.item.color || '—'}</TableCell><TableCell>{lot.item.disponibilidad}</TableCell><TableCell align="right">{lot.current.toLocaleString()}{!lot.current && lot.assigned > 0 && <Typography display="block" variant="caption">Asignación guardada: {lot.assigned}</Typography>}</TableCell><TableCell align="right">{available(lot).toLocaleString()}</TableCell><TableCell><TextField size="small" type="number" value={quantities[lot.key] ?? '0'} disabled={saving} error={!Number.isSafeInteger(amount(lot)) || amount(lot) < 0 || amount(lot) > lot.maximum} helperText={amount(lot) > lot.maximum ? `Máximo ${lot.maximum}` : undefined} inputProps={{ min: 0, max: lot.maximum, step: 1, 'aria-label': `Seriales producción ${lot.item.codigoProduccion || lot.item.codigoExterno}` }} onChange={event => { const value = event.target.value; setQuantities(current => ({ ...current, [lot.key]: value })); if (Number(value) < lot.assigned) setExcluded(current => ({ ...current, [lot.key]: true })); }} sx={{ width: 115 }} /></TableCell><TableCell><Checkbox checked={!!excluded[lot.key]} disabled={saving} inputProps={{ 'aria-label': `No completar producción ${lot.item.codigoProduccion || lot.item.codigoExterno}` }} onChange={(_, checked) => setExcluded(current => ({ ...current, [lot.key]: checked }))} /></TableCell><TableCell><Button size="small" disabled={saving || !amount(lot)} onClick={() => { setQuantities(current => ({ ...current, [lot.key]: '0' })); setExcluded(current => ({ ...current, [lot.key]: true })); }}>Quitar</Button></TableCell></TableRow>)}</TableBody></Table></TableContainer>
        </Stack></AccordionDetails></Accordion>;
      })}
      {invalid && <Alert severity="warning">Revisa las cantidades: usa seriales enteros y no asignes más de lo solicitado ni del máximo de cada producción.</Alert>}
      <TextField label="Código Embarque" required helperText="Obligatorio" value={notes} disabled={saving} inputProps={{ maxLength: 2000 }} onChange={event => setNotes(event.target.value)} />
      <TextField required label="Motivo del cambio" placeholder="Ej.: se reemplazan seriales que no se pudieron mandar." value={reason} disabled={saving} inputProps={{ maxLength: 2000 }} onChange={event => setReason(event.target.value)} />
      {!!data.edits.length && <Accordion disableGutters><AccordionSummary expandIcon={<ExpandMoreIcon />}>Cambios anteriores ({data.edits.length})</AccordionSummary><AccordionDetails><Stack spacing={1}>{data.edits.map(edit => <Typography key={edit.revision} variant="body2">Revisión {edit.revision} · {new Date(edit.createdAt).toLocaleString('es-HN', { timeZone: 'America/Tegucigalpa' })} · {edit.createdBy}: {edit.reason}</Typography>)}</Stack></AccordionDetails></Accordion>}
    </Stack></DialogContent>
    <DialogActions><Button disabled={saving} onClick={onClose}>Cancelar</Button><Button variant="contained" disabled={saving || refreshing || refreshError || invalid || !reason.trim() || !notes.trim()} onClick={() => void save()}>{saving ? 'Guardando…' : 'Guardar cambios'}</Button></DialogActions>
  </Dialog>;
}
