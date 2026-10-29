import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Autocomplete, Button, Checkbox, Chip, FormControlLabel, Dialog, DialogActions, DialogContent, DialogTitle, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography } from '@mui/material';
import { useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../api/client';
import { itemKey, StockItem } from '../types/preload';
import { requestedWeight } from '../utils/preloadWeight';
import { convertKilograms, WeightUnit } from '../utils/weightUnits';

const hasOrder = (item: StockItem) => !!item.noOrdenCompra.trim() && !['sin orden', '0'].includes(item.noOrdenCompra.trim().toLowerCase());

export default function LoadRequestDialog({ items, filters, weightUnit, onClose, onCreated }: {
  items: StockItem[]; filters: Record<string, string[]>; weightUnit: WeightUnit; onClose: () => void; onCreated: () => void;
}) {
  const cache = useQueryClient();
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState('');
  const manualCode = useRef('');
  const [followPrevious, setFollowPrevious] = useState(false);
  const [codeLoading, setCodeLoading] = useState(false);
  const [codeError, setCodeError] = useState('');
  const [previousCode, setPreviousCode] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [deduction, setDeduction] = useState<{ id: number; revision: number } | null>(null);
  const [adjustedItems, setAdjustedItems] = useState<StockItem[] | null>(null);
  const [deducting, setDeducting] = useState(false);
  const allGroups = useMemo(() => {
    const grouped = new Map<string, { key: string; item: StockItem; quantity: number; weight: number; lots: StockItem[] }>();
    (adjustedItems ?? items).filter(item => hasOrder(item) && item.disponibilidad === 'DISPONIBLE' && item.cantidadSerial > 0 && Number.isFinite(item.pesoKilos) && item.pesoKilos >= 0).forEach(item => {
      const key = itemKey(item);
      const group = grouped.get(key) ?? { key, item, quantity: 0, weight: 0, lots: [] };
      group.quantity += item.cantidadSerial;
      group.weight += item.pesoKilos;
      group.lots.push(item);
      grouped.set(key, group);
    });
    return [...grouped.values()].sort((a, b) => a.item.nombreCliente.localeCompare(b.item.nombreCliente) || a.item.nombreItem.localeCompare(b.item.nombreItem));
  }, [items, adjustedItems]);
  const clients = useMemo(() => [...new Set(items.filter(item => hasOrder(item) && item.disponibilidad === 'DISPONIBLE' && item.cantidadSerial > 0).map(item => item.nombreCliente))].sort((a, b) => a.localeCompare(b)), [items]);
  const [selectedClient, setSelectedClient] = useState<string | null>(() => {
    const available = [...new Set(items.filter(item => hasOrder(item) && item.disponibilidad === 'DISPONIBLE' && item.cantidadSerial > 0).map(item => item.nombreCliente))];
    return available.length === 1 ? available[0] : null;
  });
  useEffect(() => {
    if (!followPrevious || !selectedClient) { setCodeLoading(false); return; }
    const controller = new AbortController();
    let active = true;
    setCodeLoading(true); setCodeError(''); setPreviousCode('');
    apiClient.get<{ previous: string; code: string }>('/inventory/preloads/next-shipping-code', { params: { client: selectedClient }, signal: controller.signal })
      .then(({ data }) => { if (active) { setNotes(data.code); setPreviousCode(data.previous); } })
      .catch(err => {
        if (!active) return;
        setCodeError(err.response?.data?.error ?? 'No se pudo buscar el correlativo. Intenta nuevamente o ingresa el código manualmente.');
        setFollowPrevious(false); setNotes(manualCode.current);
      })
      .finally(() => { if (active) setCodeLoading(false); });
    return () => { active = false; controller.abort(); };
  }, [followPrevious, selectedClient]);
  const groups = allGroups.filter(group => group.item.nombreCliente === selectedClient);
  const selected = groups.filter(group => Number(quantities[group.key]) > 0);
  const invalid = groups.some(group => {
    const value = quantities[group.key];
    return !!value && (!Number.isSafeInteger(Number(value)) || Number(value) < 0);
  });
  const kg = (value: number) => value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const preview = selected.map(group => ({ ...group, requested: Number(quantities[group.key]), requestedKg: requestedWeight(group.lots, Number(quantities[group.key])) }));
  const totalKg = preview.reduce((sum, group) => sum + group.requestedKg, 0);
  const subtractLatest = async () => {
    if (!selectedClient || deducting || deduction) return;
    setDeducting(true); setError('');
    try {
      const { data } = await apiClient.get<{ load: { id: number; revision: number }; items: StockItem[] }>('/inventory/preloads/latest-client', { params: { client: selectedClient } });
      setAdjustedItems(data.items.filter(item => Object.entries(filters).every(([field, values]) => field === 'nombreCliente' || !values.length || values.includes(String(item[field])))));
      setDeduction(data.load); setQuantities({});
    } catch (err: any) { setError(err.response?.data?.error ?? 'No se pudo rebajar la última carga. Intenta nuevamente.'); }
    finally { setDeducting(false); }
  };
  const submit = async () => {
    if (saving || deducting || codeLoading || invalid || !selected.length || !notes.trim()) return;
    setSaving(true); setError('');
    try {
      await apiClient.post('/inventory/preloads', { filters: { ...filters, nombreCliente: selectedClient ? [selectedClient] : [] }, notes, ...(deduction ? { subtractLoad: deduction } : {}), lines: selected.map(group => ({ key: group.key, quantity: Number(quantities[group.key]) })) });
      await cache.invalidateQueries({ queryKey: ['preloads'] });
      onCreated();
    } catch (err: any) { setError(err.response?.data?.error ?? 'No se pudo guardar la solicitud. Intenta nuevamente.'); }
    finally { setSaving(false); }
  };
  return <Dialog open onClose={() => { if (!saving) onClose(); }} fullWidth maxWidth="lg">
    <DialogTitle>Solicitar carga</DialogTitle>
    <DialogContent dividers><Stack spacing={2}>
      <Typography color="text.secondary">Escribe cuántos seriales necesitas de cada producto. Los kg de la carga se calculan al instante, tomando primero la producción más antigua dentro de los filtros actuales.</Typography>
      <Stack direction="row" gap={1} flexWrap="wrap">{Object.entries(filters).filter(([, values]) => values.length).map(([field, values]) => <Chip key={field} size="small" label={values.join(', ')} />)}</Stack>
      <Stack direction="row" spacing={1.5} alignItems="flex-start" sx={{ overflowX: 'auto', pt: 0.5, pb: 1 }}>
        <Autocomplete sx={{ flex: '1 0 200px', minWidth: 200 }} options={clients} value={selectedClient} disabled={saving || deducting} onChange={(_, client) => { setSelectedClient(client); setFollowPrevious(false); setCodeLoading(false); setNotes(''); manualCode.current = ''; setCodeError(''); setPreviousCode(''); setQuantities({}); setError(''); setDeduction(null); setAdjustedItems(null); }} renderInput={params => <TextField {...params} label="Cliente" placeholder="Selecciona un cliente" size="small" />} />
        <Button variant="outlined" size="small" sx={{ height: 40, flexShrink: 0, whiteSpace: 'nowrap' }} disabled={!selectedClient || saving || deducting || !!deduction} onClick={() => void subtractLatest()}>{deducting ? 'Rebajando…' : 'Rebajar última carga del cliente'}</Button>
        <TextField label="Código Embarque" size="small" required sx={{ flex: '1 0 190px', minWidth: 190 }} value={notes} disabled={saving || codeLoading || followPrevious} error={!!codeError} helperText={codeLoading ? 'Buscando último código…' : codeError || (previousCode && followPrevious ? `Anterior: ${previousCode}` : 'Obligatorio')} inputProps={{ maxLength: 2000 }} onChange={event => { setNotes(event.target.value); manualCode.current = event.target.value; setCodeError(''); }} />
        <FormControlLabel sx={{ flexShrink: 0, height: 40, m: 0, whiteSpace: 'nowrap', '& .MuiFormControlLabel-label': { fontSize: 13 } }} control={<Checkbox size="small" checked={followPrevious} disabled={saving || !selectedClient} onChange={(_, checked) => { setCodeError(''); setPreviousCode(''); setFollowPrevious(checked); setCodeLoading(checked); if (checked) manualCode.current = notes; else setNotes(manualCode.current); }} />} label="Seguir correlativo anterior" />
      </Stack>
      {deduction && <Button disabled={saving} onClick={() => { setDeduction(null); setAdjustedItems(null); setQuantities({}); setError(''); }}>Restablecer inventario</Button>}
      {deduction && <Alert severity="success">Inventario mostrado descontando los seriales asignados de la carga #{deduction.id}. La rebaja también se aplica al calcular esta solicitud.</Alert>}
      <Alert severity="info">Solo producto con estado DISPONIBLE. Si la cantidad no alcanza, se guarda la carga parcial con el faltante. No reserva ni descuenta inventario.</Alert>
      {error && <Alert severity="error">{error}</Alert>}
      {!selectedClient ? <Alert severity="info">Selecciona un cliente para ver sus ítems disponibles.</Alert> : !groups.length ? <Alert severity="warning">No hay producto disponible para este cliente con los filtros seleccionados.</Alert> : <TableContainer sx={{ maxHeight: '50vh' }}><Table stickyHeader size="small"><TableHead><TableRow>
        {['Ítem', 'Orden de compra', 'Talla', 'Disponibles', `Peso ${weightUnit}`, 'Seriales a solicitar', 'Kg asignados'].map(label => <TableCell key={label}>{label}</TableCell>)}
      </TableRow></TableHead><TableBody>{groups.map(group => {
        const value = quantities[group.key] ?? '';
        const bad = !!value && (!Number.isSafeInteger(Number(value)) || Number(value) < 0);
        return <TableRow key={group.key}><TableCell>{group.item.nombreItem}</TableCell><TableCell>{[...new Set(group.lots.map(lot => lot.noOrdenCompra.trim()))].sort((a, b) => a.localeCompare(b, 'es', { numeric: true })).join(', ')}</TableCell><TableCell>{group.item.talla}</TableCell><TableCell align="right">{group.quantity.toLocaleString()}</TableCell><TableCell align="right">{convertKilograms(group.weight, weightUnit).toLocaleString('en-US', { maximumFractionDigits: 2 })}</TableCell><TableCell><TextField size="small" type="number" value={value} disabled={saving} error={bad} helperText={bad ? 'Ingresa un número entero positivo' : undefined} inputProps={{ min: 0, step: 1, 'aria-label': `Seriales de ${group.item.codigoItem} para ${group.item.nombreCliente}` }} onChange={event => setQuantities(current => ({ ...current, [group.key]: event.target.value }))} sx={{ width: 150 }} /></TableCell><TableCell align="right" sx={{ fontWeight: 800, color: bad ? 'error.main' : 'primary.main', whiteSpace: 'nowrap' }}>{bad ? '—' : kg(requestedWeight(group.lots, Number(value)))} kg</TableCell></TableRow>;
      })}</TableBody></Table></TableContainer>}
      {preview.length > 0 && <Stack spacing={1}>
        <Typography variant="subtitle1" fontWeight={800}>Resumen de la carga</Typography>
        {invalid ? <Alert severity="warning">Corrige las cantidades para ver el peso total de la carga.</Alert> : <TableContainer sx={{ border: 1, borderColor: 'divider', borderRadius: 1 }}><Table size="small">
          <TableHead><TableRow sx={{ '& th': { bgcolor: 'primary.main', color: 'primary.contrastText', fontWeight: 800 } }}><TableCell>Producto</TableCell><TableCell align="right">Kg asignados</TableCell><TableCell align="right">Solicitados</TableCell><TableCell align="right">Asignados</TableCell></TableRow></TableHead>
          <TableBody>{preview.map(group => <TableRow key={group.key}><TableCell><Typography variant="body2" fontWeight={700}>{group.item.nombreItem}</Typography></TableCell><TableCell align="right">{kg(group.requestedKg)}</TableCell><TableCell align="right">{group.requested.toLocaleString()}</TableCell><TableCell align="right">{Math.min(group.requested, group.quantity).toLocaleString()}</TableCell></TableRow>)}
            <TableRow sx={{ bgcolor: 'action.hover', '& td': { fontWeight: 800 } }}><TableCell>Total de la carga</TableCell><TableCell align="right">{kg(totalKg)}</TableCell><TableCell align="right">{preview.reduce((sum, group) => sum + group.requested, 0).toLocaleString()}</TableCell><TableCell align="right">{preview.reduce((sum, group) => sum + Math.min(group.requested, group.quantity), 0).toLocaleString()}</TableCell></TableRow>
          </TableBody>
        </Table></TableContainer>}
        <Typography variant="caption" color="text.secondary">Peso estimado según los lotes más antiguos. Se valida nuevamente al enviar. Los masters pueden agrupar varios seriales.</Typography>
      </Stack>}

      <Typography fontWeight={700}>{selected.length} ítems · {selected.reduce((sum, group) => sum + Number(quantities[group.key]), 0).toLocaleString()} seriales solicitados</Typography>
    </Stack></DialogContent>
    <DialogActions><Button onClick={onClose} disabled={saving}>Cancelar</Button><Button variant="contained" disabled={saving || deducting || codeLoading || invalid || !selected.length || !notes.trim()} onClick={() => void submit()}>{saving ? 'Guardando…' : 'Guardar carga'}</Button></DialogActions>
  </Dialog>;
}
