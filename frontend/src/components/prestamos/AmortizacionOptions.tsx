import { useEffect, useState } from 'react';
import { Alert, Box, Button, Chip, Paper, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography } from '@mui/material';
import GroupedNumberField from './GroupedNumberField';

export interface HitoCapital { fechaVencimiento: string; capital: number; interes?: number; cargos?: number }
export interface OpcionesPlan {
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
export const TIPOS_NUEVOS = ['cuota_fija', 'solo_interes', 'personalizado'] as const;
export const TIPO_LABEL: Record<string, string> = {
  cuota_fija: 'Cuota fija (Francés)',
  solo_interes: 'Solo interés al vencimiento (Bullet)',
  personalizado: 'Personalizada (amortización irregular)',
  // Legado
  capital_fijo: 'Alemán · capital fijo (anterior)', pago_unico: 'Pago único (anterior)', balon: 'Cuota balón (anterior)',
  creciente: 'Cuota creciente (anterior)', extraordinarias: 'Cuotas extraordinarias (anterior)', manual: 'Calendario manual / importado',
};
export const BASE_LABEL: Record<string, string> = { '30_360': '30 / 360', ACTUAL_360: 'Días reales / 360' };

export const opcionesIniciales = (tipo: string): OpcionesPlan => tipo === 'personalizado' ? { calendario: [] } : {};
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

function addMonths(first: string, index: number) {
  const d = new Date(`${first}T00:00:00Z`);
  const next = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + index, 1));
  next.setUTCDate(Math.min(d.getUTCDate(), new Date(Date.UTC(next.getUTCFullYear(), next.getUTCMonth() + 1, 0)).getUTCDate()));
  return next.toISOString().slice(0, 10);
}
/** Reparte el capital en partes iguales; el último hito absorbe los centavos. */
export function generarHitos(cantidad: number, monto: number, fecha: string): HitoCapital[] {
  if (!Number.isInteger(cantidad) || cantidad < 1 || cantidad > 600 || !(monto > 0) || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return [];
  const total = cents(monto), part = Math.floor(total / cantidad);
  return Array.from({ length: cantidad }, (_, i) => ({ fechaVencimiento: addMonths(fecha, i), capital: (i === cantidad - 1 ? total - part * i : part) / 100 }));
}

function Capital({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => { setDraft(current => Number(current) === value ? current : String(value)); }, [value]);
  return <GroupedNumberField label="Capital" value={draft} onChange={raw => { setDraft(raw); onChange(Number(raw)); }} />;
}

export default function AmortizacionOptions({ tipo, opciones: o, onChange, cantidad, monto, fecha, moneda }: {
  tipo: string; opciones: OpcionesPlan; onChange: (value: OpcionesPlan) => void; cantidad: number; monto: number; fecha: string; moneda: string;
}) {
  const rows = o.calendario ?? [];
  // La cuadrícula siempre tiene una fila por cuota: se genera al elegir el método o al cambiar el plazo.
  useEffect(() => {
    if (tipo === 'personalizado' && rows.length !== cantidad) onChange({ ...o, calendario: generarHitos(cantidad, monto, fecha) });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tipo, cantidad]);

  if (tipo === 'cuota_fija') return <Alert severity="info">Cuota mensual fija: C = P × i(1+i)ⁿ / ((1+i)ⁿ − 1), con i = tasa anual / 12. La última cuota cancela el saldo exacto.</Alert>;
  if (tipo === 'solo_interes') return <Alert severity="info">Cuotas 1 a n−1 solo de interés sobre el saldo; la cuota n paga todo el capital más su interés.</Alert>;
  if (tipo !== 'personalizado') return null;

  const diff = descuadreCapital(rows, monto), ok = Math.abs(diff) < 0.005 && rows.length > 0;
  const fmt = (v: number) => new Intl.NumberFormat('es-HN', { style: 'currency', currency: moneda === 'USD' ? 'USD' : 'HNL' }).format(Math.abs(v));
  const set = (i: number, patch: Partial<HitoCapital>) => onChange({ ...o, calendario: rows.map((r, j) => j === i ? { ...r, ...patch } : r) });
  return (
    <Paper variant="outlined" sx={{ p: 1.5 }}>
      <Stack spacing={1.2}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" flexWrap="wrap" useFlexGap spacing={1}>
          <Typography fontWeight={800}>Abonos a capital por cuota</Typography>
          <Chip color={ok ? 'success' : 'error'} label={ok ? 'Capital cuadrado 100%' : `Descuadre por ${fmt(diff)}${diff < 0 ? ' (falta capital)' : ' (excede el desembolso)'}`} />
        </Stack>
        <Typography variant="caption">Define el capital de cada pago; el interés se calcula sobre el saldo. La suma debe ser igual al monto desembolsado para poder guardar.</Typography>
        <Box><Button size="small" onClick={() => onChange({ ...o, calendario: generarHitos(cantidad, monto, fecha) })}>Repartir capital en partes iguales</Button></Box>
        <TableContainer sx={{ maxHeight: 320 }}>
          <Table size="small" stickyHeader>
            <TableHead><TableRow><TableCell>#</TableCell><TableCell>Fecha de pago</TableCell><TableCell>Capital a pagar</TableCell></TableRow></TableHead>
            <TableBody>
              {rows.map((r, i) => (
                <TableRow key={i}>
                  <TableCell>{i + 1}</TableCell>
                  <TableCell><TextField size="small" type="date" disabled={i === 0} value={i === 0 ? fecha : r.fechaVencimiento} onChange={e => set(i, { fechaVencimiento: e.target.value })} /></TableCell>
                  <TableCell><Capital value={r.capital} onChange={capital => set(i, { capital })} /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Stack>
    </Paper>
  );
}
