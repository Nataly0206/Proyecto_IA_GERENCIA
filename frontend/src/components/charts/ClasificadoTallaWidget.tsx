import {
  Alert,
  Box,
  CircularProgress,
  LinearProgress,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { useWidgetData } from '../../hooks/useDashboardData';
import { formatValue } from '../../utils/format';

/** Detalle por talla del rango y turno activos, cargado al abrir el diálogo. */
export default function ClasificadoTallaWidget() {
  const { data, isLoading, isError, error } = useWidgetData('clasificado-por-talla');
  const rows = [...(data ?? [])].sort((a, b) => Number(b.libras ?? 0) - Number(a.libras ?? 0));
  const total = rows.reduce((sum, row) => sum + Number(row.libras ?? 0), 0);

  if (isLoading) {
    return <Box sx={{ minHeight: 180, display: 'grid', placeItems: 'center' }}><CircularProgress size={32} /></Box>;
  }
  if (isError) {
    return <Alert severity="error">Error al cargar el detalle: {error instanceof Error ? error.message : 'desconocido'}</Alert>;
  }
  if (rows.length === 0) {
    return <Alert severity="info">Sin libras clasificadas por talla para los filtros seleccionados.</Alert>;
  }

  return (
    <Box>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
        Rango de fechas y turno seleccionados · fuente: STB_data
      </Typography>
      <TableContainer sx={{ maxHeight: '65vh', border: '1px solid', borderColor: 'divider', borderRadius: 1.5 }}>
        <Table size="small" stickyHeader sx={{ tableLayout: 'fixed' }}>
          <TableHead>
            <TableRow>
              <TableCell sx={{ width: '28%', fontWeight: 800, bgcolor: '#164a8b', color: '#fff' }}>Talla</TableCell>
              <TableCell align="right" sx={{ width: '28%', fontWeight: 800, bgcolor: '#164a8b', color: '#fff' }}>Libras clasificadas</TableCell>
              <TableCell aria-label="Porcentaje del total" sx={{ width: '44%', fontWeight: 800, bgcolor: '#164a8b', color: '#fff' }} />
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((row, index) => {
              const percentage = total > 0 ? Number(row.libras ?? 0) / total * 100 : 0;
              return <TableRow key={String(row.talla ?? 'Sin talla')} hover sx={{ bgcolor: index % 2 ? '#f8fafc' : '#fff' }}>
                <TableCell sx={{ fontWeight: 600 }}>{String(row.talla ?? 'Sin talla')}</TableCell>
                <TableCell align="right" sx={{ fontWeight: 700 }}>{formatValue(Number(row.libras ?? 0), 'number')}</TableCell>
                <TableCell>
                  <Stack direction="row" spacing={1} alignItems="center">
                    <LinearProgress variant="determinate" value={percentage} sx={{ flex: 1, height: 7, borderRadius: 1, bgcolor: '#e2e8f0', '& .MuiLinearProgress-bar': { bgcolor: '#1f7a5c', borderRadius: 1 } }} />
                    <Typography variant="caption" fontWeight={700} sx={{ width: 46, textAlign: 'right' }}>{percentage.toFixed(1)}%</Typography>
                  </Stack>
                </TableCell>
              </TableRow>;
            })}
            <TableRow>
              <TableCell sx={{ fontWeight: 800, bgcolor: '#e8eef7', borderTop: '2px solid #b8c7d9' }}>Total</TableCell>
              <TableCell align="right" sx={{ fontWeight: 800, bgcolor: '#e8eef7', borderTop: '2px solid #b8c7d9' }}>
                {formatValue(total, 'number')}
              </TableCell>
              <TableCell align="right" sx={{ fontWeight: 800, bgcolor: '#e8eef7', borderTop: '2px solid #b8c7d9' }}>100.0%</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}
