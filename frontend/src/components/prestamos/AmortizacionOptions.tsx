import { useEffect, useState } from 'react';
import { Alert, Button, Chip, Dialog, DialogActions, DialogContent, DialogTitle, Paper, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography } from '@mui/material';
import GroupedNumberField from './GroupedNumberField';

export interface HitoCapital { fechaVencimiento: string; capital: number; interes?: number; cargos?: number }
export interface OpcionesPlan {
  historialTasas?: { desdeCuota: number; fechaVencimientoDesde?: string; tasaAnterior: number; tasaAnual: number; fecha: string; usuario: string }[];
  cambiosTasa?: { desde: string; tasaAnual: number }[];
  redondeoInteres?: 'periodo' | 'diario';
  cuotaPactada?: number;
  /** Personalizada: un hito de capital por cuota. */
  calendario?: HitoCapital[];
  // Legado: préstamos anteriores con otros métodos conservan estas opciones solo para consulta.
  gracia?: { periodos: number; tipo: string; cobroDiferido?: string };
  interesPagoUnico?: string;
  balon?: { valor: number; unidad: string; base: string };
  crecimiento?: { modo: string; porcentaje?: number; cadaPeriodos?: number; indice?: string };
  extraordinarias?: { periodo: number; monto: number }[];
}

/** Métodos disponibles al crear un préstamo. */
export const TIPOS_NUEVOS = ['cuota_fija', 'solo_interes', 'personalizado', 'manual'] as const;
export const TIPO_LABEL: Record<string, string> = {
  cuota_fija: 'Cuota fija (Francés)',
  solo_interes: 'Solo intereses y capital al final (Bullet)',
  personalizado: 'Pagos irregulares de capital e intereses',
  // Legado
  capital_fijo: 'Alemán · capital fijo (anterior)', pago_unico: 'Pago único (anterior)', balon: 'Cuota balón (anterior)',
  creciente: 'Cuota creciente (anterior)', extraordinarias: 'Cuotas extraordinarias (anterior)', manual: 'Manual (cuotas tal cual, pegadas de Excel)',
};
export const BASE_LABEL: Record<string, string> = { '30_360': '30 / 360', ACTUAL_360: 'Días reales / 360' };

export const opcionesIniciales = (tipo: string): OpcionesPlan => tipo === 'personalizado' || tipo === 'manual' ? { calendario: [] } : {};
export function descripcionOpciones(o: OpcionesPlan): string {
  const parts: string[] = [];
  if (o.gracia) parts.push(`${o.gracia.periodos} períodos de gracia (${o.gracia.tipo})`);
  if (o.interesPagoUnico) parts.push(`Interés ${o.interesPagoUnico}`);
  if (o.balon) parts.push(`Capital balón: ${o.balon.valor.toLocaleString('en-US')}${o.balon.unidad === 'porcentaje' ? '%' : ''}`);
  if (o.crecimiento) parts.push('Cuotas con crecimiento / índice variable');
  if (o.extraordinarias) parts.push(`Abonos programados en ${o.extraordinarias.length} períodos`);
  return parts.join(' · ');
}

const cents = (v: number) => Math.round((Number(v) + Number.EPSILON) * 100);
/** Suma de capital de los hitos menos el monto del desembolso, en centavos exactos. */
export const descuadreCapital = (calendario: HitoCapital[] | undefined, monto: number) =>
  ((calendario ?? []).reduce((s, r) => s + cents(r.capital || 0), 0) - cents(monto || 0)) / 100;

export const FRECUENCIA_LABEL: Record<string, string> = { semanal: 'Semanal', mensual: 'Mensual', trimestral: 'Trimestral', semestral: 'Semestral (cada 6 meses)', anual: 'Anual (cada 12 meses)' };

