import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert, Box, Button, Card, CardContent, Chip, CircularProgress, Dialog, DialogActions, DialogContent, DialogTitle,
  IconButton, InputAdornment, MenuItem, Paper, Snackbar, Stack, Tab, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Tabs, TextField, ToggleButton, ToggleButtonGroup, Tooltip, Typography,
} from '@mui/material';
import AccountBalanceOutlinedIcon from '@mui/icons-material/AccountBalanceOutlined';
import AddOutlinedIcon from '@mui/icons-material/AddOutlined';
import DownloadOutlinedIcon from '@mui/icons-material/DownloadOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import PaymentsOutlinedIcon from '@mui/icons-material/PaymentsOutlined';
import SearchOutlinedIcon from '@mui/icons-material/SearchOutlined';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import { apiClient } from '../api/client';
import GroupedNumberField from '../components/prestamos/GroupedNumberField';
import TelegramLoansDialog from '../components/prestamos/TelegramLoansDialog';
import AmortizacionOptions, { OpcionesPlan, TIPO_LABEL, TIPOS_NUEVOS, BASE_LABEL, FRECUENCIA_LABEL, opcionesIniciales, descripcionOpciones, descuadreCapital } from '../components/prestamos/AmortizacionOptions';

// Control de deuda propia: préstamos que la empresa recibe de bancos y otros acreedores.

type TabKey = 'resumen' | 'acreedores' | 'prestamos' | 'flujo' | 'reportes';
type Moneda = 'HNL' | 'USD';

interface Acreedor { id: number; nombre: string; tipo: string; contacto?: string; telefono?: string; notas?: string; prestamosActivos: number; saldoHNL: number; saldoUSD: number }
interface Prestamo {
  id: number; numero: string; referencia?: string; acreedor: string; moneda: Moneda; monto: number; tasaAnual: number;
  cantidadCuotas: number; frecuencia: string; tipoAmortizacion: string; fechaDesembolso: string; estado: string;
  saldoCapital: number; totalPendiente: number; cuotasPendientes: number; cuotasVencidas: number; vencido: number;
  capitalSinPagos: number; permiteReducirPlazo: boolean; pagado: number; proximaFecha?: string; proximaCuota?: number;
}
interface ResumenMoneda { moneda: Moneda; prestamos: number; saldoCapital: number; totalPendiente: number; vencido: number; proximos30: number; totalPagado: number; capitalPagado: number; interesPagado: number; cargosPagados: number }
interface DeudaAcreedor { acreedorId: number; acreedor: string; moneda: Moneda; prestamos: number; montoOriginal: number; pagado: number; saldoCapital: number; totalPendiente: number; vencido: number; proximaFecha?: string }
interface AgendaRow { cuotaId: number; prestamoId: number; numero: string; acreedor: string; moneda: Moneda; cuota: number; fechaVencimiento: string; pendiente: number; diasAtraso: number }
interface Resumen { monedas: ResumenMoneda[]; porAcreedor: DeudaAcreedor[]; agenda: AgendaRow[] }
interface Cuota { id: number; numero: number; fechaVencimiento: string; capital: number; interes: number; cargos: number; monto: number; pagado: number; estado: string; concepto?: string; interesDiferido?: number }
interface PagoRow { id: number; numero: string; tipo: string; fecha: string; monto: number; metodo: string; referencia?: string; creadoPor: string }
interface Detalle {
  prestamo: { id: number; numero: string; referencia?: string; acreedor: string; moneda: Moneda; monto: number; tasaAnual: number; frecuencia: string; tipoAmortizacion: string; baseCalculo: string; fechaDesembolso: string; notas?: string; estado: string; creadoPor: string; origen?: string; opciones: OpcionesPlan; interesCapitalizado: number };
  cuotas: Cuota[]; historialCuotas: (Cuota & { reemplazadaEn: string; reemplazadaPor: string; motivo: string })[]; pagos: PagoRow[]; diferenciaCapital: number;
}
interface ReporteRow { id: number; numero: string; tipo: string; fecha: string; acreedor: string; prestamo: string; referencia?: string; moneda: Moneda; monto: number; capital: number; interes: number; cargos: number; metodo: string; comprobante?: string; creadoPor: string }
interface Plan { totalInteres: number; interesCapitalizado: number; capitalFinanciado: number; totalCargos: number; totalPagar: number; primeraCuota: number; ultimaCuota: number; cuotas: (Cuota & { saldo: number; concepto: string; dias?: number; tasaAnualAplicada?: number; semanaIso?: number })[] }
interface SemanaCuota { cuotaId: number; prestamoId: number; numero: string; referencia?: string; acreedor: string; moneda: Moneda; cuota: number; totalCuotas: number; fechaVencimiento: string; capital: number; interes: number; cargos: number; pendiente: number; vencida: boolean }
interface SemanaActual {
  semanaIso: number; anioIso: number; desde: string; hasta: string; hoy: string; cuotas: SemanaCuota[];
  porAcreedor: { acreedorId: number; acreedor: string; moneda: Moneda; cuotas: number; semana: number; vencido: number; saldoCapital: number }[];
  totales: { moneda: Moneda; cuotas: number; semana: number; vencido: number }[];
}
interface FlujoRow { anioIso: number; semanaIso: number; mesNombre: string; banco: string; moneda: Moneda; cuotas: number; capital: number; interes: number; cargos: number; total: number; pendiente: number; desde: string; hasta: string }

