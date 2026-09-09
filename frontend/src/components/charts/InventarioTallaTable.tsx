import { ReactNode, useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Button,
  Skeleton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import { DashboardEndpoint } from '../../types';
import { useWidgetData } from '../../hooks/useDashboardData';
import { formatValue } from '../../utils/format';
import ClasificadoInventarioDetalleDialog from './ClasificadoInventarioDetalleDialog';

interface InventarioTallaTableProps {
  title: string;
  icon: ReactNode;
  endpoint: DashboardEndpoint;
  subtitle?: string;
  emptyText?: string;
  maxHeight?: number;
}

const HEADER_SX = { fontWeight: 800, bgcolor: '#f1f5f9', color: '#172033' } as const;

/**
 * Tabla transpuesta del inventario de clasificado disponible: columnas =
 * talla, filas = Bins / Libras, con columna de Total. Misma fuente que
 * `clasificado-inventario` (una fila por talla en el endpoint), reordenada
 * aquí a metrica x talla en vez de talla x metrica.
 */
export default function InventarioTallaTable({
  title,
  icon,
  endpoint,
  subtitle,
  emptyText = 'Sin inventario de clasificado disponible.',
  maxHeight = 300,
}: InventarioTallaTableProps) {
  const { data, isLoading, isError, error, dataUpdatedAt } = useWidgetData(endpoint);
  const [detailOpen, setDetailOpen] = useState(false);

  const { tallas, bins, libras, totalBins, totalLibras } = useMemo(() => {
    const rows = data ?? [];
    const sorted = [...rows].sort((a, b) => Number(b.libras ?? 0) - Number(a.libras ?? 0));
    const tallasList = sorted.map((r) => String(r.talla ?? ''));
    const binsMap = new Map(sorted.map((r) => [String(r.talla ?? ''), Number(r.bins ?? 0)]));
    const librasMap = new Map(sorted.map((r) => [String(r.talla ?? ''), Number(r.libras ?? 0)]));
    return {
      tallas: tallasList,
      bins: binsMap,
      libras: librasMap,
      totalBins: sorted.reduce((acc, r) => acc + Number(r.bins ?? 0), 0),
      totalLibras: sorted.reduce((acc, r) => acc + Number(r.libras ?? 0), 0),
    };
  }, [data]);

  return (
    <Box>
      <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1} mb={0.9} flexWrap="wrap" useFlexGap>
        <Stack direction="row" alignItems="center" spacing={0.75} flexWrap="wrap" useFlexGap>
          {icon}
          <Typography variant="subtitle2" fontWeight={800} sx={{ fontSize: 13 }}>{title}</Typography>
          {subtitle && <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11 }}>{subtitle}{dataUpdatedAt ? ` · actualizado ${new Date(dataUpdatedAt).toLocaleTimeString()}` : ''}</Typography>}
        </Stack>
        <Button size="small" variant="outlined" startIcon={<VisibilityOutlinedIcon />} onClick={() => setDetailOpen(true)}>
          Ver detalle
        </Button>
      </Stack>

      {isLoading && <Skeleton variant="rounded" height={160} />}

      {isError && (
        <Alert severity="error" sx={{ py: 0.5 }}>
          Error al cargar datos: {error instanceof Error ? error.message : 'desconocido'}
        </Alert>
      )}

      {!isLoading && !isError && tallas.length === 0 && (
        <Alert severity="info" sx={{ py: 0.5 }}>
          {emptyText}
        </Alert>
      )}

      {!isLoading && !isError && tallas.length > 0 && (
        <TableContainer
          sx={{ maxHeight, borderRadius: 1, border: '1px solid rgba(148, 163, 184, 0.18)' }}
        >
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell sx={HEADER_SX}>Talla</TableCell>
                {tallas.map((talla) => (
                  <TableCell key={talla} align="right" sx={HEADER_SX}>
                    {talla}
                  </TableCell>
                ))}
                <TableCell align="right" sx={HEADER_SX}>
                  Total
                </TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              <TableRow hover>
                <TableCell sx={{ fontWeight: 600 }}>Bins</TableCell>
                {tallas.map((talla) => (
                  <TableCell key={talla} align="right">
                    {formatValue(bins.get(talla) ?? 0, 'number')}
                  </TableCell>
                ))}
                <TableCell align="right" sx={{ fontWeight: 600 }}>
                  {formatValue(totalBins, 'number')}
                </TableCell>
              </TableRow>
              <TableRow hover>
                <TableCell sx={{ fontWeight: 600 }}>Libras</TableCell>
                {tallas.map((talla) => (
                  <TableCell key={talla} align="right">
                    {formatValue(libras.get(talla) ?? 0, 'number')}
                  </TableCell>
                ))}
                <TableCell align="right" sx={{ fontWeight: 600 }}>
                  {formatValue(totalLibras, 'number')}
                </TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </TableContainer>
      )}
      {detailOpen && <ClasificadoInventarioDetalleDialog open={detailOpen} onClose={() => setDetailOpen(false)} />}
    </Box>
  );
}
