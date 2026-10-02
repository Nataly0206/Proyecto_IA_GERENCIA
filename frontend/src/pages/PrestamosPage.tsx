import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert, Box, Button, Card, CardContent, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle,
  IconButton, InputAdornment, MenuItem, Paper, Snackbar, Stack, Tab, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Tabs, TextField, ToggleButton, ToggleButtonGroup, Tooltip, Typography,
} from '@mui/material';
import AccountBalanceOutlinedIcon from '@mui/icons-material/AccountBalanceOutlined';
import AddOutlinedIcon from '@mui/icons-material/AddOutlined';
import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import PaymentsOutlinedIcon from '@mui/icons-material/PaymentsOutlined';
import SearchOutlinedIcon from '@mui/icons-material/SearchOutlined';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import { apiClient } from '../api/client';

// Control de deuda propia: préstamos que la empresa recibe de bancos y otros acreedores.

type TabKey = 'resumen' | 'acreedores' | 'prestamos' | 'reportes';
type Moneda = 'HNL' | 'USD';

interface Acreedor { id: number; nombre: string; tipo: string; contacto?: string; telefono?: string; prestamosActivos: number; saldoHNL: number; saldoUSD: number }
interface Prestamo {
  id: number; numero: string; referencia?: string; acreedor: string; moneda: Moneda; monto: number; tasaAnual: number;
  cantidadCuotas: number; frecuencia: string; tipoAmortizacion: string; fechaDesembolso: string; estado: string;
  saldoCapital: number; totalPendiente: number; cuotasPendientes: number; cuotasVencidas: number; vencido: number;
  capitalSinPagos: number; pagado: number; proximaFecha?: string; proximaCuota?: number;
}
interface ResumenMoneda { moneda: Moneda; prestamos: number; saldoCapital: number; totalPendiente: number; vencido: number; proximos30: number; capitalPagado: number; interesPagado: number; cargosPagados: number }
interface DeudaAcreedor { acreedorId: number; acreedor: string; moneda: Moneda; prestamos: number; montoOriginal: number; saldoCapital: number; totalPendiente: number; vencido: number; proximaFecha?: string }
interface AgendaRow { cuotaId: number; prestamoId: number; numero: string; acreedor: string; moneda: Moneda; cuota: number; fechaVencimiento: string; pendiente: number; diasAtraso: number }
interface Resumen { monedas: ResumenMoneda[]; porAcreedor: DeudaAcreedor[]; agenda: AgendaRow[] }
interface Cuota { id: number; numero: number; fechaVencimiento: string; capital: number; interes: number; cargos: number; monto: number; pagado: number; estado: string }
interface PagoRow { id: number; numero: string; tipo: string; fecha: string; monto: number; metodo: string; referencia?: string; creadoPor: string }
interface Detalle {
  prestamo: { id: number; numero: string; referencia?: string; acreedor: string; moneda: Moneda; monto: number; tasaAnual: number; frecuencia: string; tipoAmortizacion: string; fechaDesembolso: string; notas?: string; estado: string; creadoPor: string };
  cuotas: Cuota[]; pagos: PagoRow[]; diferenciaCapital: number;
}
interface ReporteRow { id: number; numero: string; tipo: string; fecha: string; acreedor: string; prestamo: string; referencia?: string; moneda: Moneda; monto: number; capital: number; interes: number; cargos: number; metodo: string; comprobante?: string; creadoPor: string }
interface Plan { totalInteres: number; totalCargos: number; totalPagar: number; primeraCuota: number; ultimaCuota: number }

const HEAD = { fontWeight: 800, bgcolor: '#f1f5f9', whiteSpace: 'nowrap' } as const;
const MONEDAS: Moneda[] = ['HNL', 'USD'];
const MONEDA_LABEL: Record<Moneda, string> = { HNL: 'Lempiras', USD: 'Dólares' };
const FRECUENCIAS = ['semanal', 'quincenal', 'mensual', 'trimestral', 'semestral', 'anual'];
const TIPOS_ACREEDOR = ['banco', 'cooperativa', 'financiera', 'proveedor', 'persona', 'otro'];
const TIPO_LABEL: Record<string, string> = { cuota_fija: 'Cuota nivelada', capital_fijo: 'Capital fijo', solo_interes: 'Solo interés + capital al final' };
const METODO_LABEL: Record<string, string> = { transferencia: 'Transferencia', debito_automatico: 'Débito automático', cheque: 'Cheque', efectivo: 'Efectivo', otro: 'Otro' };
const PAGO_LABEL: Record<string, string> = { cuota: 'Cuota', abono_capital: 'Abono a capital' };