const HEAD = { fontWeight: 800, bgcolor: '#f1f5f9', whiteSpace: 'nowrap' } as const;
const MONEDAS: Moneda[] = ['HNL', 'USD'];
const MONEDA_LABEL: Record<Moneda, string> = { HNL: 'Lempiras', USD: 'Dólares' };
const TIPOS_ACREEDOR = ['banco', 'cooperativa', 'financiera', 'proveedor', 'persona', 'otro'];
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
  const [telegramOpen, setTelegramOpen] = useState(false);
  const [tab, setTab] = useState<TabKey>('resumen');
  const [acreedores, setAcreedores] = useState<Acreedor[]>([]);
  const [prestamos, setPrestamos] = useState<Prestamo[]>([]);
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [semana, setSemana] = useState<SemanaActual | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [search, setSearch] = useState('');
  const [creditorOpen, setCreditorOpen] = useState(false);
  const [editingCreditor, setEditingCreditor] = useState<Acreedor | null>(null);
  const [loanOpen, setLoanOpen] = useState(false);
  const [payment, setPayment] = useState<Prestamo | null>(null);
  const [detailId, setDetailId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [a, p, r, w] = await Promise.all([
        apiClient.get<Acreedor[]>('/prestamos/acreedores'),
        apiClient.get<Prestamo[]>('/prestamos'),
        apiClient.get<Resumen>('/prestamos/resumen'),
        apiClient.get<SemanaActual>('/prestamos/semana-actual'),
      ]);
      setAcreedores(a.data); setPrestamos(p.data); setResumen(r.data); setSemana(w.data); setError('');
    } catch (e) { setError(apiError(e)); } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const done = (message: string) => { setNotice(message); setCreditorOpen(false); setEditingCreditor(null); setLoanOpen(false); setPayment(null); void load(); };
  const payById = (id: number) => { const loan = prestamos.find((p) => p.id === id); if (loan) setPayment(loan); };

  if (loading && !resumen) return <Stack height="100%" alignItems="center" justifyContent="center"><CircularProgress /></Stack>;

  return (
    <Stack spacing={1.4} sx={{ height: '100%', minHeight: 0, overflowY: 'auto', pb: 2 }}>
      <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'stretch', sm: 'center' }} spacing={1}>
        <Box>
          <Typography variant="h6" fontWeight={900}>Préstamos</Typography>
          <Typography variant="caption" color="text.secondary">Lo que debemos a bancos y acreedores, sus cuotas y pagos</Typography>
        </Box>
        <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
          <Button variant="outlined" startIcon={<AccountBalanceOutlinedIcon />} onClick={() => { setEditingCreditor(null); setCreditorOpen(true); }}>Nuevo acreedor</Button>
          <Button variant="contained" startIcon={<AddOutlinedIcon />} disabled={!acreedores.length} onClick={() => setLoanOpen(true)}>Nuevo préstamo</Button>
        </Stack>
      </Stack>
      {error && <Alert severity="error" onClose={() => setError('')} action={<Button color="inherit" size="small" onClick={() => void load()} disabled={loading}>Reintentar</Button>}>{error}</Alert>}
      <Paper variant="outlined">
        <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" scrollButtons="auto"
          sx={{ minHeight: 42, '& .MuiTab-root': { minHeight: 42, fontSize: 12, fontWeight: 800 } }}>
          <Tab value="resumen" label="Resumen" />
          <Tab value="acreedores" label="Acreedores" />
          <Tab value="prestamos" label="Préstamos" />
          <Tab value="flujo" label="Flujo semanal" />
          <Tab value="reportes" label="Pagos realizados" />
        </Tabs>
      </Paper>
      {tab === 'resumen' && <><WeekPayments data={semana} pay={payById} /><Summary data={resumen} pay={payById} /></>}
      {tab === 'acreedores' && <Creditors rows={acreedores} search={search} setSearch={setSearch} edit={(a) => { setEditingCreditor(a); setCreditorOpen(true); }} done={done} />}
      {tab === 'prestamos' && <Loans rows={prestamos} search={search} setSearch={setSearch} pay={setPayment} detail={setDetailId} done={done} />}
      {tab === 'flujo' && <WeeklyFlow onError={setError} />}
      {tab === 'reportes' && <Reports onError={setError} />}
      <TelegramLoansDialog open={telegramOpen} close={() => { setTelegramOpen(false); void load(); }} creditors={acreedores} imported={() => void load()} />
      <CreditorDialog open={creditorOpen} creditor={editingCreditor} close={() => setCreditorOpen(false)} done={() => done(editingCreditor ? 'Acreedor actualizado correctamente.' : 'Acreedor registrado correctamente.')} />
      <LoanDialog open={loanOpen} close={() => setLoanOpen(false)} creditors={acreedores} done={done} />
      <PaymentDialog loan={payment} close={() => setPayment(null)} done={done} />
      <DetailDialog id={detailId} close={() => setDetailId(null)} changed={() => void load()} />
      <Snackbar open={Boolean(notice)} autoHideDuration={4000} onClose={() => setNotice('')} message={notice} />
    </Stack>
  );
}

/** Agenda semanal compacta: qué toca pagar esta semana y lo atrasado de semanas anteriores. */
function WeekPayments({ data, pay }: { data: SemanaActual | null; pay: (prestamoId: number) => void }) {
  const [verAtrasadas, setVerAtrasadas] = useState(() => { try { return localStorage.getItem('prestamos.verAtrasadas') !== '0'; } catch { return true; } });
  useEffect(() => { try { localStorage.setItem('prestamos.verAtrasadas', verAtrasadas ? '1' : '0'); } catch { /* sin almacenamiento */ } }, [verAtrasadas]);
  if (!data) return <Alert severity="warning">No se pudo cargar la agenda semanal.</Alert>;
  const actuales = data.cuotas.filter((q) => !q.vencida);
  const anteriores = data.cuotas.filter((q) => q.vencida);
  const renderCuotas = (cuotas: SemanaCuota[], color: string) => (
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', md: 'repeat(4, minmax(0, 1fr))', xl: 'repeat(6, minmax(0, 1fr))' }, gap: 1 }}>
      {cuotas.map((q) => (
        <Tooltip key={q.cuotaId} title={`Vence el ${formatDate(q.fechaVencimiento)} · clic para registrar el pago`}>
          <Paper variant="outlined" onClick={() => pay(q.prestamoId)}
            sx={{ px: 1.2, py: 0.8, borderLeft: `3px solid ${q.fechaVencimiento === data.hoy ? '#c62828' : color}`, cursor: 'pointer', '&:hover': { bgcolor: '#f8fafc' } }}>
            <Typography variant="body2" fontWeight={800} noWrap>{q.acreedor}</Typography>
            <Typography variant="caption" color="text.secondary" noWrap component="div">{q.numero}</Typography>
            <Typography fontWeight={900} fontSize={15}>{money(q.pendiente, q.moneda)}</Typography>
          </Paper>
        </Tooltip>
      ))}
    </Box>
  );
  const vencido = data.totales.filter((t) => t.vencido > 0).map((t) => money(t.vencido, t.moneda)).join(' · ');
  return (
    <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2 }}>
      <Stack spacing={1.2}>
        <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'flex-start', sm: 'center' }} spacing={1}>
          <Box>
            <Typography fontWeight={900}>Semana {data.semanaIso} · toca pagar {actuales.length} cuota{actuales.length === 1 ? '' : 's'}</Typography>
            <Typography variant="caption" color="text.secondary">Del {formatDate(data.desde)} al {formatDate(data.hasta)}</Typography>
          </Box>
          <Stack direction="row" spacing={2}>
            {data.totales.map((t) => (
              <Box key={t.moneda} textAlign={{ sm: 'right' }}>
                <Typography variant="caption" color="text.secondary" fontWeight={700}>{MONEDA_LABEL[t.moneda]}</Typography>
                <Typography fontWeight={900} color="#164a8b">{money(t.semana, t.moneda)}</Typography>
              </Box>
            ))}
          </Stack>
        </Stack>
        {actuales.length ? renderCuotas(actuales, '#164a8b') : <Empty>No hay cuotas pendientes esta semana.</Empty>}
        {anteriores.length > 0 && <>
          <Stack direction="row" alignItems="center" spacing={1}>
            <Typography variant="body2" fontWeight={800} color="warning.dark">
              Atrasadas de semanas anteriores · {anteriores.length} cuota{anteriores.length === 1 ? '' : 's'}{vencido && ` · ${vencido}`}
            </Typography>
            <Button size="small" onClick={() => setVerAtrasadas((v) => !v)} sx={{ minWidth: 0, py: 0 }}>
              {verAtrasadas ? 'Ocultar' : 'Mostrar'}
            </Button>
          </Stack>
          {verAtrasadas && renderCuotas(anteriores, '#d97706')}
        </>}
      </Stack>
    </Paper>
  );
}

