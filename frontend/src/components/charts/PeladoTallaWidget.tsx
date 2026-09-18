import {
  Alert,
  Box,
  CircularProgress,
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

/**
 * Tabla de libras peladas por talla totalizadas sobre el rango y turno
 * elegidos. Se monta únicamente al abrir el diálogo "Ver por talla".
 */
export default function PeladoTallaWidget() {
  const { data, isLoading, isError, error } = useWidgetData('pelado-por-talla');
  const rows = [...(data ?? [])].sort((a, b) => Number(b.libras ?? 0) - Number(a.libras ?? 0));
  const total = rows.reduce((sum, row) => sum + Number(row.libras ?? 0), 0);

  if (isLoading) {
    return <Box sx={{ minHeight: 180, display: 'grid', placeItems: 'center' }}><CircularProgress size={32} /></Box>;
  }
  if (isError) {
    return <Alert severity="error">Error al cargar el detalle: {error instanceof Error ? error.message : 'desconocido'}</Alert>;
  }
  if (rows.length === 0) {
    return <Alert severity="info">Sin libras por talla para los filtros seleccionados.</Alert>;
  }

  return (
    <Box>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
        Rango de fechas y turno seleccionados · fuente: STB_data
      </Typography>
      <TableContainer sx={{ maxHeight: '65vh', border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell sx={{ fontWeight: 800, bgcolor: '#f1f5f9' }}>Talla</TableCell>
              <TableCell align="right" sx={{ fontWeight: 800, bgcolor: '#f1f5f9' }}>Libras peladas</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {rows.map((row) => (
              <TableRow key={String(row.talla ?? 'Sin talla')} hover>
                <TableCell sx={{ fontWeight: 600 }}>{String(row.talla ?? 'Sin talla')}</TableCell>
                <TableCell align="right">{formatValue(Number(row.libras ?? 0), 'number')}</TableCell>
              </TableRow>
            ))}
            <TableRow>
              <TableCell sx={{ fontWeight: 800, bgcolor: '#e8eef7', borderTop: '2px solid #b8c7d9' }}>Total</TableCell>
              <TableCell align="right" sx={{ fontWeight: 800, bgcolor: '#e8eef7', borderTop: '2px solid #b8c7d9' }}>
                {formatValue(total, 'number')}
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </TableContainer>
    </Box>
  );
}
