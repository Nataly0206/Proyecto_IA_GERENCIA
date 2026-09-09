import { ReactNode, useMemo } from 'react';
import {
  Alert,
  Box,
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
import { useWidgetData } from '../../hooks/useDashboardData';
import { formatValue } from '../../utils/format';

interface Props {
  title: string;
  icon: ReactNode;
  subtitle?: string;
  emptyText?: string;
  maxHeight?: number;
}

interface SourceRow {
  proveedor: string;
  talla: string;
  total: number;
}

const HEADER_SX = { fontWeight: 800, bgcolor: '#f1f5f9', color: '#172033', whiteSpace: 'nowrap' } as const;
const TOTAL_SX = { fontWeight: 800, bgcolor: '#f8fafc', whiteSpace: 'nowrap' } as const;

function tallaOrder(value: string): number {
  const first = Number(value.match(/\d+/)?.[0]);
  return Number.isFinite(first) ? first : Number.MAX_SAFE_INTEGER;
}

export default function MateriaPrimaTallaTable({
  title,
  icon,
  subtitle,
  emptyText = 'Sin datos para los filtros seleccionados.',
  maxHeight = 460,
}: Props) {
  const { data, isLoading, isError, error, dataUpdatedAt } = useWidgetData('compra-mp-por-talla');
  const rows = (data ?? []) as unknown as SourceRow[];

  const report = useMemo(() => {
    const tallas = Array.from(new Set(rows.map((row) => row.talla))).sort(
      (a, b) => tallaOrder(a) - tallaOrder(b) || a.localeCompare(b),
    );
    const proveedores = new Map<string, Map<string, number>>();
    const totalTalla = new Map<string, number>();
    for (const row of rows) {
      const valores = proveedores.get(row.proveedor) ?? new Map<string, number>();
      valores.set(row.talla, (valores.get(row.talla) ?? 0) + Number(row.total));
      proveedores.set(row.proveedor, valores);
      totalTalla.set(row.talla, (totalTalla.get(row.talla) ?? 0) + Number(row.total));
    }
    return {
      tallas,
      proveedores: Array.from(proveedores.entries()).sort(([a], [b]) => a.localeCompare(b)),
      totalTalla,
      totalGeneral: rows.reduce((sum, row) => sum + Number(row.total), 0),
    };
  }, [rows]);

  return (
    <Box>
      <Stack direction="row" alignItems="center" spacing={0.75} mb={0.9} flexWrap="wrap" useFlexGap>
        {icon}
        <Typography variant="subtitle2" fontWeight={800} sx={{ fontSize: 13 }}>{title}</Typography>
        {subtitle && (
          <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11 }}>
            {subtitle}{dataUpdatedAt ? ` · actualizado ${new Date(dataUpdatedAt).toLocaleTimeString()}` : ''}
          </Typography>
        )}
      </Stack>

      {isLoading && <Skeleton variant="rounded" height={260} />}
      {isError && <Alert severity="error" sx={{ py: 0.5 }}>Error al cargar datos: {error instanceof Error ? error.message : 'desconocido'}</Alert>}
      {!isLoading && !isError && rows.length === 0 && <Alert severity="info" sx={{ py: 0.5 }}>{emptyText}</Alert>}

      {!isLoading && !isError && rows.length > 0 && (
        <TableContainer sx={{ maxHeight, borderRadius: 1, border: '1px solid rgba(148, 163, 184, 0.18)' }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell sx={{ ...HEADER_SX, left: 0, zIndex: 4, minWidth: 210 }}>Nombre Proveedor</TableCell>
                {report.tallas.map((talla) => <TableCell key={talla} align="right" sx={HEADER_SX}>{talla}</TableCell>)}
                <TableCell align="right" sx={HEADER_SX}>Total proveedor</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {report.proveedores.map(([proveedor, valores]) => {
                const total = Array.from(valores.values()).reduce((sum, value) => sum + value, 0);
                return (
                  <TableRow key={proveedor} hover>
                    <TableCell sx={{ position: 'sticky', left: 0, zIndex: 1, bgcolor: 'background.paper', fontWeight: 700 }}>{proveedor}</TableCell>
                    {report.tallas.map((talla) => <TableCell key={talla} align="right">{formatValue(valores.get(talla) ?? 0, 'number')}</TableCell>)}
                    <TableCell align="right" sx={{ fontWeight: 800 }}>{formatValue(total, 'number')}</TableCell>
                  </TableRow>
                );
              })}
              <TableRow>
                <TableCell sx={{ ...TOTAL_SX, position: 'sticky', left: 0, zIndex: 1 }}>Total talla</TableCell>
                {report.tallas.map((talla) => <TableCell key={talla} align="right" sx={TOTAL_SX}>{formatValue(report.totalTalla.get(talla) ?? 0, 'number')}</TableCell>)}
                <TableCell align="right" sx={TOTAL_SX}>{formatValue(report.totalGeneral, 'number')}</TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  );
}