const money = (v: unknown, moneda: Moneda = 'HNL') => new Intl.NumberFormat('es-HN', { style: 'currency', currency: moneda }).format(Number(v) || 0);
const formatDate = (v: unknown) => v ? new Date(`${String(v).slice(0, 10)}T00:00:00`).toLocaleDateString('es-HN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const apiError = (e: unknown) => (e as { response?: { data?: { error?: string } } })?.response?.data?.error || (e instanceof Error ? e.message : 'Ocurrió un error.');
const capitalize = (v: string) => v.charAt(0).toUpperCase() + v.slice(1);

function Metric({ label, value, color = '#176247' }: { label: string; value: string; color?: string }) {
  return (
    <Card sx={{ borderTop: `3px solid ${color}` }}>
      <CardContent sx={{ p: '12px !important' }}>
        <Typography variant="caption" fontWeight={800} color="text.secondary">{label.toUpperCase()}</Typography>
        <Typography variant="h6" fontWeight={900} sx={{ color }}>{value}</Typography>
      </CardContent>
    </Card>
  );
}

function Empty({ children }: { children: string }) { return <Alert severity="info" sx={{ py: 0.4 }}>{children}</Alert>; }

function Search({ value, setValue }: { value: string; setValue: (v: string) => void }) {
  return (
    <TextField size="small" value={value} onChange={(e) => setValue(e.target.value)} placeholder="Buscar acreedor, número o referencia"
      sx={{ width: { xs: '100%', sm: 360 } }}
      InputProps={{ startAdornment: <InputAdornment position="start"><SearchOutlinedIcon fontSize="small" /></InputAdornment> }} />
  );
}

function State({ loan }: { loan: Prestamo }) {
  const late = loan.estado === 'activo' && loan.cuotasVencidas > 0;
  return <Chip size="small" variant="outlined" color={loan.estado === 'pagado' ? 'success' : late ? 'warning' : 'primary'}
    label={loan.estado === 'pagado' ? 'Pagado' : late ? 'Con atraso' : 'Al día'} />;
}

export default function PrestamosPage() {
  const [tab, setTab] = useState<TabKey>('resumen');
  const [acreedores, setAcreedores] = useState<Acreedor[]>([]);
  const [prestamos, setPrestamos] = useState<Prestamo[]>([]);
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [search, setSearch] = useState('');
  const [creditorOpen, setCreditorOpen] = useState(false);
  const [loanOpen, setLoanOpen] = useState(false);
  const [payment, setPayment] = useState<Prestamo | null>(null);
  const [detailId, setDetailId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [a, p, r] = await Promise.all([
        apiClient.get<Acreedor[]>('/prestamos/acreedores'),
        apiClient.get<Prestamo[]>('/prestamos'),
        apiClient.get<Resumen>('/prestamos/resumen'),
      ]);
      setAcreedores(a.data); setPrestamos(p.data); setResumen(r.data); setError('');
    } catch (e) { setError(apiError(e)); } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const done = (message: string) => { setNotice(message); setCreditorOpen(false); setLoanOpen(false); setPayment(null); void load(); };
  const payById = (id: number) => { const loan = prestamos.find((p) => p.id === id); if (loan) setPayment(loan); };

  if (loading && !resumen) return <Stack height="100%" alignItems="center" justifyContent="center"><CircularProgress /></Stack>;

  return (
    <Stack spacing={1.4} sx={{ height: '100%', minHeight: 0, overflowY: 'auto', pb: 2 }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'stretch', sm: 'center' }} spacing={1}>
        <Box>
          <Typography variant="h6" fontWeight={900}>Préstamos</Typography>
          <Typography variant="caption" color="text.secondary">Lo que debemos a bancos y acreedores, sus cuotas y pagos</Typography>
        </Box>
        <Stack direction="row" spacing={1}>
          <Button variant="outlined" startIcon={<AccountBalanceOutlinedIcon />} onClick={() => setCreditorOpen(true)}>Nuevo acreedor</Button>
          <Button variant="contained" startIcon={<AddOutlinedIcon />} disabled={!acreedores.length} onClick={() => setLoanOpen(true)}>Nuevo préstamo</Button>
        </Stack>
      </Stack>
      {error && <Alert severity="error" onClose={() => setError('')}>{error}</Alert>}
      <Paper variant="outlined">
        <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" scrollButtons="auto"
          sx={{ minHeight: 42, '& .MuiTab-root': { minHeight: 42, fontSize: 12, fontWeight: 800 } }}>
          <Tab value="resumen" label="Resumen" />
          <Tab value="acreedores" label="Acreedores" />
          <Tab value="prestamos" label="Préstamos" />
          <Tab value="reportes" label="Pagos realizados" />
        </Tabs>
      </Paper>
      {tab === 'resumen' && <Summary data={resumen} pay={payById} />}
      {tab === 'acreedores' && <Creditors rows={acreedores} search={search} setSearch={setSearch} />}
      {tab === 'prestamos' && <Loans rows={prestamos} search={search} setSearch={setSearch} pay={setPayment} detail={setDetailId} />}
      {tab === 'reportes' && <Reports onError={setError} />}
      <CreditorDialog open={creditorOpen} close={() => setCreditorOpen(false)} done={() => done('Acreedor registrado correctamente.')} />
      <LoanDialog open={loanOpen} close={() => setLoanOpen(false)} creditors={acreedores} done={done} />
      <PaymentDialog loan={payment} close={() => setPayment(null)} done={done} />
      <DetailDialog id={detailId} close={() => setDetailId(null)} changed={() => void load()} />
      <Snackbar open={Boolean(notice)} autoHideDuration={4000} onClose={() => setNotice('')} message={notice} />
    </Stack>
  );
}

