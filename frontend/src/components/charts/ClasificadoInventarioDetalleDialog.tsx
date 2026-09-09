import { useMemo } from 'react';
import {
  Alert,
  Box,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
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
import CloseIcon from '@mui/icons-material/Close';
import { useWidgetData } from '../../hooks/useDashboardData';
import { formatValue } from '../../utils/format';

interface Props { open: boolean; onClose: () => void }
interface SourceRow {
  finca: string;
  lagunaCiclo: string;
  remision: string;
  lote: string;
  tallaInicio: string;
  destino: string;
  libras: number;
}

const dimensionKeys = ['finca', 'lagunaCiclo', 'remision', 'lote', 'tallaInicio'] as const;
const headers = ['Finca', 'Laguna Ciclo', 'Remisión', 'Lote', 'Talla Inicio'];
const HEAD = { fontWeight: 800, bgcolor: '#164a8b', color: '#fff', whiteSpace: 'nowrap', borderColor: '#315f97' } as const;
const TOTAL = { fontWeight: 800, bgcolor: '#dfeafa', color: '#123a6d', position: 'sticky', bottom: 0, zIndex: 2, borderTop: '2px solid #9db9da' } as const;

export default function ClasificadoInventarioDetalleDialog({ open, onClose }: Props) {
  const { data, isLoading, isError, error } = useWidgetData('clasificado-inventario-detalle');
  const source = (data ?? []) as unknown as SourceRow[];
  const report = useMemo(() => {
    const destinos = Array.from(new Set(source.map((r) => r.destino))).sort();
    const grouped = new Map<string, { dimensions: string[]; values: Map<string, number> }>();
    const columnTotals = new Map<string, number>();
    for (const row of source) {
      const dimensions = dimensionKeys.map((key) => row[key]);
      const key = dimensions.join('\u001f');
      const item = grouped.get(key) ?? { dimensions, values: new Map<string, number>() };
      item.values.set(row.destino, (item.values.get(row.destino) ?? 0) + Number(row.libras));
      grouped.set(key, item);
      columnTotals.set(row.destino, (columnTotals.get(row.destino) ?? 0) + Number(row.libras));
    }
    return {
      destinos,
      rows: Array.from(grouped.values()).sort((a, b) => a.dimensions.join('|').localeCompare(b.dimensions.join('|'))),
      columnTotals,
      grandTotal: source.reduce((sum, row) => sum + Number(row.libras), 0),
    };
  }, [source]);

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="xl" PaperProps={{ sx: { height: '88vh', borderRadius: 2 } }}>
      <DialogTitle sx={{ px: 2.25, py: 1.5, borderBottom: '1px solid #dfe6ef' }}>
        <Stack direction="row" alignItems="center" justifyContent="space-between">
          <Box>
            <Typography fontWeight={800}>Detalle de Inventario Clasificado Disponible</Typography>
            <Typography variant="caption" color="text.secondary">Libras netas por origen, talla inicial y destino</Typography>
          </Box>
          <IconButton onClick={onClose} aria-label="Cerrar"><CloseIcon /></IconButton>
        </Stack>
      </DialogTitle>
      <DialogContent sx={{ p: '16px !important', minHeight: 0 }}>
        {isLoading && <Skeleton variant="rounded" height="100%" />}
        {isError && <Alert severity="error">Error al cargar el detalle: {error instanceof Error ? error.message : 'desconocido'}</Alert>}
        {!isLoading && !isError && report.rows.length === 0 && <Alert severity="info">No hay inventario clasificado disponible.</Alert>}
        {!isLoading && !isError && report.rows.length > 0 && (
          <TableContainer sx={{ height: '100%', border: '1px solid #d8e3f0', borderRadius: 1.5 }}>
            <Table size="small" stickyHeader sx={{ minWidth: 1050 }}>
              <TableHead>
                <TableRow>
                  {headers.map((header) => <TableCell key={header} rowSpan={2} sx={HEAD}>{header}</TableCell>)}
                  <TableCell align="center" colSpan={report.destinos.length} sx={HEAD}>Destino</TableCell>
                  <TableCell align="right" rowSpan={2} sx={HEAD}>Total</TableCell>
                </TableRow>
                <TableRow>
                  {report.destinos.map((destino) => <TableCell key={destino} align="right" sx={HEAD}>{destino}</TableCell>)}
                </TableRow>
              </TableHead>
              <TableBody>
                {report.rows.map((row, index) => {
                  const rowTotal = Array.from(row.values.values()).reduce((sum, value) => sum + value, 0);
                  return (
                    <TableRow key={row.dimensions.join('|')} hover sx={{ bgcolor: index % 2 ? '#f7faff' : '#fff' }}>
                      {row.dimensions.map((value, i) => <TableCell key={`${i}-${value}`} sx={{ whiteSpace: 'nowrap', fontWeight: i === 0 ? 700 : 400 }}>{value}</TableCell>)}
                      {report.destinos.map((destino) => <TableCell key={destino} align="right">{formatValue(row.values.get(destino) ?? 0, 'number')}</TableCell>)}
                      <TableCell align="right" sx={{ fontWeight: 800 }}>{formatValue(rowTotal, 'number')}</TableCell>
                    </TableRow>
                  );
                })}
                <TableRow>
                  <TableCell colSpan={5} sx={TOTAL}>Total</TableCell>
                  {report.destinos.map((destino) => <TableCell key={destino} align="right" sx={TOTAL}>{formatValue(report.columnTotals.get(destino) ?? 0, 'number')}</TableCell>)}
                  <TableCell align="right" sx={TOTAL}>{formatValue(report.grandTotal, 'number')}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </DialogContent>
    </Dialog>
  );
}
