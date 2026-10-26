import { useCallback, useEffect, useState } from 'react';
import { Alert, Box, Button, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle, MenuItem, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TablePagination, TableRow, TextField, Typography } from '@mui/material';
import { apiClient } from '../../api/client';

interface Creditor { id: number; nombre: string }
interface Installment { numero: number; fechaVencimiento: string | null; capital: number | null; interes: number | null; cargos: number | null; monto: number | null }
interface ImportedLoan {
  acreedor: string; acreedorId: number | null; tipoAcreedor: string; moneda: string | null; monto: number | null;
  tasaAnual: number | null; frecuencia: string | null; fechaDesembolso: string | null; referencia: string;
  interesCapitalizado: number; cantidadCuotas: number | null; notas: string; advertencias: string[]; cuotas: Installment[];
}
interface Draft { id: string; archivoNombre: string; estado: string; revision: number; prestamoId: number | null; plan: ImportedLoan; errores: string[] }
interface Status { configurado: boolean; lectorConfigurado: boolean; vinculado: boolean; chatId: string | null }
const errorText = (error: unknown) => (error as { response?: { data?: { error?: string } } }).response?.data?.error ?? 'No se pudo completar la operación.';
const numeric = (value: string) => value === '' ? null : Number(value);
async function download(path: string, name: string) {
  const response = await apiClient.get(path, { responseType: 'blob' });
  const url = URL.createObjectURL(response.data), anchor = document.createElement('a');
  anchor.href = url; anchor.download = name; anchor.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export default function TelegramLoansDialog({ open, close, creditors, imported }: {
  open: boolean; close: () => void; creditors: Creditor[]; imported: () => void;
}) {
  const [status, setStatus] = useState<Status | null>(null);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [command, setCommand] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [page, setPage] = useState(0);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [connection, documents] = await Promise.all([apiClient.get<Status>('/prestamos/telegram/estado'), apiClient.get<Draft[]>('/prestamos/telegram/borradores')]);
      setStatus(connection.data); setDrafts(documents.data); setError('');
    } catch (e) { setError(errorText(e)); } finally { setLoading(false); }
  }, []);
  useEffect(() => { if (open) { setDraft(null); setDirty(false); setCommand(''); setNotice(''); void load(); } }, [open, load]);
  const action = async (task: () => Promise<void>) => {
    setBusy(true); setError('');
    try { await task(); } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  };
  const edit = (patch: Partial<ImportedLoan>) => { if (draft) { setDraft({ ...draft, plan: { ...draft.plan, ...patch } }); setDirty(true); } };
  const save = async () => {
    if (!draft) return;
    const response = await apiClient.put<Draft>(`/prestamos/telegram/borradores/${draft.id}`, { revision: draft.revision, plan: draft.plan });
    setDraft(response.data); setDirty(false); setNotice('Revisión guardada. Comprueba todas las cuotas antes de confirmar.');
  };
  const p = draft?.plan;
  const editable = draft?.estado === 'borrador';
  return <Dialog open={open} onClose={busy ? undefined : close} fullWidth maxWidth="lg">
    <DialogTitle>Planes de pago por Telegram</DialogTitle>
    <DialogContent dividers>
      <Stack spacing={1.5}>
        {error && <Alert severity="error" sx={{ whiteSpace: 'pre-line' }}>{error}</Alert>}
        {notice && <Alert severity="success">{notice}</Alert>}
        {loading && <CircularProgress size={24} />}
        {!draft && <>
          <Alert severity="info">Envía el PDF o la foto del plan al bot. Se crea un borrador para revisar; el préstamo se registra al confirmar, con las fechas e importes del documento y sin recalcular amortización.</Alert>
          {status && <Stack spacing={1}>
            <Typography variant="body2">{status.vinculado ? `Cuenta vinculada al chat ${status.chatId}.` : 'Vincula tu cuenta antes de enviar documentos al bot.'}</Typography>
            {!status.configurado && <Alert severity="warning">Falta configurar el token del bot en el servidor.</Alert>}
            {!status.lectorConfigurado && <Alert severity="warning">Falta configurar el lector de documentos.</Alert>}
            <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
              <Button variant="outlined" disabled={busy || !status.configurado} onClick={() => void action(async () => {
                const response = await apiClient.post<{ comando: string }>('/prestamos/telegram/vinculacion'); setCommand(response.data.comando);
              })}>{status.vinculado ? 'Generar nueva vinculación' : 'Vincular Telegram'}</Button>
              {status.vinculado && <Button color="error" disabled={busy} onClick={() => void action(async () => {
                await apiClient.delete('/prestamos/telegram/vinculacion'); setCommand(''); await load();
              })}>Desvincular</Button>}
              <Button disabled={busy || loading} onClick={() => void load()}>Actualizar documentos</Button>
            </Stack>
            {command && <Box><Typography variant="body2">Copia este comando al chat privado del bot. Vence en 10 minutos y se usa una sola vez.</Typography>
              <TextField fullWidth size="small" value={command} inputProps={{ readOnly: true }} />
              <Button size="small" onClick={() => void navigator.clipboard.writeText(command).catch(() => setError('Selecciona y copia el comando manualmente.'))}>Copiar comando</Button>
            </Box>}
          </Stack>}
          <Typography fontWeight={800}>Documentos recibidos</Typography>
          {!loading && !drafts.length && <Typography variant="body2" color="text.secondary">Todavía no hay documentos. Después de enviarlos al bot, pulsa Actualizar documentos.</Typography>}
          {drafts.map(item => <Stack key={item.id} direction="row" spacing={1} alignItems="center" useFlexGap flexWrap="wrap">
            <Typography variant="body2" sx={{ flex: 1 }}>{item.archivoNombre} · {item.plan.acreedor || 'Acreedor por completar'}</Typography>
            <Chip size="small" label={item.estado === 'registrado' ? `Registrado #${item.prestamoId}` : item.estado} />
            <Button size="small" onClick={() => { setDraft(item); setDirty(false); setPage(0); setNotice(''); }}>Revisar</Button>
          </Stack>)}
        </>}
        {draft && p && <>
          <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
            <Button disabled={busy || dirty} onClick={() => { setDraft(null); void load(); }}>Volver a documentos</Button>
            <Button disabled={busy} onClick={() => void action(() => download(`/prestamos/telegram/borradores/${draft.id}/documento`, draft.archivoNombre))}>Descargar original</Button>
          </Stack>
          <Typography fontWeight={800}>{draft.archivoNombre}</Typography>
          {draft.estado !== 'borrador' && <Alert severity="info">{draft.estado === 'registrado' ? `Este documento ya registró el préstamo #${draft.prestamoId}.` : 'Importación cancelada. El documento se conserva.'}</Alert>}
          {p.advertencias.map((warning, index) => <Alert key={index} severity="warning">{warning}</Alert>)}
          {draft.errores.length > 0 && <Alert severity="warning" sx={{ whiteSpace: 'pre-line' }}>{draft.errores.slice(0, 20).join('\n')}{draft.errores.length > 20 ? '\nHay más cuotas que revisar.' : ''}</Alert>}
          <Stack direction="row" useFlexGap flexWrap="wrap" gap={1.5}>
            <TextField select size="small" label="Acreedor existente" disabled={!editable} value={p.acreedorId ?? ''} sx={{ minWidth: 230 }} onChange={e => {
              const id = numeric(e.target.value); edit({ acreedorId: id, ...(id ? { acreedor: creditors.find(c => c.id === id)?.nombre ?? p.acreedor } : {}) });
            }}><MenuItem value="">Registrar el acreedor del documento</MenuItem>{creditors.map(c => <MenuItem key={c.id} value={c.id}>{c.nombre}</MenuItem>)}</TextField>
            {!p.acreedorId && <TextField size="small" label="Nombre del acreedor" disabled={!editable} value={p.acreedor} onChange={e => edit({ acreedor: e.target.value })} />}
            <TextField select size="small" label="Moneda" disabled={!editable} value={p.moneda ?? ''} sx={{ minWidth: 100 }} onChange={e => edit({ moneda: e.target.value || null })}><MenuItem value="">Completar</MenuItem><MenuItem value="HNL">HNL</MenuItem><MenuItem value="USD">USD</MenuItem></TextField>
            <TextField size="small" type="number" label="Monto recibido" disabled={!editable} value={p.monto ?? ''} inputProps={{ min: 0, step: '0.01' }} onChange={e => edit({ monto: numeric(e.target.value) })} />
            <TextField size="small" type="number" label="Tasa anual % del documento" disabled={!editable} value={p.tasaAnual ?? ''} inputProps={{ min: 0, max: 200, step: '0.0001' }} onChange={e => edit({ tasaAnual: numeric(e.target.value) })} />
            <TextField size="small" type="date" label="Fecha de desembolso" InputLabelProps={{ shrink: true }} disabled={!editable} value={p.fechaDesembolso ?? ''} onChange={e => edit({ fechaDesembolso: e.target.value || null })} />
            <TextField select size="small" label="Frecuencia informativa" helperText="No cambia las fechas de las cuotas" disabled={!editable} value={p.frecuencia ?? ''} sx={{ minWidth: 170 }} onChange={e => edit({ frecuencia: e.target.value || null })}><MenuItem value="">Completar</MenuItem>{['semanal','quincenal','mensual','trimestral','semestral','anual'].map(f => <MenuItem key={f} value={f}>{f}</MenuItem>)}</TextField>
            <TextField size="small" label="Referencia del préstamo" disabled={!editable} value={p.referencia} onChange={e => edit({ referencia: e.target.value })} />
            <TextField size="small" type="number" label="Interés capitalizado informado" disabled={!editable} value={p.interesCapitalizado} inputProps={{ min: 0, step: '0.01' }} onChange={e => edit({ interesCapitalizado: numeric(e.target.value) ?? 0 })} />
            <TextField size="small" type="number" label="Cuotas indicadas por el documento" disabled={!editable} value={p.cantidadCuotas ?? ''} inputProps={{ min: 1, max: 1000 }} onChange={e => edit({ cantidadCuotas: numeric(e.target.value) })} />
          </Stack>
          <Typography variant="body2">{p.cuotas.length} cuotas leídas. Revisa fechas, capital, intereses, cargos y total contra el original.</Typography>
          <TableContainer sx={{ maxHeight: 390 }}><Table size="small" stickyHeader>
            <TableHead><TableRow>{['#','Vencimiento','Capital','Interés','Cargos','Total del documento'].map(label => <TableCell key={label}>{label}</TableCell>)}</TableRow></TableHead>
            <TableBody>{p.cuotas.slice(page * 25, page * 25 + 25).map((row, offset) => <TableRow key={page * 25 + offset}>
              <TableCell sx={{ minWidth: 80 }}>{editable ? <TextField size="small" type="number" value={row.numero} inputProps={{ min: 1, max: 1000, 'aria-label': `Número de fila ${page * 25 + offset + 1}` }} onChange={e => { const cuotas = [...p.cuotas]; cuotas[page * 25 + offset] = { ...row, numero: Number(e.target.value) }; edit({ cuotas }); }} /> : row.numero}</TableCell>
              {(['fechaVencimiento','capital','interes','cargos','monto'] as const).map(field => <TableCell key={field} sx={{ minWidth: field === 'fechaVencimiento' ? 160 : 120 }}>
                <TextField size="small" fullWidth disabled={!editable} type={field === 'fechaVencimiento' ? 'date' : 'number'} value={row[field] ?? ''}
                  inputProps={{ 'aria-label': `${field} de cuota ${row.numero}`, ...(field === 'fechaVencimiento' ? {} : { min: 0, step: '0.01' }) }}
                  onChange={e => { const cuotas = [...p.cuotas]; cuotas[page * 25 + offset] = { ...row, [field]: field === 'fechaVencimiento' ? e.target.value || null : numeric(e.target.value) }; edit({ cuotas }); }} />
              </TableCell>)}
            </TableRow>)}</TableBody>
          </Table></TableContainer>
          <TablePagination component="div" count={p.cuotas.length} page={page} rowsPerPage={25} rowsPerPageOptions={[25]} onPageChange={(_event, next) => setPage(next)} labelDisplayedRows={({ from, to, count }) => `${from}–${to} de ${count}`} />
          {draft.estado === 'cancelado' && <Button disabled={busy} onClick={() => void action(async () => {
            const response = await apiClient.post<Draft>(`/prestamos/telegram/borradores/${draft.id}/reabrir`); setDraft(response.data); setPage(0);
          })}>Reabrir borrador</Button>}
          {editable && <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
            <Button variant="outlined" disabled={busy || !dirty} onClick={() => void action(save)}>Guardar revisión</Button>
            <Button variant="contained" disabled={busy || dirty || draft.errores.length > 0} onClick={() => void action(async () => {
              const response = await apiClient.post<{ id: number; numero?: string }>(`/prestamos/telegram/borradores/${draft.id}/confirmar`, { revision: draft.revision });
              setNotice(`Préstamo ${response.data.numero ?? '#' + response.data.id} registrado sin recalcular sus cuotas.`);
              setDraft((await apiClient.get<Draft>(`/prestamos/telegram/borradores/${draft.id}`)).data); imported();
            })}>Confirmar préstamo sin recalcular</Button>
            <Button color="error" disabled={busy} onClick={() => void action(async () => {
              await apiClient.delete(`/prestamos/telegram/borradores/${draft.id}`); setDraft(null); setDirty(false); await load();
            })}>Cancelar importación</Button>
          </Stack>}
          {dirty && <Typography variant="caption" color="text.secondary">Guarda la revisión para validar los cambios antes de confirmar.</Typography>}
        </>}
      </Stack>
    </DialogContent>
    <DialogActions><Button disabled={busy} onClick={close}>Cerrar</Button></DialogActions>
  </Dialog>;
}