/** Fecha de la cuota `index` según la frecuencia: cada 7 días, 1 mes o 3 meses (ajustando fin de mes). */
function addPeriods(first: string, index: number, frecuencia: string) {
  const d = new Date(`${first}T00:00:00Z`);
  if (frecuencia === 'semanal') { d.setUTCDate(d.getUTCDate() + 7 * index); return d.toISOString().slice(0, 10); }
  const next = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + ({ mensual: 1, trimestral: 3, semestral: 6, anual: 12 }[frecuencia] ?? 1) * index, 1));
  next.setUTCDate(Math.min(d.getUTCDate(), new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate()));
  return next.toISOString().slice(0, 10);
}
const parseNumber = (cell: string) => {
  const clean = cell.replace(/[^\d.,-]/g, '').replace(/,/g, '');
  return clean !== '' && /\d/.test(clean) && Number.isFinite(Number(clean)) ? Number(clean) : NaN;
};
function parseDate(cell: string): string | null {
  const iso = cell.match(/(\d{4})-(\d{1,2})-(\d{1,2})/), dmy = cell.match(/(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/);
  const [y, m, d] = iso ? [+iso[1], +iso[2], +iso[3]] : dmy ? [+dmy[3], +dmy[2], +dmy[1]] : [0, 0, 0]; // día/mes/año
  if (!y) return null;
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d ? date.toISOString().slice(0, 10) : null;
}
/**
 * Interpreta una tabla pegada desde Excel. Por fila busca la fecha (día/mes/año) y toma los dos números
 * siguientes como capital (principal) e interés. Ignora encabezados y las columnas de cuota total y saldo.
 */
export function parsearTablaExcel(text: string): { rows: HitoCapital[]; error?: string } {
  const rows: HitoCapital[] = [];
  let ignoradas = 0;
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const cells = (line.includes('\t') ? line.split('\t') : line.trim().split(/\s+/)).map(c => c.trim()).filter(Boolean);
    const at = cells.findIndex(c => parseDate(c) !== null);
    if (at < 0) { if (/\d/.test(line)) ignoradas += 1; continue; }
    let nums = cells.slice(at + 1).map(parseNumber).filter(n => !Number.isNaN(n));
    // Fecha, Días, Capital, Intereses, Total cuota, Saldo.
    if (nums.length === 5 && Number.isInteger(nums[0]) && nums[0] >= 0 && nums[0] <= 366) nums = nums.slice(1);
    if (!nums.length || nums[0] < 0 || (nums[1] ?? 0) < 0) return { rows: [], error: `La fila "${line.trim().slice(0, 60)}" no tiene capital e interés válidos después de la fecha.` };
    // Con columnas Total cuota y Saldo (4 números), la diferencia entre el total y capital + interés son los cargos.
    const cargos = nums.length >= 4 ? Math.round((nums[2] - nums[0] - nums[1]) * 100) / 100 : 0;
    rows.push({ fechaVencimiento: parseDate(cells[at])!, capital: Math.round(nums[0] * 100) / 100,
      ...(nums.length > 1 ? { interes: Math.round(nums[1] * 100) / 100 } : {}), ...(cargos > 0 ? { cargos } : {}) });
  }
  if (!rows.length) return { rows: [], error: 'No encontré filas con fecha. Copia las columnas Fecha, Principal e Intereses desde Excel.' };
  if (rows.length > 600) return { rows: [], error: 'El máximo es 600 cuotas.' };
  for (let i = 1; i < rows.length; i += 1) if (rows[i].fechaVencimiento <= rows[i - 1].fechaVencimiento) return { rows: [], error: `Las fechas deben ir en orden ascendente (revisa la fila ${i + 1}).` };
  return { rows, error: ignoradas ? `Se ignoraron ${ignoradas} fila(s) sin fecha válida.` : undefined };
}