function Summary({ data, pay }: { data: Resumen | null; pay: (prestamoId: number) => void }) {
  if (!data?.monedas.length) return <Empty>Aún no hay préstamos registrados. Crea un acreedor y luego registra el préstamo.</Empty>;
  return (
    <Stack spacing={1.4}>
      {data.monedas.map((m) => (
        <Box key={m.moneda}>
          <Typography variant="caption" fontWeight={800} color="text.secondary">
            {MONEDA_LABEL[m.moneda].toUpperCase()} · {m.prestamos} préstamo{m.prestamos === 1 ? '' : 's'} activo{m.prestamos === 1 ? '' : 's'}
          </Typography>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2,1fr)', lg: 'repeat(6,1fr)' }, gap: 1, mt: 0.5 }}>
            <Metric label="Deuda de capital" value={money(m.saldoCapital, m.moneda)} color="#164a8b" />
            <Metric label="Total por pagar" value={money(m.totalPendiente, m.moneda)} color="#164a8b" />
            <Metric label="Próximos 30 días" value={money(m.proximos30, m.moneda)} />
            <Metric label="Vencido" value={money(m.vencido, m.moneda)} color={m.vencido > 0 ? '#b45309' : '#176247'} />
            <Metric label="Capital pagado" value={money(m.capitalPagado, m.moneda)} />
            <Metric label="Intereses pagados" value={money(m.interesPagado, m.moneda)} />
          </Box>
        </Box>
      ))}
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' }, gap: 1.4 }}>
        <Paper variant="outlined" sx={{ p: 1.4 }}>
          <Typography fontWeight={800} mb={1}>Deuda por acreedor</Typography>
          <TableContainer sx={{ maxHeight: 340 }}>
            <Table size="small" stickyHeader>
              <TableHead><TableRow>
                <TableCell sx={HEAD}>Acreedor</TableCell>
                <TableCell sx={HEAD} align="right">Préstamos</TableCell>
                <TableCell sx={HEAD} align="right">Deuda de capital</TableCell>
                <TableCell sx={HEAD} align="right">Total por pagar</TableCell>
                <TableCell sx={HEAD}>Próxima cuota</TableCell>
              </TableRow></TableHead>
              <TableBody>
                {data.porAcreedor.map((r) => (
                  <TableRow key={`${r.acreedorId}-${r.moneda}`} hover>
                    <TableCell sx={{ fontWeight: 700 }}>{r.acreedor}</TableCell>
                    <TableCell align="right">{r.prestamos}</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 800 }}>{money(r.saldoCapital, r.moneda)}</TableCell>
                    <TableCell align="right">{money(r.totalPendiente, r.moneda)}</TableCell>
                    <TableCell>{formatDate(r.proximaFecha)}{r.vencido > 0 && <Chip size="small" color="warning" label="Vencida" sx={{ ml: 0.5 }} />}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
        <Paper variant="outlined" sx={{ p: 1.4 }}>
          <Typography fontWeight={800} mb={1}>Cuotas vencidas y de los próximos 30 días</Typography>
          {!data.agenda.length ? <Empty>No hay cuotas vencidas ni por vencer en 30 días.</Empty> : (
            <TableContainer sx={{ maxHeight: 340 }}>
              <Table size="small">
                <TableBody>
                  {data.agenda.map((r) => (
                    <TableRow key={r.cuotaId}>
                      <TableCell>
                        <Typography fontWeight={700} fontSize={13}>{r.acreedor}</Typography>
                        <Typography variant="caption">{r.numero} · cuota {r.cuota}</Typography>
                      </TableCell>
                      <TableCell>
                        <Typography fontSize={13}>{formatDate(r.fechaVencimiento)}</Typography>
                        {r.diasAtraso > 0 && <Typography variant="caption" color="warning.main">{r.diasAtraso} días de atraso</Typography>}
                      </TableCell>
                      <TableCell align="right"><Typography fontWeight={800}>{money(r.pendiente, r.moneda)}</Typography></TableCell>
                      <TableCell align="right"><Button size="small" onClick={() => pay(r.prestamoId)}>Pagar</Button></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          )}
        </Paper>
      </Box>
    </Stack>
  );
}

function Creditors({ rows, search, setSearch }: { rows: Acreedor[]; search: string; setSearch: (v: string) => void }) {
  const list = rows.filter((a) => `${a.nombre} ${a.tipo} ${a.contacto ?? ''}`.toLowerCase().includes(search.toLowerCase()));
  return (
    <Stack spacing={1}>
      <Search value={search} setValue={setSearch} />
      {!list.length ? <Empty>No hay acreedores registrados.</Empty> : (
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead><TableRow>
              <TableCell sx={HEAD}>Acreedor</TableCell>
              <TableCell sx={HEAD}>Tipo</TableCell>
              <TableCell sx={HEAD}>Contacto</TableCell>
              <TableCell sx={HEAD} align="right">Préstamos activos</TableCell>
              <TableCell sx={HEAD} align="right">Deuda en lempiras</TableCell>
              <TableCell sx={HEAD} align="right">Deuda en dólares</TableCell>
            </TableRow></TableHead>
            <TableBody>
              {list.map((a) => (
                <TableRow key={a.id} hover>
                  <TableCell sx={{ fontWeight: 700 }}>{a.nombre}</TableCell>
                  <TableCell>{capitalize(a.tipo)}</TableCell>
                  <TableCell>{[a.contacto, a.telefono].filter(Boolean).join(' · ') || '—'}</TableCell>
                  <TableCell align="right">{a.prestamosActivos}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 800 }}>{money(a.saldoHNL, 'HNL')}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 800 }}>{money(a.saldoUSD, 'USD')}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Stack>
  );
}

function Loans({ rows, search, setSearch, pay, detail }: { rows: Prestamo[]; search: string; setSearch: (v: string) => void; pay: (p: Prestamo) => void; detail: (id: number) => void }) {
  const list = useMemo(() => rows.filter((p) => `${p.numero} ${p.referencia ?? ''} ${p.acreedor}`.toLowerCase().includes(search.toLowerCase())), [rows, search]);
  const headers = ['Préstamo', 'Acreedor', 'Monto recibido', 'Tasa anual', 'Deuda de capital', 'Total por pagar', 'Próxima cuota', 'Estado', 'Acciones'];
  const right = ['Monto recibido', 'Tasa anual', 'Deuda de capital', 'Total por pagar', 'Acciones'];
  return (
    <Stack spacing={1}>
      <Search value={search} setValue={setSearch} />
      {!list.length ? <Empty>No hay préstamos registrados.</Empty> : (
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead><TableRow>{headers.map((x) => <TableCell key={x} sx={HEAD} align={right.includes(x) ? 'right' : 'left'}>{x}</TableCell>)}</TableRow></TableHead>
            <TableBody>
              {list.map((p) => (
                <TableRow key={p.id} hover>
                  <TableCell>
                    <Typography fontWeight={800} fontSize={13}>{p.numero}</Typography>
                    {p.referencia && <Typography variant="caption">Ref. {p.referencia}</Typography>}
                  </TableCell>
                  <TableCell>{p.acreedor}</TableCell>
                  <TableCell align="right">{money(p.monto, p.moneda)}</TableCell>
                  <TableCell align="right">{Number(p.tasaAnual).toFixed(2)}%</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 800 }}>{money(p.saldoCapital, p.moneda)}</TableCell>
                  <TableCell align="right">{money(p.totalPendiente, p.moneda)}</TableCell>
                  <TableCell>
                    {p.proximaFecha ? <><Typography fontSize={13}>{formatDate(p.proximaFecha)}</Typography><Typography variant="caption">{money(p.proximaCuota, p.moneda)}</Typography></> : '—'}
                  </TableCell>
                  <TableCell><State loan={p} /></TableCell>
                  <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                    <Tooltip title="Ver calendario y pagos"><IconButton size="small" onClick={() => detail(p.id)}><VisibilityOutlinedIcon fontSize="small" /></IconButton></Tooltip>
                    {p.estado === 'activo' && <Button size="small" onClick={() => pay(p)}>Pagar</Button>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Stack>
  );
}

function CreditorDialog({ open, close, done }: { open: boolean; close: () => void; done: () => void }) {
  const empty = { nombre: '', tipo: 'banco', contacto: '', telefono: '', notas: '' };
  const [form, setForm] = useState(empty);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true);
    try { await apiClient.post('/prestamos/acreedores', form); setForm(empty); setError(''); done(); }
    catch (x) { setError(apiError(x)); } finally { setBusy(false); }
  };
  return (
    <Dialog open={open} onClose={close} maxWidth="sm" fullWidth>
      <Box component="form" onSubmit={submit}>
        <DialogTitle>Nuevo acreedor</DialogTitle>
        <DialogContent>
          <Stack spacing={1.2} pt={0.5}>
            {error && <Alert severity="error">{error}</Alert>}
            <Box sx={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 1 }}>
              <TextField size="small" required label="Nombre del banco o acreedor" value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
              <TextField size="small" select label="Tipo" value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value })}>
                {TIPOS_ACREEDOR.map((x) => <MenuItem key={x} value={x}>{capitalize(x)}</MenuItem>)}
              </TextField>
            </Box>
            <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
              <TextField size="small" label="Ejecutivo o contacto" value={form.contacto} onChange={(e) => setForm({ ...form, contacto: e.target.value })} />
              <TextField size="small" label="Teléfono" value={form.telefono} onChange={(e) => setForm({ ...form, telefono: e.target.value })} />
            </Box>
            <TextField size="small" multiline rows={2} label="Notas" value={form.notas} onChange={(e) => setForm({ ...form, notas: e.target.value })} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={close}>Cancelar</Button>
          <Button type="submit" variant="contained" disabled={busy}>{busy ? 'Guardando…' : 'Guardar acreedor'}</Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}

function LoanDialog({ open, close, creditors, done }: { open: boolean; close: () => void; creditors: Acreedor[]; done: (m: string) => void }) {
  const [form, setForm] = useState({
    acreedorId: '', referencia: '', moneda: 'HNL' as Moneda, monto: '', tasaAnual: '', cantidadCuotas: '12', frecuencia: 'mensual',
    tipoAmortizacion: 'cuota_fija', fechaDesembolso: today(), fechaPrimeraCuota: today(), cargoCuota: '0', notas: '',
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [plan, setPlan] = useState<Plan | null>(null);
  const set = (key: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [key]: e.target.value });
  const payload = useMemo(() => ({
    ...form, acreedorId: Number(form.acreedorId), monto: Number(form.monto), tasaAnual: Number(form.tasaAnual),
    cantidadCuotas: Number(form.cantidadCuotas), cargoCuota: Number(form.cargoCuota),
  }), [form]);

  // La simulación la calcula el backend con la misma función que genera el calendario real.
  useEffect(() => {
    if (!open || !(payload.monto > 0) || !(payload.cantidadCuotas > 0) || form.tasaAnual === '') { setPlan(null); return undefined; }
    const timer = setTimeout(() => {
      apiClient.post<Plan>('/prestamos/simular', payload).then((r) => setPlan(r.data)).catch(() => setPlan(null));
    }, 350);
    return () => clearTimeout(timer);
  }, [open, payload, form.tasaAnual]);

  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true);
    try {
      const { data } = await apiClient.post<{ prestamo: { numero: string } }>('/prestamos', payload);
      setError(''); done(`${data.prestamo.numero} registrado con su calendario de cuotas.`);
    } catch (x) { setError(apiError(x)); } finally { setBusy(false); }
  };
  const lines: [string, string][] = plan ? [
    ['Capital recibido', money(payload.monto, form.moneda)],
    ['Intereses', money(plan.totalInteres, form.moneda)],
    ['Seguros y comisiones', money(plan.totalCargos, form.moneda)],
    ['Total a pagar', money(plan.totalPagar, form.moneda)],
    ['Primera cuota', money(plan.primeraCuota, form.moneda)],
    ['Última cuota', money(plan.ultimaCuota, form.moneda)],
  ] : [];
  return (
    <Dialog open={open} onClose={close} maxWidth="md" fullWidth>
      <Box component="form" onSubmit={submit}>
        <DialogTitle>Registrar préstamo recibido</DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1.5fr .8fr' }, gap: 2, pt: 0.5 }}>
            <Stack spacing={1.1}>
              {error && <Alert severity="error">{error}</Alert>}
              <TextField size="small" required select label="Banco o acreedor" value={form.acreedorId} onChange={set('acreedorId')}>
                {creditors.map((c) => <MenuItem key={c.id} value={c.id}>{c.nombre}</MenuItem>)}
              </TextField>
              <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
                <TextField size="small" label="N.º de préstamo del banco" value={form.referencia} onChange={set('referencia')} />
                <TextField size="small" select label="Moneda" value={form.moneda} onChange={set('moneda')}>
                  {MONEDAS.map((x) => <MenuItem key={x} value={x}>{MONEDA_LABEL[x]}</MenuItem>)}
                </TextField>
                <TextField size="small" required type="number" label="Monto recibido" inputProps={{ min: 0.01, step: 0.01 }} value={form.monto} onChange={set('monto')} />
                <TextField size="small" required type="number" label="Tasa anual (%)" inputProps={{ min: 0, step: 0.0001 }} value={form.tasaAnual} onChange={set('tasaAnual')} />
                <TextField size="small" required type="number" label="Cantidad de cuotas" inputProps={{ min: 1, step: 1 }} value={form.cantidadCuotas} onChange={set('cantidadCuotas')} />
                <TextField size="small" select label="Frecuencia de pago" value={form.frecuencia} onChange={set('frecuencia')}>
                  {FRECUENCIAS.map((x) => <MenuItem key={x} value={x}>{capitalize(x)}</MenuItem>)}
                </TextField>
                <TextField size="small" select label="Amortización" value={form.tipoAmortizacion} onChange={set('tipoAmortizacion')}>
                  {Object.entries(TIPO_LABEL).map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}
                </TextField>
                <TextField size="small" type="number" label="Seguro y comisiones por cuota" inputProps={{ min: 0, step: 0.01 }} value={form.cargoCuota} onChange={set('cargoCuota')} />
                <TextField size="small" type="date" label="Desembolso" InputLabelProps={{ shrink: true }} value={form.fechaDesembolso} onChange={set('fechaDesembolso')} />
                <TextField size="small" type="date" label="Primera cuota" InputLabelProps={{ shrink: true }} value={form.fechaPrimeraCuota} onChange={set('fechaPrimeraCuota')} />
              </Box>
              <TextField size="small" label="Notas o garantía" value={form.notas} onChange={set('notas')} />
            </Stack>
            <Paper variant="outlined" sx={{ p: 1.5, bgcolor: '#f6f8f7', alignSelf: 'start' }}>
              <Typography fontWeight={900}>Simulación</Typography>
              {!plan ? <Typography variant="body2" color="text.secondary" mt={1}>Ingresa monto, tasa y cuotas para ver el plan.</Typography>
                : lines.map(([a, b]) => <Stack key={a} direction="row" justifyContent="space-between" mt={1}><Typography variant="body2">{a}</Typography><b>{b}</b></Stack>)}
              <Alert severity="info" sx={{ mt: 1.5, fontSize: 11 }}>
                La tasa anual se divide entre los pagos del año. Después de guardar puedes ajustar cada cuota para que coincida con la tabla del banco.
              </Alert>
            </Paper>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={close}>Cancelar</Button>
          <Button type="submit" variant="contained" disabled={busy}>{busy ? 'Guardando…' : 'Registrar préstamo'}</Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}

function PaymentDialog({ loan, close, done }: { loan: Prestamo | null; close: () => void; done: (m: string) => void }) {
  const [kind, setKind] = useState<'cuota' | 'abono'>('cuota');
  const [amount, setAmount] = useState('');
  const [date, setDate] = useState(today());
  const [method, setMethod] = useState('transferencia');
  const [reference, setReference] = useState('');
  const [mode, setMode] = useState<'cuota' | 'plazo'>('cuota');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    setKind('cuota'); setAmount(loan?.proximaCuota ? Number(loan.proximaCuota).toFixed(2) : ''); setDate(today()); setReference(''); setError('');
  }, [loan]);
  if (!loan) return null;
  const limit = kind === 'cuota' ? loan.totalPendiente : loan.capitalSinPagos;
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true);
    const body = { monto: Number(amount), fecha: date, metodo: method, referencia: reference };
    try {
      if (kind === 'cuota') {
        const { data } = await apiClient.post<{ pago: { numero: string; pendiente: number; liquidado: boolean } }>(`/prestamos/${loan.id}/pagos`, body);
        done(data.pago.liquidado ? `${data.pago.numero} registrado. Préstamo liquidado.` : `${data.pago.numero} registrado. Quedan ${money(data.pago.pendiente, loan.moneda)} por pagar.`);
      } else {
        const { data } = await apiClient.post<{ pago: { numero: string; capitalRestante: number; cuotasRestantes: number } }>(`/prestamos/${loan.id}/abonos`, { ...body, modo: mode });
        done(`${data.pago.numero} registrado. Se recalcularon ${data.pago.cuotasRestantes} cuotas sobre ${money(data.pago.capitalRestante, loan.moneda)}.`);
      }
    } catch (x) { setError(apiError(x)); } finally { setBusy(false); }
  };
  return (
    <Dialog open onClose={close} maxWidth="xs" fullWidth>
      <Box component="form" onSubmit={submit}>
        <DialogTitle>Registrar pago al acreedor</DialogTitle>
        <DialogContent>
          <Stack spacing={1.3} pt={0.5}>
            {error && <Alert severity="error">{error}</Alert>}
            <Box>
              <Typography fontWeight={800}>{loan.acreedor}</Typography>
              <Typography variant="caption">{loan.numero} · deuda de capital {money(loan.saldoCapital, loan.moneda)}</Typography>
            </Box>
            <ToggleButtonGroup size="small" exclusive fullWidth value={kind} onChange={(_, v) => { if (v) { setKind(v); setAmount(v === 'cuota' && loan.proximaCuota ? Number(loan.proximaCuota).toFixed(2) : ''); } }}>
              <ToggleButton value="cuota">Pago de cuota</ToggleButton>
              <ToggleButton value="abono">Abono a capital</ToggleButton>
            </ToggleButtonGroup>
            <TextField autoFocus size="small" required type="number" label="Monto pagado" inputProps={{ min: 0.01, max: limit, step: 0.01 }}
              value={amount} onChange={(e) => setAmount(e.target.value)}
              helperText={kind === 'cuota' ? `Se aplica desde la cuota más antigua. Máximo ${money(limit, loan.moneda)}.` : `Reduce el capital de las cuotas sin pagos. Máximo ${money(limit, loan.moneda)}.`} />
            {kind === 'abono' && (
              <TextField size="small" select label="Efecto del abono" value={mode} onChange={(e) => setMode(e.target.value as 'cuota' | 'plazo')}
                helperText="Las cuotas sin pagos se recalculan con la tasa del préstamo; los ajustes manuales de interés en ellas se pierden.">
                <MenuItem value="cuota">Reducir la cuota y mantener el plazo</MenuItem>
                <MenuItem value="plazo">Reducir el plazo y mantener la cuota</MenuItem>
              </TextField>
            )}
            <TextField size="small" required type="date" label="Fecha del pago" InputLabelProps={{ shrink: true }} value={date} onChange={(e) => setDate(e.target.value)} />
            <TextField size="small" select label="Forma de pago" value={method} onChange={(e) => setMethod(e.target.value)}>
              {Object.entries(METODO_LABEL).map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}
            </TextField>
            <TextField size="small" label="N.º de comprobante" value={reference} onChange={(e) => setReference(e.target.value)} />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={close}>Cancelar</Button>
          <Button type="submit" variant="contained" disabled={busy} startIcon={<PaymentsOutlinedIcon />}>{busy ? 'Registrando…' : 'Confirmar pago'}</Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}

