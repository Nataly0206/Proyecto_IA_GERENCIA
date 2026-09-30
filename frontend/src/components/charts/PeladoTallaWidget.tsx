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
import { apiClient } from '../../api/client';
import { formatValue } from '../../utils/format';

type SizeOrderResponse = { order: string[]; sizes: string[] };

/**
 * Tabla de libras peladas por talla totalizadas sobre el rango y turno
 * elegidos. Se monta únicamente al abrir el diálogo "Ver por talla".
 */
export default function PeladoTallaWidget() {
  const { data, isLoading, isError, error } = useWidgetData('pelado-por-talla');
  const { data: sizeOrder } = useQuery<SizeOrderResponse>({
    queryKey: ['clasificado', 'orden-tallas'],
    queryFn: async () => (await apiClient.get<SizeOrderResponse>('/dashboard/pelado-orden-tallas')).data,
    staleTime: 5 * 60 * 1000,
  });
  const orderedSizes = useMemo(() => {
    const sizes = new Set(sizeOrder?.sizes ?? []);
    return [
      ...(sizeOrder?.order ?? []).filter((size) => sizes.delete(size)),
      ...Array.from(sizes).sort((a, b) => a.localeCompare(b, 'es', { numeric: true, sensitivity: 'base' })),
    ];
  }, [sizeOrder]);
  const rows = useMemo(() => {
    const positions = new Map(orderedSizes.map((size, index) => [size, index]));
    return [...(data ?? [])].sort((a, b) => {
      const aSize = String(a.talla ?? 'Sin talla');
      const bSize = String(b.talla ?? 'Sin talla');
      const aPosition = positions.get(aSize) ?? Number.MAX_SAFE_INTEGER;
      const bPosition = positions.get(bSize) ?? Number.MAX_SAFE_INTEGER;
      return aPosition - bPosition
        || aSize.localeCompare(bSize, 'es', { numeric: true, sensitivity: 'base' });
    });
  }, [data, orderedSizes]);
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
      <TableContainer sx={{ maxHeight: '65vh', border: '1px solid', borderColor: 'divider', borderRadius: 1.5 }}>
        <Table size="small" stickyHeader sx={{ tableLayout: 'fixed' }}>
          <TableHead>
            <TableRow>
              <TableCell sx={{ width: '28%', fontWeight: 800, bgcolor: '#164a8b', color: '#fff' }}>Talla</TableCell>
              <TableCell align="right" sx={{ width: '28%', fontWeight: 800, bgcolor: '#164a8b', color: '#fff' }}>Libras peladas</TableCell>
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
import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
