import { Alert, Box, Paper, Skeleton, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Tooltip, Typography } from '@mui/material';
import { useWidgetData } from '../../hooks/useDashboardData';
import { ChartConfig } from '../../types';
import DynamicChart from './DynamicChart';
import ErrorBoundary from '../ErrorBoundary';
import { formatPeriodo } from '../../utils/format';

const formatHours = (value: number) => value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function IqfWorkedHoursTable({ mode = 'dia', view = 'table', config }: { mode?: 'dia' | 'mes'; view?: 'table' | 'chart' | 'trend'; config?: ChartConfig }) {
  const monthly = mode === 'mes';
  const { data, isLoading, isError, error } = useWidgetData(monthly ? 'iqf-horas-trabajadas-mes' : 'iqf-horas-trabajadas');
  const cells = data ?? [];
  const lines = [...new Set(cells.map((row) => String(row.linea)))].sort();
  const dates = [...new Set(cells.map((row) => String(row.periodo)))].sort();
  const lookup = new Map(cells.map((row) => [`${row.periodo}|${row.linea}`, Number(row.horas)]));
  const totalFor = (line: string) => cells.filter((row) => row.linea === line).reduce((sum, row) => sum + Number(row.horas), 0);
  const countFor = (line: string) => cells.filter((row) => row.linea === line).length;
  const total = cells.reduce((sum, row) => sum + Number(row.horas), 0);

  return (
    <Paper elevation={0} sx={{ p: config ? 0 : 1.5, border: config ? 0 : 1, borderColor: 'divider', flexShrink: 0, height: config ? '100%' : 'auto', minHeight: 0 }}>
      {!config && <>
      <Typography variant="subtitle2" fontWeight={800}>Horas Trabajadas por IQF — {monthly ? 'Mensual' : 'Diario'}</Typography>
      <Typography variant="caption" color="text.secondary">
        {monthly ? 'Últimos 12 meses y turno seleccionado · horas acumuladas por mes' : 'Rango de fechas y turno seleccionados · horas entre primera y última lectura de cada turno'}
      </Typography>
      </>}
      {isLoading ? <Skeleton height={160} /> : isError ? (
        <Alert severity="error" sx={{ mt: 1 }}>No se pudieron cargar las horas: {error instanceof Error ? error.message : 'Error de consulta'}</Alert>
      ) : cells.length === 0 ? (
        <Alert severity="info" sx={{ mt: 1 }}>Sin registros válidos para las fechas y turno seleccionados.</Alert>
      ) : view !== 'table' && config ? (
        <ErrorBoundary label="Error al renderizar horas trabajadas">
          <Box sx={{ mt: 1 }}>
            <DynamicChart config={{
              ...config,
              id: monthly ? 'iqf-horas-trabajadas-mes' : 'iqf-horas-trabajadas',
              endpoint: monthly ? 'iqf-horas-trabajadas-mes' : 'iqf-horas-trabajadas',
              title: `Horas Trabajadas por IQF — ${monthly ? 'Mensual' : 'Diario'}`,
              yField: 'horas',
              weightField: undefined,
              valueFormat: 'decimal',
              unitLabel: 'h',
              totalAggregation: 'sum',
              showPeriodAverageSeries: false,
            }} data={cells} />
          </Box>
        </ErrorBoundary>
      ) : (
        <Box sx={{ mt: 1 }}>
          <TableContainer sx={{ height: config?.height ?? 340, maxHeight: config?.height ?? 340, border: 1, borderColor: 'divider', borderRadius: 1 }}>
            <Table stickyHeader size="small" aria-label="Horas trabajadas por IQF" sx={{
              '& th': { bgcolor: '#f1f5f9', fontWeight: 800, whiteSpace: 'nowrap' },
              '& td': { whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' },
              '& th, & td': { px: 1.25, py: 1 },
            }}>
              <TableHead><TableRow>
                <TableCell>{monthly ? 'Mes' : 'Fecha'}</TableCell>
                {lines.map((line) => <TableCell key={line} align="right">
                  <Tooltip title={line}><span>{line}</span></Tooltip>
                </TableCell>)}
                <TableCell align="right">Promedio</TableCell>
              </TableRow></TableHead>
              <TableBody>
                {dates.map((date) => {
                  const values = cells.filter((row) => row.periodo === date).map((row) => Number(row.horas));
                  const average = values.reduce((sum, value) => sum + value, 0) / values.length;
                  return <TableRow key={date}>
                  <TableCell>{formatPeriodo(date)}</TableCell>
                  {lines.map((line) => {
                    const hours = lookup.get(`${date}|${line}`);
                    return <TableCell key={line} align="right">{hours === undefined ? '—' : formatHours(hours)}</TableCell>;
                  })}
                  <TableCell align="right">{formatHours(average)}</TableCell>
                </TableRow>;
                })}
                <TableRow sx={{ '& td': { fontWeight: 800, bgcolor: '#e8eef7', position: 'sticky', bottom: 0, borderTop: '2px solid #b8c7d9' } }}>
                  <TableCell>Promedio {monthly ? 'mensual' : 'diario'}</TableCell>
                  {lines.map((line) => <TableCell key={line} align="right">{formatHours(totalFor(line) / countFor(line))}</TableCell>)}
                  <TableCell align="right">{formatHours(dates.reduce((sum, date) => {
                    const values = cells.filter((row) => row.periodo === date);
                    return sum + values.reduce((subtotal, row) => subtotal + Number(row.horas), 0) / values.length;
                  }, 0) / dates.length)}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </TableContainer>
          <Typography variant="body2" fontWeight={800} sx={{ mt: 1 }}>
            Promedio general: {formatHours(total / cells.length)} h
          </Typography>
          <Typography variant="caption" color="text.secondary">
            Horas decimales · — sin registro · promedios sobre registros válidos.
          </Typography>
        </Box>
      )}
    </Paper>
  );
}
