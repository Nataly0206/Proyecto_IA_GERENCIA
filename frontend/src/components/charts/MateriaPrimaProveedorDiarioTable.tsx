import { useMemo } from 'react';
import {
  Alert,
  Box,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { useWidgetData } from '../../hooks/useDashboardData';
import { formatPeriodo, formatValue } from '../../utils/format';

interface SourceRow {
  fecha: string;
  proveedor: string;
  librasHoso: number;
}

const HEADER_SX = { fontWeight: 800, bgcolor: '#f1f5f9', color: '#172033', whiteSpace: 'nowrap' } as const;
const TOTAL_SX = { fontWeight: 800, bgcolor: '#f8fafc', whiteSpace: 'nowrap' } as const;

export default function MateriaPrimaProveedorDiarioTable({ hiddenProviders }: { hiddenProviders: Set<string> }) {
  const { data, isLoading, isError, error } = useWidgetData('compra-mp-por-proveedor-dia');
  const rows = useMemo(
    () => ((data ?? []) as unknown as SourceRow[]).filter((row) => !hiddenProviders.has(row.proveedor)),
    [data, hiddenProviders],
  );
  const report = useMemo(() => {
    const proveedores = Array.from(new Set(rows.map((row) => row.proveedor))).sort((a, b) => a.localeCompare(b));
    const dias = new Map<string, Map<string, number>>();
    const totalesProveedor = new Map<string, number>();
    for (const row of rows) {
      const valores = dias.get(row.fecha) ?? new Map<string, number>();
      valores.set(row.proveedor, (valores.get(row.proveedor) ?? 0) + Number(row.librasHoso));
      dias.set(row.fecha, valores);
      totalesProveedor.set(row.proveedor, (totalesProveedor.get(row.proveedor) ?? 0) + Number(row.librasHoso));
    }
    return {
      proveedores,
      dias: Array.from(dias.entries()).sort(([a], [b]) => a.localeCompare(b)),
      totalesProveedor,
      totalGeneral: rows.reduce((sum, row) => sum + Number(row.librasHoso), 0),
    };
  }, [rows]);

  return <Box>
    <Typography variant="subtitle2" fontWeight={800} sx={{ fontSize: 13, mb: 0.25 }}>Materia Prima por Proveedor — Diario</Typography>
    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.9 }}>
      Fechas del rango seleccionado · valores en lbs HOSO (WSO ÷ 0.65)
    </Typography>
    {isLoading && <Skeleton variant="rounded" height={260} />}
    {isError && <Alert severity="error" sx={{ py: 0.5 }}>Error al cargar el detalle diario: {error instanceof Error ? error.message : 'desconocido'}</Alert>}
    {!isLoading && !isError && rows.length === 0 && <Alert severity="info" sx={{ py: 0.5 }}>Sin materia prima de proveedores visibles en el rango seleccionado.</Alert>}
    {!isLoading && !isError && rows.length > 0 && <TableContainer sx={{ maxHeight: 460, borderRadius: 1, border: '1px solid rgba(148, 163, 184, 0.18)' }}>
      <Table size="small" stickyHeader>
        <TableHead><TableRow>
          <TableCell sx={{ ...HEADER_SX, position: 'sticky', left: 0, zIndex: 4, minWidth: 125 }}>Fecha</TableCell>
          {report.proveedores.map((proveedor) => <TableCell key={proveedor} align="right" sx={HEADER_SX}>{proveedor}</TableCell>)}
          <TableCell align="right" sx={HEADER_SX}>Total día</TableCell>
        </TableRow></TableHead>
        <TableBody>
          {report.dias.map(([fecha, valores]) => <TableRow key={fecha} hover>
            <TableCell sx={{ position: 'sticky', left: 0, zIndex: 1, bgcolor: 'background.paper', fontWeight: 700 }}>{formatPeriodo(fecha)}</TableCell>
            {report.proveedores.map((proveedor) => <TableCell key={proveedor} align="right">{formatValue(valores.get(proveedor) ?? 0, 'number')}</TableCell>)}
            <TableCell align="right" sx={{ fontWeight: 800 }}>{formatValue(Array.from(valores.values()).reduce((sum, value) => sum + value, 0), 'number')}</TableCell>
          </TableRow>)}
          <TableRow>
            <TableCell sx={{ ...TOTAL_SX, position: 'sticky', left: 0, zIndex: 1 }}>Total proveedor</TableCell>
            {report.proveedores.map((proveedor) => <TableCell key={proveedor} align="right" sx={TOTAL_SX}>{formatValue(report.totalesProveedor.get(proveedor) ?? 0, 'number')}</TableCell>)}
            <TableCell align="right" sx={TOTAL_SX}>{formatValue(report.totalGeneral, 'number')}</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </TableContainer>}
  </Box>;
}