function DetailDialog({ id, close, changed }: { id: number | null; close: () => void; changed: () => void }) {
  const [data, setData] = useState<Detalle | null>(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<Cuota | null>(null);
  const fetchDetail = useCallback(async () => {
    if (id === null) { setData(null); return; }
    try { setData((await apiClient.get<Detalle>(`/prestamos/${id}`)).data); setError(''); } catch (e) { setError(apiError(e)); }
  }, [id]);
  useEffect(() => { void fetchDetail(); }, [fetchDetail]);
  const loan = data?.prestamo;
  const m = loan?.moneda ?? 'HNL';
  const editable = loan?.estado === 'activo';
  return (
    <Dialog open={id !== null} onClose={close} maxWidth="lg" fullWidth>
      <DialogTitle>Calendario del préstamo</DialogTitle>
      <DialogContent>
        {error && <Alert severity="error">{error}</Alert>}
        {data && loan && (
          <Stack spacing={1.2}>
            <Box>
              <Typography fontWeight={900}>{loan.numero} · {loan.acreedor}{loan.referencia ? ` · Ref. ${loan.referencia}` : ''}</Typography>
              <Typography variant="caption" color="text.secondary">
                {money(loan.monto, m)} al {Number(loan.tasaAnual).toFixed(2)}% anual · {TIPO_LABEL[loan.tipoAmortizacion]} · pago {loan.frecuencia} · desembolso {formatDate(loan.fechaDesembolso)} · registrado por {loan.creadoPor}
              </Typography>
            </Box>
            {Math.abs(data.diferenciaCapital) > 0.01 && (
              <Alert severity="warning" sx={{ py: 0.4 }}>
                El capital del calendario más los abonos difiere del monto recibido en {money(data.diferenciaCapital, m)}. Revisa las cuotas editadas.
              </Alert>
            )}
            <TableContainer sx={{ maxHeight: 360 }}>
              <Table size="small" stickyHeader>
                <TableHead><TableRow>
                  {['#', 'Vencimiento', 'Capital', 'Interés', 'Seguro y comis.', 'Cuota', 'Pagado', 'Estado', ''].map((x) => (
                    <TableCell key={x} sx={HEAD} align={['#', 'Capital', 'Interés', 'Seguro y comis.', 'Cuota', 'Pagado'].includes(x) ? 'right' : 'left'}>{x}</TableCell>
                  ))}
                </TableRow></TableHead>
                <TableBody>
                  {data.cuotas.map((q) => (
                    <TableRow key={q.id}>
                      <TableCell align="right">{q.numero}</TableCell>
                      <TableCell>{formatDate(q.fechaVencimiento)}</TableCell>
                      <TableCell align="right">{money(q.capital, m)}</TableCell>
                      <TableCell align="right">{money(q.interes, m)}</TableCell>
                      <TableCell align="right">{money(q.cargos, m)}</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 800 }}>{money(q.monto, m)}</TableCell>
                      <TableCell align="right">{money(q.pagado, m)}</TableCell>
                      <TableCell><Chip size="small" color={q.estado === 'pagada' ? 'success' : q.estado === 'parcial' ? 'warning' : 'default'} label={capitalize(q.estado)} /></TableCell>
                      <TableCell align="right" sx={{ py: 0 }}>
                        {editable && Number(q.pagado) === 0 && (
                          <Tooltip title="Ajustar a la tabla del banco"><IconButton size="small" onClick={() => setEditing(q)}><EditOutlinedIcon fontSize="small" /></IconButton></Tooltip>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
            <Typography fontWeight={800}>Pagos realizados</Typography>
            {!data.pagos.length ? <Empty>Aún no se han registrado pagos de este préstamo.</Empty> : (
              <TableContainer sx={{ maxHeight: 220 }}>
                <Table size="small" stickyHeader>
                  <TableHead><TableRow>
                    {['Pago', 'Fecha', 'Tipo', 'Monto', 'Forma de pago', 'Comprobante', 'Registrado por'].map((x) => <TableCell key={x} sx={HEAD} align={x === 'Monto' ? 'right' : 'left'}>{x}</TableCell>)}
                  </TableRow></TableHead>
                  <TableBody>
                    {data.pagos.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell sx={{ fontWeight: 700 }}>{p.numero}</TableCell>
                        <TableCell>{formatDate(p.fecha)}</TableCell>
                        <TableCell>{PAGO_LABEL[p.tipo] ?? p.tipo}</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 800 }}>{money(p.monto, m)}</TableCell>
                        <TableCell>{METODO_LABEL[p.metodo] ?? p.metodo}</TableCell>
                        <TableCell>{p.referencia || '—'}</TableCell>
                        <TableCell>{p.creadoPor}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </Stack>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={() => window.print()}>Imprimir</Button>
        <Button onClick={close}>Cerrar</Button>
      </DialogActions>
      {loan && <InstallmentDialog loanId={loan.id} cuota={editing} close={() => setEditing(null)} done={() => { setEditing(null); void fetchDetail(); changed(); }} />}
    </Dialog>
  );
}

function InstallmentDialog({ loanId, cuota, close, done }: { loanId: number; cuota: Cuota | null; close: () => void; done: () => void }) {
  const [form, setForm] = useState({ fechaVencimiento: '', capital: '', interes: '', cargos: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    if (cuota) setForm({ fechaVencimiento: cuota.fechaVencimiento, capital: String(cuota.capital), interes: String(cuota.interes), cargos: String(cuota.cargos) });
    setError('');
  }, [cuota]);
  const submit = async (e: FormEvent) => {
    e.preventDefault(); if (!cuota) return; setBusy(true);
    try {
      await apiClient.put(`/prestamos/${loanId}/cuotas/${cuota.id}`, { fechaVencimiento: form.fechaVencimiento, capital: Number(form.capital), interes: Number(form.interes), cargos: Number(form.cargos) });
      done();
    } catch (x) { setError(apiError(x)); } finally { setBusy(false); }
  };
  const field = (key: 'capital' | 'interes' | 'cargos', label: string) => (
    <TextField size="small" required type="number" label={label} inputProps={{ min: 0, step: 0.01 }} value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })} />
  );
  return (
    <Dialog open={Boolean(cuota)} onClose={close} maxWidth="xs" fullWidth>
      <Box component="form" onSubmit={submit}>
        <DialogTitle>Ajustar cuota {cuota?.numero}</DialogTitle>
        <DialogContent>
          <Stack spacing={1.2} pt={0.5}>
            {error && <Alert severity="error">{error}</Alert>}
            <TextField size="small" required type="date" label="Vencimiento" InputLabelProps={{ shrink: true }} value={form.fechaVencimiento} onChange={(e) => setForm({ ...form, fechaVencimiento: e.target.value })} />
            {field('capital', 'Capital')}
            {field('interes', 'Interés')}
            {field('cargos', 'Seguro y comisiones')}
            <Typography variant="body2">Cuota total: <b>{(Number(form.capital) + Number(form.interes) + Number(form.cargos)).toFixed(2)}</b></Typography>
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={close}>Cancelar</Button>
          <Button type="submit" variant="contained" disabled={busy}>{busy ? 'Guardando…' : 'Guardar cuota'}</Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}

function Reports({ onError }: { onError: (message: string) => void }) {
  const [range, setRange] = useState({ desde: `${today().slice(0, 8)}01`, hasta: today() });
  const [rows, setRows] = useState<ReporteRow[]>([]);
  const reload = useCallback(async () => {
    try { setRows((await apiClient.get<ReporteRow[]>('/prestamos/reporte', { params: range })).data); } catch (e) { onError(apiError(e)); }
  }, [range, onError]);
  useEffect(() => { void reload(); }, [reload]);
  const totals = MONEDAS.map((moneda) => {
    const list = rows.filter((r) => r.moneda === moneda);
    const sum = (key: 'monto' | 'capital' | 'interes' | 'cargos') => list.reduce((s, r) => s + Number(r[key]), 0);
    return { moneda, count: list.length, monto: sum('monto'), capital: sum('capital'), interes: sum('interes'), cargos: sum('cargos') };
  }).filter((t) => t.count > 0);
  const download = () => {
    const cell = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const header = ['Fecha', 'Pago', 'Acreedor', 'Préstamo', 'Referencia', 'Tipo', 'Moneda', 'Monto', 'Capital', 'Interés', 'Seguro y comisiones', 'Forma de pago', 'Comprobante', 'Registrado por'];
    const lines = rows.map((r) => [r.fecha, r.numero, r.acreedor, r.prestamo, r.referencia, PAGO_LABEL[r.tipo] ?? r.tipo, r.moneda, r.monto, r.capital, r.interes, r.cargos, METODO_LABEL[r.metodo] ?? r.metodo, r.comprobante, r.creadoPor].map(cell).join(','));
    const url = URL.createObjectURL(new Blob([`﻿${[header.map(cell).join(','), ...lines].join('\n')}`], { type: 'text/csv' }));
    const a = document.createElement('a'); a.href = url; a.download = `pagos-prestamos-${range.desde}-${range.hasta}.csv`; a.click(); URL.revokeObjectURL(url);
  };
  return (
    <Stack spacing={1}>
      <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
        <TextField size="small" type="date" label="Desde" InputLabelProps={{ shrink: true }} value={range.desde} onChange={(e) => setRange({ ...range, desde: e.target.value })} />
        <TextField size="small" type="date" label="Hasta" InputLabelProps={{ shrink: true }} value={range.hasta} onChange={(e) => setRange({ ...range, hasta: e.target.value })} />
        <Button startIcon={<DownloadOutlinedIcon />} onClick={download} disabled={!rows.length}>Exportar CSV</Button>
      </Stack>
      {totals.map((t) => (
        <Box key={t.moneda} sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2,1fr)', lg: 'repeat(4,1fr)' }, gap: 1 }}>
          <Metric label={`Pagado en ${MONEDA_LABEL[t.moneda].toLowerCase()}`} value={money(t.monto, t.moneda)} color="#164a8b" />
          <Metric label="A capital" value={money(t.capital, t.moneda)} />
          <Metric label="A intereses" value={money(t.interes, t.moneda)} />
          <Metric label="A seguros y comisiones" value={money(t.cargos, t.moneda)} />
        </Box>
      ))}
      {!rows.length ? <Empty>No hay pagos en el periodo.</Empty> : (
        <TableContainer component={Paper} variant="outlined">
          <Table size="small">
            <TableHead><TableRow>
              {['Fecha', 'Pago', 'Acreedor', 'Préstamo', 'Tipo', 'Monto', 'Capital', 'Interés', 'Seguro y comis.', 'Registrado por'].map((x) => (
                <TableCell key={x} sx={HEAD} align={['Monto', 'Capital', 'Interés', 'Seguro y comis.'].includes(x) ? 'right' : 'left'}>{x}</TableCell>
              ))}
            </TableRow></TableHead>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.id} hover>
                  <TableCell>{formatDate(r.fecha)}</TableCell>
                  <TableCell sx={{ fontWeight: 700 }}>{r.numero}</TableCell>
                  <TableCell>{r.acreedor}</TableCell>
                  <TableCell>{r.prestamo}</TableCell>
                  <TableCell>{PAGO_LABEL[r.tipo] ?? r.tipo}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 800 }}>{money(r.monto, r.moneda)}</TableCell>
                  <TableCell align="right">{money(r.capital, r.moneda)}</TableCell>
                  <TableCell align="right">{money(r.interes, r.moneda)}</TableCell>
                  <TableCell align="right">{money(r.cargos, r.moneda)}</TableCell>
                  <TableCell>{r.creadoPor}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Stack>
  );
}