/** Reparte el capital en partes iguales; el último hito absorbe los centavos. */
export function generarHitos(cantidad: number, monto: number, fecha: string, frecuencia: string): HitoCapital[] {
  if (!Number.isInteger(cantidad) || cantidad < 1 || cantidad > 600 || !(monto > 0) || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return [];
  const total = cents(monto), part = Math.floor(total / cantidad);
  return Array.from({ length: cantidad }, (_, i) => ({ fechaVencimiento: addPeriods(fecha, i, frecuencia), capital: (i === cantidad - 1 ? total - part * i : part) / 100 }));
}

/** Genera gracia de capital, abonos regulares y capital final sin perder centavos. */
export function generarIrregular(cantidad: number, monto: number, fecha: string, frecuencia: string, gracia: number, regular: number | undefined, final: number): HitoCapital[] {
  const rows = generarHitos(cantidad, monto, fecha, frecuencia);
  if (!rows.length || !Number.isInteger(gracia) || gracia < 0 || gracia > cantidad - 2
    || !Number.isFinite(final) || final < 0 || final > monto
    || (regular !== undefined && (!Number.isFinite(regular) || regular < 0)))
    throw new Error('Revisa el plazo, las cuotas sin capital y los montos de capital.');
  const total = cents(monto), ultimo = cents(final), periodos = cantidad - gracia - 1;
  const abono = regular === undefined ? Math.floor((total - ultimo) / periodos) : cents(regular);
  const ajuste = total - ultimo - abono * (periodos - 1);
  if (ajuste < 0) throw new Error('Los abonos regulares más el capital final exceden el desembolso.');
  return rows.map((r, i) => ({ ...r, capital: (i < gracia ? 0 : i === cantidad - 1 ? ultimo : i === cantidad - 2 ? ajuste : abono) / 100 }));
}

/** Campo numérico con borrador de texto. `undefined` = vacío (solo útil si el campo es opcional). */
function Monto({ label, value, onChange }: { label: string; value: number | undefined; onChange: (value: number | undefined) => void }) {
  const text = (v: number | undefined) => v === undefined ? '' : String(v);
  const [draft, setDraft] = useState(text(value));
  useEffect(() => { setDraft(current => (current === '' ? undefined : Number(current)) === value ? current : text(value)); }, [value]);
  return <GroupedNumberField label={label} value={draft} onChange={raw => { setDraft(raw); onChange(raw === '' ? undefined : Number(raw)); }} />;
}

export default function AmortizacionOptions({ tipo, opciones: o, onChange, onImport, cantidad, monto, fecha, frecuencia, moneda }: {
  tipo: string; opciones: OpcionesPlan; onChange: (value: OpcionesPlan) => void; onImport: (rows: HitoCapital[]) => void;
  cantidad: number; monto: number; fecha: string; frecuencia: string; moneda: string;
}) {
  const rows = o.calendario ?? [];
  const [gracia, setGracia] = useState('0');
  const [capitalRegular, setCapitalRegular] = useState('');
  const [capitalFinal, setCapitalFinal] = useState('0');
  const [generationError, setGenerationError] = useState('');
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasted, setPasted] = useState('');
  const parsed = pasted.trim() ? parsearTablaExcel(pasted) : null;
  // La cuadrícula siempre tiene una fila por cuota: se genera al elegir el método o al cambiar el plazo o la frecuencia.
  useEffect(() => {
    if (tipo === 'personalizado' && rows.length !== cantidad) onChange({ ...o, calendario: generarHitos(cantidad, monto, fecha, frecuencia) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tipo, cantidad]);
  // Cambiar la frecuencia reajusta las fechas conservando los capitales ya ingresados.
  useEffect(() => {
    if (tipo === 'personalizado' && rows.length > 0 && /^\d{4}-\d{2}-\d{2}$/.test(fecha))
      onChange({ ...o, calendario: rows.map((r, i) => ({ ...r, fechaVencimiento: addPeriods(fecha, i, frecuencia) })) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [frecuencia]);

  if (tipo === 'cuota_fija') return <Alert severity="info">El sistema calcula la cuota con el monto, la tasa y el número de pagos. Si posteriormente acuerdas otra tasa con el banco, podrás aplicarla desde una cuota sin pagos en el detalle del préstamo.</Alert>;
  if (tipo === 'solo_interes') return <Alert severity="info">Cuotas 1 a n−1 solo de interés sobre el saldo; la cuota n paga todo el capital más su interés.</Alert>;
  if (tipo !== 'personalizado' && tipo !== 'manual') return null;

  const diff = descuadreCapital(rows, monto), ok = Math.abs(diff) < 0.005 && rows.length > 0;
  const fmt = (v: number) => new Intl.NumberFormat('es-HN', { style: 'currency', currency: moneda === 'USD' ? 'USD' : 'HNL' }).format(Math.abs(v));
  const set = (i: number, patch: Partial<HitoCapital>) => onChange({ ...o, calendario: rows.map((r, j) => j === i ? { ...r, ...patch } : r) });
  const badge = <Chip color={ok ? 'success' : 'error'} label={ok ? 'Capital cuadrado 100%' : `Descuadre por ${fmt(diff)}${diff < 0 ? ' (falta capital)' : ' (excede el desembolso)'}`} />;
  const pasteDialog = (
    <Dialog open={pasteOpen} onClose={() => setPasteOpen(false)} maxWidth="sm" fullWidth>
      <DialogTitle>Pegar tabla desde Excel</DialogTitle>
      <DialogContent>
        <Stack spacing={1.2} pt={0.5}>
          <Alert severity="info">Copia en Excel las columnas <b>Fecha, Principal e Intereses</b> (en ese orden; pueden incluir Días después de Fecha y Total cuota y Saldo al final) y pégalas aquí. Las fechas se leen como día/mes/año. Reemplaza las filas actuales y ajusta el plazo y la fecha del primer pago.</Alert>
          <TextField multiline minRows={8} maxRows={14} autoFocus placeholder={'13/4/2022\t56,875.00\t51,187.50\n13/7/2022\t56,875.00\t49,907.81'} value={pasted} onChange={e => setPasted(e.target.value)} />
          {parsed?.rows.length ? <Alert severity={parsed.error ? 'warning' : 'success'}>{parsed.rows.length} cuotas leídas · capital {new Intl.NumberFormat('es-HN', { minimumFractionDigits: 2 }).format(parsed.rows.reduce((s, r) => s + cents(r.capital), 0) / 100)}{parsed.error ? ` · ${parsed.error}` : ''}</Alert> : parsed?.error ? <Alert severity="error">{parsed.error}</Alert> : null}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => setPasteOpen(false)}>Cancelar</Button>
        <Button variant="contained" disabled={!parsed?.rows.length} onClick={() => { if (parsed?.rows.length) { onImport(parsed.rows); setPasteOpen(false); } }}>Importar</Button>
      </DialogActions>
    </Dialog>
  );
  if (tipo === 'manual') {
    const num = (v: number) => new Intl.NumberFormat('es-HN', { minimumFractionDigits: 2 }).format(v);
    return (
      <Paper variant="outlined" sx={{ p: 1.5 }}>
        <Stack spacing={1.2}>
          <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" useFlexGap spacing={1}>
            <Typography fontWeight={800}>Cuotas tal cual las entrega el banco</Typography>
            {rows.length > 0 && badge}
          </Stack>
          <Typography variant="caption">No se calcula nada: se guardan la fecha, el capital, el interés y los cargos de cada cuota exactamente como los pegues. Indica arriba el monto y los demás datos del préstamo, pega la tabla y revisa que el capital cuadre con el desembolso.</Typography>
          <Stack direction="row" spacing={1}><Button size="small" variant="contained" onClick={() => { setPasted(''); setPasteOpen(true); }}>{rows.length ? 'Volver a pegar tabla' : 'Pegar tabla desde Excel'}</Button></Stack>
          {pasteDialog}
          {rows.length > 0 && <TableContainer sx={{ maxHeight: 320 }}>
            <Table size="small" stickyHeader>
              <TableHead><TableRow>{['#', 'Fecha', 'Capital', 'Interés', 'Cargos', 'Cuota'].map(x => <TableCell key={x} align={x === '#' || x === 'Fecha' ? 'left' : 'right'}>{x}</TableCell>)}</TableRow></TableHead>
              <TableBody>
                {rows.map((r, i) => (
                  <TableRow key={i}>
                    <TableCell>{i + 1}</TableCell><TableCell sx={{ whiteSpace: 'nowrap' }}>{r.fechaVencimiento}</TableCell>
                    <TableCell align="right">{num(r.capital)}</TableCell><TableCell align="right">{num(r.interes ?? 0)}</TableCell>
                    <TableCell align="right">{num(r.cargos ?? 0)}</TableCell><TableCell align="right">{num(r.capital + (r.interes ?? 0) + (r.cargos ?? 0))}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>}
        </Stack>
      </Paper>
    );
  }
  return (
    <Paper variant="outlined" sx={{ p: 1.5 }}>
      <Stack spacing={1.2}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" useFlexGap spacing={1}>
          <Typography fontWeight={800}>Pagos irregulares de capital e intereses</Typography>
          {badge}
        </Stack>
        <Typography variant="caption">Genera primero los abonos a capital o pega el calendario del banco. Después puedes ajustar cada fila. La suma del capital debe coincidir con el monto recibido.</Typography>
        <Stack direction={{ xs: 'column', sm: 'row' }} spacing={1}>
          <GroupedNumberField label="Cuotas iniciales sin capital" decimals={0} value={gracia} onChange={setGracia} />
          <GroupedNumberField label="Capital por cuota regular" value={capitalRegular} onChange={setCapitalRegular} />
          <GroupedNumberField label="Capital en última cuota" value={capitalFinal} onChange={setCapitalFinal} />
        </Stack>
        <Typography variant="caption">La última cuota paga el capital final indicado. La penúltima absorbe la diferencia de centavos. El interés se cobra también durante las cuotas sin capital. Deja el capital regular vacío para distribuirlo automáticamente.</Typography>
        <Button size="small" variant="outlined" onClick={() => {
          try {
            const calendario = generarIrregular(cantidad, monto, fecha, frecuencia, Number(gracia), capitalRegular === '' ? undefined : Number(capitalRegular), Number(capitalFinal));
            onChange({ ...o, calendario }); setGenerationError('');
          } catch (e) { setGenerationError((e as Error).message); }
        }}>Generar pagos irregulares</Button>
        {generationError && <Alert severity="error">{generationError}</Alert>}
        <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap>
          <Button size="small" variant="outlined" onClick={() => { setPasted(''); setPasteOpen(true); }}>Pegar tabla desde Excel</Button>
          <Button size="small" onClick={() => onChange({ ...o, calendario: generarHitos(cantidad, monto, fecha, frecuencia) })}>Repartir capital en partes iguales</Button>
        </Stack>
        <Typography fontWeight={700}>Revisa el capital de cada cuota</Typography>
        <Typography variant="caption" color="text.secondary">Interés vacío = cálculo automático. Un importe escrito reemplaza el cálculo de esa cuota, incluso si cambia la tasa.</Typography>
        {rows.some(r => r.interes !== undefined) && <Button size="small" onClick={() => onChange({ ...o, calendario: rows.map(({ interes: _interes, ...r }) => r) })}>Volver a calcular todos los intereses automáticamente</Button>}
        {pasteDialog}
        <TableContainer sx={{ maxHeight: 320 }}>
          <Table size="small" stickyHeader>
            <TableHead><TableRow><TableCell>#</TableCell><TableCell>Fecha de pago</TableCell><TableCell>Capital a pagar</TableCell><TableCell>Interés</TableCell></TableRow></TableHead>
            <TableBody>
              {rows.map((r, i) => (
                <TableRow key={i}>
                  <TableCell>{i + 1}</TableCell>
                  <TableCell><TextField size="small" type="date" disabled={i === 0} value={i === 0 ? fecha : r.fechaVencimiento} onChange={e => set(i, { fechaVencimiento: e.target.value })} /></TableCell>
                  <TableCell><Monto label="Capital" value={r.capital} onChange={capital => set(i, { capital: capital ?? 0 })} /></TableCell>
                  <TableCell><Monto label="Interés (opcional)" value={r.interes} onChange={interes => set(i, { interes })} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Stack>
    </Paper>
  );
}
