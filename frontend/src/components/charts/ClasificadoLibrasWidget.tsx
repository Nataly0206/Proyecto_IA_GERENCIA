import { ReactNode } from 'react';
import { Alert, Box, Card, CardContent, Chip, LinearProgress, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from '@mui/material';
import { DataRow } from '../../types';
import { useFilters } from '../../context/FiltersContext';
import { useWidgetData } from '../../hooks/useDashboardData';
import { formatPeriodo, formatValue } from '../../utils/format';

type Vista = 'dia' | 'semana' | 'mes';

/** Número de semana ISO: lunes a domingo. */
function numeroSemana(day: string): number {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  return Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

export function clasificadoLibrasPorPeriodo(rows: DataRow[], vista: Vista, year: string): DataRow[] {
  const totals = new Map<string, number>();
  if (vista === 'mes') {
    for (let month = 1; month <= 12; month += 1) {
      totals.set(`${year}-${String(month).padStart(2, '0')}`, 0);
    }
  }
  for (const row of rows) {
    const day = String(row.periodo ?? '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
    let periodo = day;
    if (vista === 'mes') {
      if (day.slice(0, 4) !== year) continue;
      periodo = day.slice(0, 7);
    } else if (vista === 'semana') {
      const date = new Date(`${day}T00:00:00Z`);
      date.setUTCDate(date.getUTCDate() - (date.getUTCDay() + 6) % 7);
      periodo = date.toISOString().slice(0, 10);
    }
    const libras = Number(row.libras ?? 0);
    totals.set(periodo, (totals.get(periodo) ?? 0) + (Number.isFinite(libras) ? libras : 0));
  }
  return [...totals].sort(([a], [b]) => a.localeCompare(b))
    .map(([periodo, libras]) => ({ periodo, libras, concepto: 'Libras clasificadas' }));
}

export default function ClasificadoLibrasWidget({ vista, actions }: { vista: Vista; actions: ReactNode }) {
  const { filters } = useFilters();
  const year = filters.fechaFinal.slice(0, 4);
  const { data, isLoading, isError } = useWidgetData('clasificado-por-talla-dia',
    vista === 'mes' ? { fechaInicial: `${year}-01-01`, fechaFinal: `${year}-12-31` } : undefined);
  const rows = clasificadoLibrasPorPeriodo(data ?? [], vista, year);
  const total = rows.reduce((sum, row) => sum + Number(row.libras), 0);
  const active = rows.filter((row) => Number(row.libras) > 0).length;
  const periodLabel = vista === 'dia' ? 'Fecha' : vista === 'semana' ? 'Semana' : 'Mes';
  return (
    <Card sx={{ flexShrink: 0 }}>
      <CardContent sx={{ p: 1.5, '&:last-child': { pb: 1.5 } }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between" useFlexGap sx={{ flexWrap: 'wrap', gap: 1 }} mb={1.5}>
          <Box>
            <Typography variant="subtitle2" fontWeight={800}>Clasificado — Libras</Typography>
            <Typography variant="caption" color="text.secondary">
              {vista === 'mes' ? `Los 12 meses de ${year}`
                : `Rango seleccionado${vista === 'semana' ? ' · semanas desde el lunes' : ''}`} · turno del filtro
            </Typography>
          </Box>
          <Box sx={{ ml: 'auto', maxWidth: '100%', overflowX: 'auto' }}>{actions}</Box>
        </Stack>
        {isLoading ? <LinearProgress /> : isError ? <Alert severity="error">No se pudieron cargar las libras clasificadas.</Alert> : rows.length === 0 ? <Alert severity="info">Sin producción en el rango seleccionado.</Alert> : <>
          <Stack direction="row" useFlexGap sx={{ flexWrap: 'wrap', gap: 1, mb: 1.5 }}>
            <Chip size="small" label={`Acumulado: ${formatValue(total)} lbs`} sx={{ bgcolor: 'rgba(22,74,139,0.08)', color: 'primary.main', fontWeight: 700 }} />
            <Chip size="small" variant="outlined" label={`Promedio por ${vista === 'dia' ? 'día' : vista === 'semana' ? 'semana' : 'mes'} con producción: ${formatValue(active ? total / active : 0)} lbs`} />
          </Stack>
          <TableContainer sx={{ maxHeight: 410, border: 1, borderColor: 'divider', borderRadius: 1 }}>
            <Table size="small" stickyHeader aria-label="Libras clasificadas por período">
              <TableHead><TableRow>
                <TableCell sx={{ bgcolor: '#f1f5f9', fontWeight: 800 }}>{periodLabel}</TableCell>
                <TableCell align="right" sx={{ bgcolor: '#f1f5f9', fontWeight: 800 }}>Libras clasificadas</TableCell>
                <TableCell align="right" sx={{ bgcolor: '#f1f5f9', fontWeight: 800, whiteSpace: 'nowrap' }}>Participación del total</TableCell>
              </TableRow></TableHead>
              <TableBody>
                {rows.map((row) => <TableRow key={String(row.periodo)} hover sx={{ '&:nth-of-type(even)': { bgcolor: 'rgba(22,74,139,0.025)' } }}>
                  <TableCell sx={{ fontWeight: 600, width: '40%' }}>{formatPeriodo(String(row.periodo))}{vista === 'semana' && ` · Semana ${numeroSemana(String(row.periodo))}`}</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                    {formatValue(Number(row.libras))}
                  </TableCell>
                  <TableCell align="right">
                    <Stack direction="row" alignItems="center" justifyContent="flex-end" spacing={1}>
                      <LinearProgress variant="determinate"
                        value={total > 0 ? Number(row.libras) / total * 100 : 0}
                        aria-label="Porcentaje del total de libras"
                        sx={{ width: { xs: 70, sm: 180 }, height: 7, borderRadius: 3, bgcolor: 'rgba(22,74,139,0.07)', '& .MuiLinearProgress-bar': { borderRadius: 3 } }} />
                      <Typography variant="body2" sx={{ minWidth: 55, fontWeight: 600, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                        {(total > 0 ? Number(row.libras) / total * 100 : 0).toLocaleString('es-HN', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%
                      </Typography>
                    </Stack>
                  </TableCell>
                </TableRow>)}
                <TableRow sx={{ position: 'sticky', bottom: 0, bgcolor: '#e8eef7', '& td': { fontWeight: 800, borderBottom: 0 } }}>
                  <TableCell>Total acumulado</TableCell><TableCell align="right">{formatValue(total)} lbs</TableCell>
                  <TableCell align="right">{total > 0 ? '100%' : '0%'}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </TableContainer>
        </>}
      </CardContent>
    </Card>
  );
}
