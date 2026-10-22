import { useEffect, useState } from 'react';
import { Alert, Box, Button, IconButton, MenuItem, Paper, Stack, TextField, Typography } from '@mui/material';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import GroupedNumberField from './GroupedNumberField';

export interface OpcionesPlan {
  gracia?: { periodos: number; tipo: 'parcial' | 'capitalizar' | 'diferir'; cobroDiferido?: 'primera' | 'repartido' | 'ultima' };
  interesPagoUnico?: 'simple' | 'compuesto';
  balon?: { valor: number; unidad: 'monto' | 'porcentaje'; base: 'cuota_fija' | 'capital_fijo' };
  crecimiento?: { modo: 'fijo' | 'variable'; porcentaje?: number; cadaPeriodos?: number; indice?: string; variaciones?: { periodo: number; porcentaje: number }[] };
  baseExtraordinarias?: 'cuota_fija' | 'capital_fijo';
  extraordinarias?: { periodo: number; monto: number }[];
  calendario?: { fechaVencimiento: string; capital: number; interes: number; cargos: number }[];
}
export const TIPO_LABEL: Record<string, string> = {
  cuota_fija: 'Francés · cuota nivelada', capital_fijo: 'Alemán · capital fijo', solo_interes: 'Americano · intereses y capital final',
  pago_unico: 'Pago único al vencimiento (Bullet)', balon: 'Cuota balón', creciente: 'Cuota creciente / índice variable',
  extraordinarias: 'Plan base con cuotas extraordinarias', manual: 'Calendario manual / pagarés escalonados',
};
export const opcionesIniciales = (tipo: string): OpcionesPlan => {
  if (tipo === 'pago_unico') return { interesPagoUnico: 'simple' };
  if (tipo === 'balon') return { balon: { valor: 30, unidad: 'porcentaje', base: 'cuota_fija' } };
  if (tipo === 'creciente') return { crecimiento: { modo: 'fijo', porcentaje: 2, cadaPeriodos: 1 } };
  if (tipo === 'extraordinarias') return { baseExtraordinarias: 'cuota_fija', extraordinarias: [{ periodo: 1, monto: 0 }] };
  if (tipo === 'manual') return { calendario: [] };
  return {};
};
export function descripcionOpciones(o: OpcionesPlan): string {
  const parts: string[] = [];
  if (o.gracia) parts.push(`${o.gracia.periodos} períodos de gracia ${o.gracia.tipo === 'parcial' ? 'parcial' : 'total'} · ${o.gracia.tipo === 'capitalizar' ? 'intereses capitalizados' : o.gracia.tipo === 'diferir' ? `intereses diferidos (${o.gracia.cobroDiferido})` : 'solo intereses'}`);
  if (o.interesPagoUnico) parts.push(`Interés ${o.interesPagoUnico}`);
  if (o.balon) parts.push(`Capital balón: ${o.balon.valor.toLocaleString('en-US')}${o.balon.unidad === 'porcentaje' ? '%' : ''} · ${TIPO_LABEL[o.balon.base]}`);
  if (o.crecimiento) parts.push(o.crecimiento.modo === 'fijo' ? `Aumento de ${o.crecimiento.porcentaje}% cada ${o.crecimiento.cadaPeriodos} períodos` : `Índice: ${o.crecimiento.indice} · variaciones cargadas por período: ${o.crecimiento.variaciones?.map(r => `${r.periodo}: ${r.porcentaje}%`).join(', ')}`);
  if (o.extraordinarias) parts.push(`Abonos programados · ${o.extraordinarias.map(r => `período ${r.periodo}: ${r.monto.toLocaleString('en-US')}`).join(', ')}`);
  if (o.calendario) parts.push('Capital, intereses y cargos definidos en el calendario manual.');
  return parts.join(' · ');
}

