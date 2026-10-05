import { Alert, Skeleton, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from '@mui/material';
import { useIqfShiftWeek } from '../../hooks/useDashboardData';
import { formatPeriodo, formatValue } from '../../utils/format';
import { iqfShiftMetrics } from '../../utils/iqfShiftComparison';

export default function IqfShiftWeekTable({ enabled }: { enabled: boolean }) {
  const { data, isLoading, isError } = useIqfShiftWeek(enabled);
  if (isLoading) return <Skeleton variant="rounded" height={300} />;
  if (isError) return <Alert severity="error">No se pudieron cargar los últimos 7 días.</Alert>;
  if (!data) return null;
  const value = (number: number | null) => number === null ? '—' : formatValue(number);
  return <>
    <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>{formatPeriodo(data.fechaInicial)} — {formatPeriodo(data.fechaFinal)}</Typography>
    <TableContainer sx={{ border: 1, borderColor: 'divider', borderRadius: 1, overflow: 'visible' }}>
      <Table size="small" aria-label="Comparación IQF de los últimos siete días" sx={{ width: '100%', tableLayout: 'fixed', '& td, & th': { px: { xs: 0.25, sm: 0.75 }, py: 0.5, fontSize: { xs: 9, sm: 11, md: 12 }, overflowWrap: 'anywhere', lineHeight: 1.25 }, '& td': { fontVariantNumeric: 'tabular-nums' } }}>
        <colgroup>
          <col style={{ width: '17%' }} />
          <col style={{ width: '8%' }} />
          {[1, 2, 3, 4, 5].map((column) => <col key={column} style={{ width: '15%' }} />)}
        </colgroup>
        <TableHead>
          <TableRow sx={{ bgcolor: 'action.hover' }}>
            <TableCell>Fecha</TableCell>
            <TableCell align="center">Turno</TableCell>
            {[1, 2, 3].map((number) => <TableCell key={number} align="center">IQF {number}<br />(lbs/h)</TableCell>)}
            <TableCell align="center">Sumatoria IQFs<br />(lbs/h)</TableCell>
            <TableCell align="center">Promedio por IQF activo<br />(lbs/h)</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {data.dias.map((day, index) => day.turnos.map((turno, shiftIndex) => {
            const metrics = iqfShiftMetrics(turno);
            return <TableRow key={`${day.dia}-${turno.turno}`} sx={{ bgcolor: index % 2 ? 'action.hover' : 'background.paper' }}>
              {shiftIndex === 0 && <TableCell rowSpan={day.turnos.length} sx={{ fontWeight: 600 }}>{formatPeriodo(day.dia)}</TableCell>}
              <TableCell align="center">{turno.turno}</TableCell>
              {turno.lineas.map((line) => <TableCell key={line.linea} align="center">{value(line.librasPorHora)}</TableCell>)}
              <TableCell align="center" sx={{ fontWeight: 700 }}>{value(metrics.sumatoria)}</TableCell>
              <TableCell align="center" sx={{ fontWeight: 700 }}>{value(metrics.promedio)}</TableCell>
            </TableRow>;
          }))}
        </TableBody>
      </Table>
    </TableContainer>
  </>;
}