function Summary({ data, pay }: { data: Resumen | null; pay: (prestamoId: number) => void }) {
  const [banco, setBanco] = useState('');
  const bancos = useMemo(() => Array.from(new Set((data?.porAcreedor ?? []).map((r) => r.acreedor))).sort(), [data]);
  if (!data) return <Alert severity="warning">No se pudo cargar el resumen de préstamos. Reintenta la carga para consultar los saldos.</Alert>;
  if (!data.monedas.length) return <Empty>No hay saldos ni pagos para mostrar. Puedes consultar los préstamos registrados en la pestaña Préstamos.</Empty>;
  const filas = banco ? data.porAcreedor.filter((r) => r.acreedor === banco) : data.porAcreedor;
  const agenda = banco ? data.agenda.filter((r) => r.acreedor === banco) : data.agenda;
  // Con un banco seleccionado, los totales salen de sus filas; sin filtro, del resumen general.
  const totales = banco
    ? MONEDAS.map((moneda) => {
      const rs = filas.filter((r) => r.moneda === moneda);
      const sum = (k: 'totalPendiente' | 'pagado' | 'saldoCapital' | 'vencido') => rs.reduce((acc, r) => acc + Number(r[k]), 0);
      return rs.length ? { moneda, prestamos: rs.reduce((a, r) => a + r.prestamos, 0), totalPendiente: sum('totalPendiente'), totalPagado: sum('pagado'), saldoCapital: sum('saldoCapital'), vencido: sum('vencido') } : null;
    }).filter((t) => t !== null)
    : data.monedas;
  return (
    <Paper variant="outlined" sx={{ p: 1.5, borderRadius: 2 }}>
      <Stack spacing={1.5}>
        <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'stretch', sm: 'center' }} spacing={1}>
          <Box>
            <Typography fontWeight={900}>Cuánto debemos</Typography>
            <Typography variant="caption" color="text.secondary">Total por pagar = capital + intereses + cargos pendientes</Typography>
          </Box>
          <TextField select size="small" label="Banco / acreedor" value={banco} onChange={(e) => setBanco(e.target.value)} sx={{ minWidth: 260 }}>
            <MenuItem value="">Todos</MenuItem>
            {bancos.map((b) => <MenuItem key={b} value={b}>{b}</MenuItem>)}
          </TextField>
        </Stack>
        {totales.map((m) => (
          <Box key={m.moneda}>
            <Typography variant="caption" fontWeight={800} color="text.secondary">
              {MONEDA_LABEL[m.moneda].toUpperCase()} · {m.prestamos} préstamo{m.prestamos === 1 ? '' : 's'} activo{m.prestamos === 1 ? '' : 's'}
            </Typography>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2,1fr)', lg: 'repeat(4,minmax(0,1fr))' }, gap: 1, mt: 0.5 }}>
              <Metric label="Total por pagar" value={money(m.totalPendiente, m.moneda)} color="#164a8b" />
              <Metric label="Deuda de capital" value={money(m.saldoCapital, m.moneda)} color="#164a8b" />
              <Metric label="Vencido" value={money(m.vencido, m.moneda)} color={m.vencido > 0 ? '#b45309' : '#176247'} />
              <Metric label="Total pagado" value={money(m.totalPagado, m.moneda)} />
            </Box>
          </Box>
        ))}
        {!banco && (
          <TableContainer sx={{ maxHeight: 340 }}>
            <Table size="small" stickyHeader>
              <TableHead><TableRow>
                <TableCell sx={HEAD}>Acreedor</TableCell>
                <TableCell sx={HEAD} align="right">Activos</TableCell>
                <TableCell sx={HEAD}>Moneda</TableCell>
                <TableCell sx={HEAD} align="right">Total por pagar</TableCell>
                <TableCell sx={HEAD} align="right">Deuda de capital</TableCell>
                <TableCell sx={HEAD} align="right">Total pagado</TableCell>
                <TableCell sx={HEAD}>Próxima cuota</TableCell>
              </TableRow></TableHead>
              <TableBody>
                {filas.map((r) => (
                  <TableRow key={`${r.acreedorId}-${r.moneda}`} hover onClick={() => setBanco(r.acreedor)} sx={{ cursor: 'pointer' }}>
                    <TableCell sx={{ fontWeight: 700 }}>{r.acreedor}</TableCell>
                    <TableCell align="right">{r.prestamos}</TableCell>
                    <TableCell>{r.moneda}</TableCell>
                    <TableCell align="right" sx={{ fontWeight: 800 }}>{money(r.totalPendiente, r.moneda)}</TableCell>
                    <TableCell align="right">{money(r.saldoCapital, r.moneda)}</TableCell>
                    <TableCell align="right" sx={{ color: 'success.main' }}>{money(r.pagado, r.moneda)}</TableCell>
                    <TableCell>{formatDate(r.proximaFecha)}{r.vencido > 0 && <Chip size="small" color="warning" label="Vencida" sx={{ ml: 0.5 }} />}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
        <Box>
          <Typography variant="body2" fontWeight={800} mb={0.5}>Cuotas vencidas y de los próximos 30 días{banco && ` · ${banco}`}</Typography>
          {!agenda.length ? <Empty>No hay cuotas vencidas ni por vencer en 30 días.</Empty> : (
            <TableContainer sx={{ maxHeight: 300 }}>
              <Table size="small">
                <TableBody>
                  {agenda.map((r) => (
                    <TableRow key={r.cuotaId} hover>
                      <TableCell>
                        <Typography fontWeight={700} fontSize={13}>{r.acreedor}</Typography>
                        <Typography variant="caption" color="text.secondary">{r.numero} · cuota {r.cuota}</Typography>
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
        </Box>
      </Stack>
    </Paper>
  );
}

function Creditors({ rows, search, setSearch, edit, done }: { rows: Acreedor[]; search: string; setSearch: (v: string) => void; edit: (a: Acreedor) => void; done: (message: string) => void }) {
  const [deleting, setDeleting] = useState<Acreedor | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const remove = async () => {
    if (!deleting) return;
    setBusy(true); setError('');
    try {
      await apiClient.delete(`/prestamos/acreedores/${deleting.id}`);
      setDeleting(null); done('Acreedor eliminado. Su historial se conserva.');
    } catch (e) { setError(apiError(e)); } finally { setBusy(false); }
  };
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
              <TableCell sx={HEAD} align="right">Acciones</TableCell>
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
                  <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
                    <Tooltip title="Editar acreedor"><IconButton aria-label={`Editar ${a.nombre}`} size="small" onClick={() => edit(a)}><EditOutlinedIcon fontSize="small" /></IconButton></Tooltip>
                    <Tooltip title="Eliminar acreedor"><IconButton aria-label={`Eliminar ${a.nombre}`} size="small" color="error" onClick={() => { setError(''); setDeleting(a); }}><DeleteOutlineIcon fontSize="small" /></IconButton></Tooltip>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
      <Dialog open={Boolean(deleting)} onClose={() => { if (!busy) setDeleting(null); }} maxWidth="xs" fullWidth>
        <DialogTitle>Eliminar acreedor</DialogTitle>
        <DialogContent>
          {error && <Alert severity="error">{error}</Alert>}
          <Typography>¿Eliminar a {deleting?.nombre}? Se ocultará de Acreedores y no podrá seleccionarse en nuevos préstamos. Sus datos, préstamos, saldos y pagos se conservarán.</Typography>
        </DialogContent>
        <DialogActions>
          <Button disabled={busy} onClick={() => setDeleting(null)}>Cancelar</Button>
          <Button color="error" variant="contained" disabled={busy} onClick={() => void remove()}>{busy ? 'Eliminando…' : 'Eliminar acreedor'}</Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}

function Loans({ rows, search, setSearch, pay, detail, done }: { rows: Prestamo[]; search: string; setSearch: (v: string) => void; pay: (p: Prestamo) => void; detail: (id: number) => void; done: (message: string) => void }) {
  const [deleting, setDeleting] = useState<Prestamo | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const remove = async () => {
    if (!deleting || busy) return;
    setBusy(true); setError('');
    try {
      await apiClient.delete(`/prestamos/${deleting.id}`);
      setDeleting(null); done('Préstamo eliminado. Sus cuotas y pagos se conservan.');
    } catch (e) { setError(apiError(e)); } finally { setBusy(false); }
  };
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
                    <Tooltip title="Eliminar préstamo"><IconButton aria-label={`Eliminar ${p.numero}`} size="small" color="error" onClick={() => { setError(''); setDeleting(p); }}><DeleteOutlineIcon fontSize="small" /></IconButton></Tooltip>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
      <Dialog open={Boolean(deleting)} onClose={() => { if (!busy) setDeleting(null); }} maxWidth="sm" fullWidth>
        <DialogTitle>Eliminar préstamo</DialogTitle>
        <DialogContent>
          {error && <Alert severity="error">{error}</Alert>}
          <Typography>¿Eliminar el préstamo {deleting?.numero} de {deleting?.acreedor}?</Typography>
          <Typography sx={{ mt: 1 }}>Se ocultará del listado, resumen y reportes, y dejará de contar en los saldos. Sus datos, cuotas y pagos se conservarán mediante borrado lógico.</Typography>
        </DialogContent>
        <DialogActions>
          <Button disabled={busy} onClick={() => setDeleting(null)}>Cancelar</Button>
          <Button color="error" variant="contained" disabled={busy} onClick={() => void remove()}>{busy ? 'Eliminando…' : 'Eliminar préstamo'}</Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}

function CreditorDialog({ open, creditor, close, done }: { open: boolean; creditor: Acreedor | null; close: () => void; done: () => void }) {
  const empty = { nombre: '', tipo: 'banco', contacto: '', telefono: '', notas: '' };
  const [form, setForm] = useState(empty);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    setForm({ nombre: creditor?.nombre ?? '', tipo: creditor?.tipo ?? 'banco', contacto: creditor?.contacto ?? '', telefono: creditor?.telefono ?? '', notas: creditor?.notas ?? '' });
    setError('');
  }, [open, creditor]);
  const submit = async (e: FormEvent) => {
    e.preventDefault(); setBusy(true);
    try { if (creditor) await apiClient.put(`/prestamos/acreedores/${creditor.id}`, form); else await apiClient.post('/prestamos/acreedores', form); setForm(empty); setError(''); done(); }
    catch (x) { setError(apiError(x)); } finally { setBusy(false); }
  };
  return (
    <Dialog open={open} onClose={close} maxWidth="sm" fullWidth>
      <Box component="form" onSubmit={submit}>
        <DialogTitle>{creditor ? 'Editar acreedor' : 'Nuevo acreedor'}</DialogTitle>
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
  const emptyForm = () => ({
    acreedorId: '', referencia: '', moneda: 'HNL' as Moneda, monto: '', tasaAnual: '', cantidadCuotas: '12', frecuencia: 'mensual',
    tipoAmortizacion: 'cuota_fija', baseCalculo: '30_360', fechaDesembolso: today(), fechaPrimeraCuota: today(), cargoCuota: '0', notas: '',
  });
  const [form, setForm] = useState(emptyForm);
  const [opciones, setOpciones] = useState<OpcionesPlan>({});
  const [simulating, setSimulating] = useState(false);
  const [simulationError, setSimulationError] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [plan, setPlan] = useState<Plan | null>(null);
  const set = (key: keyof typeof form) => (e: { target: { value: string } }) => setForm({ ...form, [key]: e.target.value });
  const payload = useMemo(() => ({
    ...form, acreedorId: Number(form.acreedorId), monto: Number(form.monto), tasaAnual: Number(form.tasaAnual),
    cantidadCuotas: Number(form.cantidadCuotas),
    // En Manual las cuotas traen sus propios cargos y no se calcula interés: no aplican el seguro general ni la base.
    cargoCuota: form.tipoAmortizacion === 'manual' ? 0 : Number(form.cargoCuota),
    baseCalculo: '30_360',
    // Personalizada: la primera fecha siempre es la del primer pago. Manual: se guardan las fechas pegadas tal cual.
    opciones: form.tipoAmortizacion === 'personalizado'
      ? { redondeoInteres: form.frecuencia === 'semanal' ? 'periodo' as const : 'diario' as const, calendario: (opciones.calendario ?? []).map((r, i) => i === 0 ? { ...r, fechaVencimiento: form.fechaPrimeraCuota } : r) }
      : form.tipoAmortizacion === 'manual' ? { calendario: opciones.calendario ?? [] } : form.tipoAmortizacion === 'cuota_fija' ? { redondeoInteres: form.frecuencia === 'semanal' ? 'periodo' as const : 'diario' as const } : {} as OpcionesPlan,
  }), [form, opciones]);
  const descuadre = ['personalizado', 'manual'].includes(form.tipoAmortizacion) ? descuadreCapital(payload.opciones.calendario, payload.monto) : 0;
  const cuadra = Math.abs(descuadre) < 0.005;

  // La simulación la calcula el backend con la misma función que genera el calendario real.
  useEffect(() => {
    setPlan(null); setSimulationError('');
    if (!open || !(payload.monto > 0) || !(payload.cantidadCuotas > 0) || form.tasaAnual === '') { setSimulating(false); return; }
    const controller = new AbortController();
    setSimulating(true);
    const timer = setTimeout(() => {
      apiClient.post<Plan>('/prestamos/simular', payload, { signal: controller.signal })
        .then((r) => { if (!controller.signal.aborted) setPlan(r.data); })
        .catch((e) => { if (!controller.signal.aborted) setSimulationError(apiError(e)); })
        .finally(() => { if (!controller.signal.aborted) setSimulating(false); });
    }, 350);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [open, payload, form.tasaAnual]);

  const submit = async (e: FormEvent) => {
    e.preventDefault(); if (!plan || simulating || !cuadra) return; setBusy(true);
    try {
      const { data } = await apiClient.post<{ prestamo: { numero: string } }>('/prestamos', payload);
      // Deja el formulario limpio para el próximo préstamo.
      setForm(emptyForm()); setOpciones({}); setPlan(null); setSimulationError('');
      setError(''); done(`${data.prestamo.numero} registrado con su calendario de cuotas.`);
    } catch (x) { setError(apiError(x)); } finally { setBusy(false); }
  };
  const lines: [string, string][] = plan ? [
    ['Total capital', money(plan.cuotas.reduce((s, q) => s + Number(q.capital), 0), form.moneda)],
    ['Total intereses a pagar', money(plan.totalInteres, form.moneda)],
    ['Seguros y comisiones', money(plan.totalCargos, form.moneda)],
    ['Costo total del crédito', money(plan.totalPagar, form.moneda)],
    ['Primera cuota', money(plan.primeraCuota, form.moneda)],
    ['Última cuota', money(plan.ultimaCuota, form.moneda)],
  ] : [];
  return (
    <Dialog open={open} onClose={close} maxWidth="lg" fullWidth>
      <Box component="form" onSubmit={submit}>
        <DialogTitle>Registrar préstamo recibido<Typography variant="body2" color="text.secondary" mt={0.5}>Completa las condiciones, revisa el calendario y guarda el préstamo.</Typography></DialogTitle>
        <DialogContent>
          <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '1.5fr .8fr' }, gap: 2, pt: 0.5 }}>
            <Stack spacing={2}>
              {error && <Alert severity="error">{error}</Alert>}
<Box sx={{ borderBottom: '1px solid', borderColor: 'divider', pb: 2 }}>
<Typography fontWeight={800} mb={0.4}>1 · Datos del préstamo</Typography>
<Typography variant="body2" color="text.secondary" mb={1.5}>Identifica el crédito e indica cuánto recibió la empresa.</Typography>
<Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5 }}>
<TextField size="small" required select label="Banco o acreedor" value={form.acreedorId} onChange={set('acreedorId')}>
                {creditors.map((c) => <MenuItem key={c.id} value={c.id}>{c.nombre}</MenuItem>)}
              </TextField>
<TextField size="small" required label="N.º de préstamo" value={form.referencia} onChange={set('referencia')} />
<TextField size="small" select label="Moneda" value={form.moneda} onChange={set('moneda')}>
                  {MONEDAS.map((x) => <MenuItem key={x} value={x}>{MONEDA_LABEL[x]}</MenuItem>)}
                </TextField>
<GroupedNumberField required label="Monto recibido" min={0.01} value={form.monto} onChange={(monto) => setForm({ ...form, monto })} />
</Box></Box>
<Box sx={{ borderBottom: '1px solid', borderColor: 'divider', pb: 2 }}>
<Typography fontWeight={800} mb={0.4}>2 · Fechas y número de pagos</Typography>
<Typography variant="body2" color="text.secondary" mb={1.5}>El número de cuotas indica cuántos pagos habrá, según la frecuencia seleccionada.</Typography>
<Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5 }}>
<TextField size="small" type="date" label="Fecha desembolso" InputLabelProps={{ shrink: true }} value={form.fechaDesembolso} onChange={set('fechaDesembolso')} />
<TextField size="small" type="date" label="Fecha primer pago" InputLabelProps={{ shrink: true }} value={form.fechaPrimeraCuota} onChange={set('fechaPrimeraCuota')} />
<TextField size="small" select label="Frecuencia de pago" value={form.frecuencia} onChange={set('frecuencia')}>
                  {Object.entries(FRECUENCIA_LABEL).map(([value, label]) => <MenuItem key={value} value={value}>{label}</MenuItem>)}
                </TextField>
<GroupedNumberField required label="Número de cuotas" decimals={0} min={1} max={600} value={form.cantidadCuotas} onChange={(cantidadCuotas) => setForm({ ...form, cantidadCuotas })} />
</Box></Box>
<Box sx={{ borderBottom: '1px solid', borderColor: 'divider', pb: 2 }}>
<Typography fontWeight={800} mb={0.4}>3 · Forma de pago e intereses</Typography>
<Typography variant="body2" color="text.secondary" mb={1.5}>Elige cómo se devuelve el capital y utiliza las condiciones del documento del banco.</Typography>
<Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1.5 }}>
<TextField size="small" select label="¿Cómo se pagará el préstamo?" sx={{ gridColumn: '1 / -1' }} value={form.tipoAmortizacion} onChange={(e) => { setForm({ ...form, tipoAmortizacion: e.target.value, baseCalculo: '30_360' }); setOpciones(opcionesIniciales(e.target.value)); }}>
                  {TIPOS_NUEVOS.map((value) => <MenuItem key={value} value={value}>{TIPO_LABEL[value]}</MenuItem>)}
                </TextField>
<TextField size="small" required type="number" label="Tasa anual inicial (%)" inputProps={{ min: 0, max: 200, step: 0.0001 }} value={form.tasaAnual} onChange={set('tasaAnual')} />
{form.tipoAmortizacion !== 'manual' && <Typography variant="body2" color="text.secondary" sx={{ gridColumn: '1 / -1' }}>Base de cálculo fija: 30/360. Días por período: mensual 30, trimestral 90, semestral 180 y anual 360.</Typography>}
{form.tipoAmortizacion !== 'manual' && <GroupedNumberField label="Seguro y comisiones por cuota" value={form.cargoCuota} onChange={(cargoCuota) => setForm({ ...form, cargoCuota })} />}
</Box></Box>
              <AmortizacionOptions tipo={form.tipoAmortizacion} opciones={opciones} onChange={setOpciones}
                onImport={(rows) => {
                  // Una fila por cuota: ajusta plazo y primer pago; si el monto está vacío lo toma de la suma del capital.
                  const total = rows.reduce((s, r) => s + Math.round(r.capital * 100), 0) / 100;
                  setForm((f) => ({ ...f, cantidadCuotas: String(rows.length), fechaPrimeraCuota: rows[0].fechaVencimiento, monto: f.monto || String(total) }));
                  setOpciones((actual) => ({ ...actual, calendario: rows }));
                }}
                cantidad={payload.cantidadCuotas} monto={payload.monto} fecha={form.fechaPrimeraCuota} frecuencia={form.frecuencia} moneda={form.moneda} />
              <TextField size="small" label="Notas o garantía" value={form.notas} onChange={set('notas')} />
            </Stack>
            <Paper variant="outlined" sx={{ p: 1.5, bgcolor: '#f6f8f7', alignSelf: 'start', position: { md: 'sticky' }, top: 0 }}>
              <Typography fontWeight={900}>4 · Revisa antes de guardar</Typography>
              <Typography variant="body2" color="text.secondary" mt={0.5}>Los resultados se actualizan al cambiar las condiciones.</Typography>
              {simulationError && <Alert severity="warning" sx={{ mt: 1 }}>{simulationError}</Alert>}
              {!plan ? <Typography variant="body2" color="text.secondary" mt={1}>{simulating ? 'Calculando…' : 'Ingresa monto, tasa, fechas y número de cuotas para calcular el plan.'}</Typography>
                : lines.map(([a, b]) => <Stack key={a} direction="row" justifyContent="space-between" mt={1}><Typography variant="body2">{a}</Typography><b>{b}</b></Stack>)}
              {plan && <Alert severity="success" sx={{ mt: 1.5 }}>Calendario calculado · saldo final {money(plan.cuotas[plan.cuotas.length - 1].saldo, form.moneda)}</Alert>}
              <Typography variant="caption" display="block" mt={1.5}>Revisa el detalle de capital, intereses y saldo en el calendario de abajo. La última cuota cancela el saldo restante.</Typography>
            </Paper>
          </Box>
          {plan && <Box mt={2}>
            <Typography fontWeight={800} mb={1}>Calendario de pagos · {plan.cuotas.length} filas</Typography>
            <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 300 }}>
              <Table size="small" stickyHeader>
                <TableHead><TableRow>{['#', 'Fecha', 'Días', 'Tasa anual %', 'Sem. ISO', 'Concepto', 'Capital', 'Interés', 'Cargos', 'Pago', 'Saldo'].map(label => <TableCell key={label} sx={HEAD}>{label}</TableCell>)}</TableRow></TableHead>
                <TableBody>{plan.cuotas.map(q => <TableRow key={q.numero}>
                  <TableCell>{q.numero}</TableCell><TableCell sx={{ whiteSpace: 'nowrap' }}>{formatDate(q.fechaVencimiento)}</TableCell><TableCell>{q.dias ?? '—'}</TableCell><TableCell>{q.tasaAnualAplicada ?? '—'}</TableCell><TableCell>{q.semanaIso ?? '—'}</TableCell><TableCell>{q.concepto}</TableCell>
                  {[q.capital, q.interes, q.cargos, q.monto, q.saldo].map((v, i) => <TableCell key={i} align="right" sx={{ whiteSpace: 'nowrap' }}>{money(v, form.moneda)}</TableCell>)}
                </TableRow>)}</TableBody>
              </Table>
            </TableContainer>
          </Box>}
        </DialogContent>
        <DialogActions sx={{ borderTop: '1px solid', borderColor: 'divider', px: 3, flexWrap: 'wrap', gap: 1 }}>
          <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }} role="status">{busy ? 'Guardando préstamo…' : simulating ? 'Actualizando cálculo…' : simulationError ? 'Revisa las condiciones indicadas en la simulación.' : !cuadra ? 'La suma del capital debe coincidir con el monto recibido.' : !plan ? 'Completa las condiciones para habilitar el registro.' : !form.acreedorId || !form.referencia.trim() ? 'Completa el acreedor y el número de préstamo.' : 'Calendario listo para registrar.'}</Typography>
          <Button onClick={close} disabled={busy}>Cancelar</Button>
          <Button type="submit" variant="contained" disabled={busy || simulating || !plan || !cuadra || !form.acreedorId || !form.referencia.trim()}>{busy ? 'Guardando…' : 'Registrar préstamo'}</Button>
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
    setKind('cuota'); setMode('cuota'); setAmount(loan?.proximaCuota ? Number(loan.proximaCuota).toFixed(2) : ''); setDate(today()); setReference(''); setError('');
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
                helperText={loan.permiteReducirPlazo ? "Se recalculan las cuotas sin pagos con la tasa del préstamo. Se conserva el historial anterior." : "Conserva fechas y estructura; reduce capital e intereses futuros proporcionalmente. Conserva intereses diferidos y, en calendario manual, los intereses pactados. Se conserva el historial anterior."}>
                <MenuItem value="cuota">Reducir la cuota y mantener el plazo</MenuItem>
                <MenuItem value="plazo" disabled={!loan.permiteReducirPlazo}>Reducir el plazo y mantener la cuota</MenuItem>
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
  const [showHistory, setShowHistory] = useState(false);
  const [rateOpen, setRateOpen] = useState(false);
  const fetchDetail = useCallback(async () => {
    if (id === null) { setData(null); setShowHistory(false); return; }
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
                {money(loan.monto, m)} al {Number(loan.tasaAnual).toFixed(2)}% anual · {TIPO_LABEL[loan.tipoAmortizacion] ?? loan.tipoAmortizacion} · base {BASE_LABEL[loan.baseCalculo] ?? loan.baseCalculo} · pago {loan.frecuencia} · desembolso {formatDate(loan.fechaDesembolso)} · registrado por {loan.creadoPor}
              </Typography>
            </Box>
            {loan.origen === 'telegram' && <Stack direction="row" spacing={1} alignItems="center">
              <Chip size="small" label="Plan original importado por Telegram" />
              <Button size="small" onClick={() => void apiClient.get(`/prestamos/${loan.id}/documento-original`, { responseType: 'blob' }).then(response => {
                const url = URL.createObjectURL(response.data), link = document.createElement('a'); link.href = url; link.download = `plan-${loan.numero}`; link.click(); window.setTimeout(() => URL.revokeObjectURL(url), 1000);
              }).catch(e => setError(apiError(e)))}>Descargar original</Button>
            </Stack>}
            {loan.interesCapitalizado > 0 && <Alert severity="info">El capital financiado incluye {money(loan.interesCapitalizado, m)} de intereses capitalizados durante la gracia. Los pagos de ese importe se contabilizan como capital.</Alert>}
            <Typography variant="body2" color="text.secondary">{descripcionOpciones(loan.opciones)}</Typography>
            {editable && <Button variant="outlined" sx={{ alignSelf: 'start' }} onClick={() => setRateOpen(true)}>Cambiar tasa desde una cuota</Button>}
            <Box>
              <Typography fontWeight={800} mb={0.5}>Historial de cambios de tasa</Typography>
              {!loan.opciones.historialTasas?.length ? <Typography variant="body2" color="text.secondary">No se han registrado cambios de tasa.</Typography> : <>
                <Typography variant="caption" color="text.secondary">Cada cambio confirmado conserva la tasa anterior y el calendario reemplazado. Los cambios más recientes aparecen primero.</Typography>
                <TableContainer sx={{ maxHeight: 240 }}><Table size="small" stickyHeader>
                  <TableHead><TableRow>{['Fecha y hora del registro', 'Tasa anterior', 'Nueva tasa', 'Desde cuota', 'Vencimiento', 'Registrado por'].map(x => <TableCell key={x} sx={HEAD}>{x}</TableCell>)}</TableRow></TableHead>
                  <TableBody>{[...loan.opciones.historialTasas].reverse().map((c, i) => <TableRow key={i}>
                    <TableCell>{new Date(c.fecha).toLocaleString('es-HN', { timeZone: 'America/Tegucigalpa', dateStyle: 'short', timeStyle: 'short' })}</TableCell>
                    <TableCell>{Number(c.tasaAnterior).toLocaleString('es-HN', { maximumFractionDigits: 4 })}%</TableCell>
                    <TableCell sx={{ fontWeight: 700 }}>{Number(c.tasaAnual).toLocaleString('es-HN', { maximumFractionDigits: 4 })}%</TableCell>
                    <TableCell>{c.desdeCuota}</TableCell>
                    <TableCell>{formatDate(c.fechaVencimientoDesde ?? data.cuotas.find(q => q.numero === c.desdeCuota)?.fechaVencimiento)}</TableCell>
                    <TableCell>{c.usuario}</TableCell>
                  </TableRow>)}</TableBody>
                </Table></TableContainer>
              </>}
            </Box>
            {Math.abs(data.diferenciaCapital) > 0.01 && (
              <Alert severity="warning" sx={{ py: 0.4 }}>
                El capital del calendario más los abonos difiere del capital financiado (monto recibido + interés capitalizado) en {money(data.diferenciaCapital, m)}. Revisa las cuotas editadas.
              </Alert>
            )}
            <TableContainer sx={{ maxHeight: 360 }}>
              <Table size="small" stickyHeader>
                <TableHead><TableRow>
                  {['#', 'Vencimiento', 'Concepto', 'Capital', 'Interés', 'Seguro y comis.', 'Cuota', 'Pagado', 'Estado', ''].map((x) => (
                    <TableCell key={x} sx={HEAD} align={['#', 'Capital', 'Interés', 'Seguro y comis.', 'Cuota', 'Pagado'].includes(x) ? 'right' : 'left'}>{x}</TableCell>
                  ))}
                </TableRow></TableHead>
                <TableBody>
                  {data.cuotas.map((q) => (
                    <TableRow key={q.id}>
                      <TableCell align="right">{q.numero}</TableCell>
                      <TableCell>{formatDate(q.fechaVencimiento)}</TableCell>
                      <TableCell>{q.concepto || 'Cuota'}</TableCell>
                      <TableCell align="right">{money(q.capital, m)}</TableCell>
                      <TableCell align="right">{money(q.interes, m)}{Number(q.interesDiferido) > 0 && <Typography variant="caption" display="block" color="text.secondary">Incluye {money(q.interesDiferido, m)} diferidos</Typography>}</TableCell>
                      <TableCell align="right">{money(q.cargos, m)}</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 800 }}>{money(q.monto, m)}</TableCell>
                      <TableCell align="right">{money(q.pagado, m)}</TableCell>
                      <TableCell><Chip size="small" color={q.estado === 'pagada' ? 'success' : q.estado === 'parcial' ? 'warning' : 'default'} label={Number(q.monto) === 0 ? 'Sin pago' : capitalize(q.estado)} /></TableCell>
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
            {data.historialCuotas.length > 0 && <Box>
              <Button size="small" onClick={() => setShowHistory(!showHistory)}>{showHistory ? 'Ocultar' : 'Ver'} historial de cuotas ({data.historialCuotas.length})</Button>
              {showHistory && <TableContainer sx={{ maxHeight: 240 }}><Table size="small" stickyHeader>
                <TableHead><TableRow>{['#', 'Vencimiento', 'Capital', 'Interés', 'Cargos', 'Monto', 'Reemplazada', 'Usuario', 'Motivo'].map(x => <TableCell key={x} sx={HEAD}>{x}</TableCell>)}</TableRow></TableHead>
                <TableBody>{data.historialCuotas.map(q => <TableRow key={q.id}>
                  <TableCell>{q.numero}</TableCell><TableCell>{formatDate(q.fechaVencimiento)}</TableCell>
                  {[q.capital, q.interes, q.cargos, q.monto].map((v, i) => <TableCell key={i}>{money(v, m)}</TableCell>)}
                  <TableCell>{new Date(q.reemplazadaEn).toLocaleString('es-HN')}</TableCell><TableCell>{q.reemplazadaPor}</TableCell><TableCell>{q.motivo}</TableCell>
                </TableRow>)}</TableBody>
              </Table></TableContainer>}
            </Box>}
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
      {loan && data && <RateChangeDialog key={loan.id} open={rateOpen} loan={loan} cuotas={data.cuotas} close={() => setRateOpen(false)} done={() => { setRateOpen(false); void fetchDetail(); changed(); }} />}
      {loan && <InstallmentDialog loanId={loan.id} cuota={editing} close={() => setEditing(null)} done={() => { setEditing(null); void fetchDetail(); changed(); }} />}
    </Dialog>
  );
}

function RateChangeDialog({ open, loan, cuotas, close, done }: { open: boolean; loan: Detalle['prestamo']; cuotas: Cuota[]; close: () => void; done: () => void }) {
  const elegibles = cuotas.filter(q => !cuotas.some(r => r.numero >= q.numero && Number(r.pagado) > 0));
  const [desde, setDesde] = useState('');
  const [tasa, setTasa] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  type Preview = { totalAnterior: number; totalNuevo: number; cuotas: { numero: number; fecha: string; capital: number; interes: number; cargos: number; monto: number; saldo: number }[] };
  const [preview, setPreview] = useState<Preview | null>(null);
  useEffect(() => { if (open) { setDesde(String(elegibles[0]?.numero ?? '')); setTasa(''); setPreview(null); setError(''); } }, [open]);
  const request = async (simular: boolean) => {
    setBusy(true); setError('');
    try {
      const r = await apiClient.post<Preview>(`/prestamos/${loan.id}/cambio-tasa`, { desdeCuota: Number(desde), tasaAnual: Number(tasa), simular });
      if (simular) setPreview(r.data); else done();
    } catch (e) { setError(apiError(e)); } finally { setBusy(false); }
  };
  return <Dialog open={open} onClose={busy ? undefined : close} maxWidth="md" fullWidth>
    <DialogTitle>Cambiar tasa del préstamo</DialogTitle>
    <DialogContent><Stack spacing={2} pt={1}>
      <Typography>Si ya pagaste 17 cuotas, selecciona la cuota 18 e indica la nueva tasa acordada con el banco. Solo se reemplazan cuotas sin pagos; el calendario anterior queda en el historial.</Typography>
      {error && <Alert severity="error">{error}</Alert>}
      <TextField size="small" select label="Aplicar desde la cuota" value={desde} disabled={busy} onChange={e => { setDesde(e.target.value); setPreview(null); }}>
        {elegibles.map(q => <MenuItem key={q.id} value={q.numero}>Cuota {q.numero} · {formatDate(q.fechaVencimiento)}</MenuItem>)}
      </TextField>
      <TextField size="small" type="number" label="Nueva tasa anual (%)" value={tasa} disabled={busy} inputProps={{ min: 0, max: 200, step: 0.0001 }} onChange={e => { setTasa(e.target.value); setPreview(null); }} />
      <Alert severity="info">{loan.tipoAmortizacion === 'cuota_fija' ? 'Se conserva el número de pagos y se calcula una nueva cuota con el capital pendiente y la nueva tasa.' : 'Se conservan las fechas y los abonos a capital; se recalculan los intereses con la nueva tasa.'} Los seguros, comisiones e intereses diferidos se conservan.</Alert>
      <Button variant="outlined" disabled={busy || !desde || tasa === ''} onClick={() => void request(true)}>Calcular y revisar cambio</Button>
      {preview && <>
        <Typography>Total de cuotas afectadas: {money(preview.totalAnterior, loan.moneda)} → {money(preview.totalNuevo, loan.moneda)}</Typography>
        <TableContainer sx={{ maxHeight: 280 }}><Table size="small" stickyHeader>
          <TableHead><TableRow>{['Cuota', 'Fecha', 'Capital', 'Interés', 'Total', 'Saldo'].map(x => <TableCell key={x}>{x}</TableCell>)}</TableRow></TableHead>
          <TableBody>{preview.cuotas.map(q => <TableRow key={q.numero}><TableCell>{q.numero}</TableCell><TableCell>{formatDate(q.fecha)}</TableCell>{[q.capital,q.interes,q.monto,q.saldo].map((v,i) => <TableCell key={i}>{money(v,loan.moneda)}</TableCell>)}</TableRow>)}</TableBody>
        </Table></TableContainer>
      </>}
    </Stack></DialogContent>
    <DialogActions><Button disabled={busy} onClick={close}>Cancelar</Button><Button variant="contained" disabled={busy || !preview} onClick={() => void request(false)}>{busy ? 'Procesando…' : 'Aplicar nueva tasa'}</Button></DialogActions>
  </Dialog>;
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

/** Pagos programados por semana ISO, mes y banco (reporte tipo PAGOS WK). */
function WeeklyFlow({ onError }: { onError: (message: string) => void }) {
  const [rows, setRows] = useState<FlujoRow[]>([]);
  useEffect(() => {
    apiClient.get<FlujoRow[]>('/prestamos/flujo-semanal').then((r) => setRows(r.data)).catch((e) => onError(apiError(e)));
  }, [onError]);
  if (!rows.length) return <Empty>No hay cuotas pendientes en préstamos activos.</Empty>;
  return (
    <TableContainer component={Paper} variant="outlined">
      <Table size="small">
        <TableHead><TableRow>
          {['Semana', 'Mes', 'Período', 'Banco', 'Cuotas', 'Capital', 'Interés', 'Seguro y comis.', 'Total a pagar'].map((x) => (
            <TableCell key={x} sx={HEAD} align={['Cuotas', 'Capital', 'Interés', 'Seguro y comis.', 'Total a pagar'].includes(x) ? 'right' : 'left'}>{x}</TableCell>
          ))}
        </TableRow></TableHead>
        <TableBody>
          {rows.map((r) => (
            <TableRow key={`${r.anioIso}-${r.semanaIso}-${r.mesNombre}-${r.banco}-${r.moneda}`} hover>
              <TableCell sx={{ fontWeight: 700 }}>WK {r.semanaIso} · {r.anioIso}</TableCell>
              <TableCell>{r.mesNombre}</TableCell>
              <TableCell sx={{ whiteSpace: 'nowrap' }}>{formatDate(r.desde)}{r.hasta !== r.desde && ` – ${formatDate(r.hasta)}`}</TableCell>
              <TableCell>{r.banco}</TableCell>
              <TableCell align="right">{r.cuotas}</TableCell>
              <TableCell align="right">{money(r.capital, r.moneda)}</TableCell>
              <TableCell align="right">{money(r.interes, r.moneda)}</TableCell>
              <TableCell align="right">{money(r.cargos, r.moneda)}</TableCell>
              <TableCell align="right" sx={{ fontWeight: 800 }}>{money(r.total, r.moneda)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </TableContainer>
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