function Monto({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => { setDraft(current => Number(current) === value ? current : String(value)); }, [value]);
  return <GroupedNumberField label={label} value={draft} onChange={raw => { setDraft(raw); onChange(Number(raw)); }} />;
}
const GRID = { display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr' }, gap: 1 };

export default function AmortizacionOptions({ tipo, opciones: o, onChange, cantidad, monto, fecha, frecuencia, cargo }: {
  tipo: string; opciones: OpcionesPlan; onChange: (value: OpcionesPlan) => void; cantidad: number; monto: number; fecha: string; frecuencia: string; cargo: number;
}) {
  const baseChoices = ['cuota_fija', 'capital_fijo'].map(value => <MenuItem key={value} value={value}>{TIPO_LABEL[value]}</MenuItem>);
  const generateCalendar = () => {
    if (!Number.isInteger(cantidad) || cantidad < 1 || cantidad > 1000 || !fecha || !Number.isFinite(monto)) return;
    const first = new Date(`${fecha}T00:00:00Z`);
    if (!Number.isFinite(first.getTime())) return;
    const capitalCents = Math.round(monto * 100), part = Math.floor(capitalCents / cantidad);
    const months: Record<string, number> = { mensual: 1, trimestral: 3, semestral: 6, anual: 12 };
    const calendario = Array.from({ length: cantidad }, (_, i) => {
      let date = new Date(first);
      if (months[frecuencia]) {
        date = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + months[frecuencia] * i, 1));
        date.setUTCDate(Math.min(first.getUTCDate(), new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)).getUTCDate()));
      } else date.setUTCDate(first.getUTCDate() + i * (frecuencia === 'semanal' ? 7 : 15));
      return { fechaVencimiento: date.toISOString().slice(0, 10), capital: (i === cantidad - 1 ? capitalCents - part * i : part) / 100, interes: 0, cargos: cargo };
    });
    onChange({ ...o, calendario });
  };
  return <Paper variant="outlined" sx={{ p: 1.5 }}><Stack spacing={1.3}>
    <Typography fontWeight={800}>Condiciones de amortización</Typography>
    {tipo === 'pago_unico' && <>
      <TextField select size="small" label="Acumulación de intereses" value={o.interesPagoUnico ?? 'simple'} onChange={e => onChange({ ...o, interesPagoUnico: e.target.value as 'simple' | 'compuesto' })}>
        <MenuItem value="simple">Simple · capital × tasa por período × plazo</MenuItem><MenuItem value="compuesto">Compuesto · capitalización por período</MenuItem>
      </TextField>
      <Alert severity="info">Se genera un solo pago en la fecha de vencimiento. El plazo en períodos se usa para calcular los intereses; no se generan cobros intermedios.</Alert>
    </>}
    {tipo === 'balon' && o.balon && <>
      <Box sx={GRID}>
        <TextField select size="small" label="Cuotas regulares" value={o.balon.base} onChange={e => onChange({ ...o, balon: { ...o.balon!, base: e.target.value as 'cuota_fija' | 'capital_fijo' } })}>{baseChoices}</TextField>
        <TextField select size="small" label="Definir capital balón como" value={o.balon.unidad} onChange={e => onChange({ ...o, balon: { ...o.balon!, unidad: e.target.value as 'monto' | 'porcentaje', valor: 0 } })}>
          <MenuItem value="porcentaje">Porcentaje del monto recibido</MenuItem><MenuItem value="monto">Monto de capital</MenuItem>
        </TextField>
        <Monto label={o.balon.unidad === 'porcentaje' ? 'Capital balón (%)' : 'Capital balón (monto)'} value={o.balon.valor} onChange={valor => onChange({ ...o, balon: { ...o.balon!, valor } })} />
      </Box>
      <Typography variant="caption">La última cuota paga ese capital más el interés del período. Las cuotas anteriores amortizan el resto.</Typography>
    </>}
    {tipo === 'creciente' && o.crecimiento && <>
      <TextField select size="small" label="Crecimiento de la cuota" value={o.crecimiento.modo} onChange={e => onChange({ ...o, crecimiento: e.target.value === 'fijo' ? { modo: 'fijo', porcentaje: 2, cadaPeriodos: 1 } : { modo: 'variable', indice: '', variaciones: [{ periodo: (o.gracia?.periodos ?? 0) + 2, porcentaje: 0 }] } })}>
        <MenuItem value="fijo">Porcentaje fijo</MenuItem><MenuItem value="variable">Índice variable · valores ingresados por período</MenuItem>
      </TextField>
      {o.crecimiento.modo === 'fijo' ? <Box sx={GRID}>
        <TextField size="small" type="number" label="Incremento (%)" inputProps={{ min: 0, max: 100, step: 0.0001 }} value={o.crecimiento.porcentaje} onChange={e => onChange({ ...o, crecimiento: { ...o.crecimiento!, porcentaje: Number(e.target.value) } })} />
        <TextField size="small" type="number" label="Aumentar cada N períodos" inputProps={{ min: 1, max: cantidad, step: 1 }} value={o.crecimiento.cadaPeriodos} onChange={e => onChange({ ...o, crecimiento: { ...o.crecimiento!, cadaPeriodos: Number(e.target.value) } })} />
      </Box> : <>
        <TextField size="small" label="Nombre del índice / referencia" value={o.crecimiento.indice ?? ''} inputProps={{ maxLength: 100 }} onChange={e => onChange({ ...o, crecimiento: { ...o.crecimiento!, indice: e.target.value } })} />
        <Alert severity="info">Ingresa la variación porcentual de la cuota para cada período de cambio. Se aplica acumulativamente; los períodos sin fila conservan el nivel anterior. No hay conexión automática a una fuente de inflación. La tasa del préstamo permanece fija.</Alert>
        {o.crecimiento.variaciones?.map((row, i) => <Stack key={i} direction="row" spacing={1} alignItems="center">
          <TextField size="small" type="number" label="Período" value={row.periodo} inputProps={{ min: (o.gracia?.periodos ?? 0) + 2, max: cantidad, step: 1 }} onChange={e => onChange({ ...o, crecimiento: { ...o.crecimiento!, variaciones: o.crecimiento!.variaciones!.map((r, j) => j === i ? { ...r, periodo: Number(e.target.value) } : r) } })} />
          <TextField size="small" type="number" label="Variación (%)" value={row.porcentaje} inputProps={{ min: -99.9999, max: 100, step: 0.0001 }} onChange={e => onChange({ ...o, crecimiento: { ...o.crecimiento!, variaciones: o.crecimiento!.variaciones!.map((r, j) => j === i ? { ...r, porcentaje: Number(e.target.value) } : r) } })} />
          <IconButton aria-label={`Quitar variación ${i + 1}`} onClick={() => onChange({ ...o, crecimiento: { ...o.crecimiento!, variaciones: o.crecimiento!.variaciones!.filter((_, j) => j !== i) } })}><DeleteOutlineIcon /></IconButton>
        </Stack>)}
        <Button size="small" disabled={(o.crecimiento.variaciones?.length ?? 0) >= cantidad - 1} onClick={() => onChange({ ...o, crecimiento: { ...o.crecimiento!, variaciones: [...o.crecimiento!.variaciones ?? [], { periodo: Math.min(cantidad, Math.max((o.gracia?.periodos ?? 0) + 1, ...o.crecimiento!.variaciones!.map(r => r.periodo)) + 1), porcentaje: 0 }] } })}>Agregar variación</Button>
      </>}
    </>}
    {tipo === 'extraordinarias' && <>
      <TextField select size="small" label="Método del plan base" value={o.baseExtraordinarias ?? 'cuota_fija'} onChange={e => onChange({ ...o, baseExtraordinarias: e.target.value as 'cuota_fija' | 'capital_fijo' })}>{baseChoices}</TextField>
      <Typography variant="caption">Abonos adicionales a capital en los períodos elegidos. Conserva las cuotas regulares del plan base y puede terminar antes; los intereses disminuyen con el saldo.</Typography>
      {o.extraordinarias?.map((row, i) => <Stack key={i} direction="row" spacing={1} alignItems="center">
        <TextField size="small" type="number" label="Período" inputProps={{ min: (o.gracia?.periodos ?? 0) + 1, max: cantidad, step: 1 }} value={row.periodo} onChange={e => onChange({ ...o, extraordinarias: o.extraordinarias!.map((r, j) => j === i ? { ...r, periodo: Number(e.target.value) } : r) })} />
        <Monto label="Abono a capital" value={row.monto} onChange={monto => onChange({ ...o, extraordinarias: o.extraordinarias!.map((r, j) => j === i ? { ...r, monto } : r) })} />
        <IconButton aria-label={`Quitar abono ${i + 1}`} onClick={() => onChange({ ...o, extraordinarias: o.extraordinarias!.filter((_, j) => j !== i) })}><DeleteOutlineIcon /></IconButton>
      </Stack>)}
      <Button size="small" disabled={(o.extraordinarias?.length ?? 0) >= cantidad} onClick={() => onChange({ ...o, extraordinarias: [...o.extraordinarias ?? [], { periodo: Math.min(cantidad, Math.max(o.gracia?.periodos ?? 0, ...o.extraordinarias!.map(r => r.periodo)) + 1), monto: 0 }] })}>Agregar abono programado</Button>
    </>}
    {!['pago_unico', 'manual'].includes(tipo) && <>
      <Box sx={GRID}>
        <TextField select size="small" label="Período de gracia" value={o.gracia?.tipo ?? 'ninguna'} onChange={e => onChange({ ...o, gracia: e.target.value === 'ninguna' ? undefined : { periodos: 1, tipo: e.target.value as 'parcial' | 'capitalizar' | 'diferir', cobroDiferido: 'repartido' } })}>
          <MenuItem value="ninguna">Sin gracia</MenuItem><MenuItem value="parcial">Parcial · pagar solo intereses</MenuItem><MenuItem value="capitalizar">Total · capitalizar intereses</MenuItem><MenuItem value="diferir">Total · diferir intereses</MenuItem>
        </TextField>
        {o.gracia && <TextField size="small" type="number" label="Períodos iniciales de gracia" inputProps={{ min: 1, max: cantidad - 1, step: 1 }} value={o.gracia.periodos} onChange={e => onChange({ ...o, gracia: { ...o.gracia!, periodos: Number(e.target.value) } })} />}
        {o.gracia?.tipo === 'diferir' && <TextField select size="small" label="Cobrar intereses diferidos" value={o.gracia.cobroDiferido ?? 'repartido'} onChange={e => onChange({ ...o, gracia: { ...o.gracia!, cobroDiferido: e.target.value as 'primera' | 'repartido' | 'ultima' } })}>
          <MenuItem value="primera">Primera cuota después de la gracia</MenuItem><MenuItem value="repartido">Repartidos entre las cuotas restantes</MenuItem><MenuItem value="ultima">Última cuota</MenuItem>
        </TextField>}
      </Box>
      {o.gracia && <Typography variant="caption">La gracia está incluida en el plazo total. {o.gracia.tipo === 'capitalizar' ? 'Los intereses se suman al capital y generan intereses posteriores.' : o.gracia.tipo === 'diferir' ? 'Los intereses se cobran después, sin generar intereses sobre ellos.' : 'Durante la gracia se cobran intereses y cargos; el capital comienza a amortizarse después.'}</Typography>}
    </>}
    {tipo === 'manual' && <>
      <Alert severity="info">Define fechas, capital, intereses y cargos de cada pagaré. La tasa anual es informativa: el sistema respeta los importes ingresados. El capital debe sumar el monto recibido.</Alert>
      <Button size="small" onClick={generateCalendar}>Generar / restablecer {cantidad} filas con capital repartido</Button>
      <Typography variant="caption">Este botón reemplaza las filas del borrador. Ajusta las fechas y los importes antes de registrar el préstamo.</Typography>
      <Stack spacing={1} sx={{ maxHeight: 380, overflowY: 'auto' }}>
        {o.calendario?.map((row, i) => <Paper key={i} variant="outlined" sx={{ p: 1 }}>
          <Typography variant="caption" fontWeight={800}>Cuota {i + 1}</Typography>
          <Box sx={GRID}>
            <TextField size="small" type="date" label="Vencimiento" InputLabelProps={{ shrink: true }} value={row.fechaVencimiento} onChange={e => onChange({ ...o, calendario: o.calendario!.map((r, j) => j === i ? { ...r, fechaVencimiento: e.target.value } : r) })} />
            {(['capital', 'interes', 'cargos'] as const).map(key => <Monto key={key} label={key === 'capital' ? 'Capital' : key === 'interes' ? 'Interés' : 'Cargos'} value={row[key]} onChange={value => onChange({ ...o, calendario: o.calendario!.map((r, j) => j === i ? { ...r, [key]: value } : r) })} />)}
          </Box>
        </Paper>)}
      </Stack>
    </>}
  </Stack></Paper>;
}
