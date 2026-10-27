import { Alert, Button, CircularProgress, Table, TableBody, TableCell, TableContainer, TableHead, TableRow } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../api/client';
import { WeightUnit } from '../utils/weightUnits';

interface ReportCell { column: number; text?: string; value?: number; rowSpan: number; colSpan: number }
interface LoadReport { headers: string[]; rows: { kind: string; cells: ReportCell[] }[] }

export default function LoadReportTable({ loadId, unit, userId }: { loadId: number; unit: WeightUnit; userId: string }) {
  const query = useQuery({ queryKey: ['load-report', userId, loadId, unit],
    queryFn: async () => (await apiClient.get<LoadReport>(`/inventory/preloads/${loadId}/report`, { params: { unit } })).data });
  if (query.isLoading) return <CircularProgress size={26} />;
  if (query.isError || !query.data) return <Alert severity="error">No se pudo cargar la tabla. <Button color="inherit" onClick={() => void query.refetch()}>Reintentar</Button></Alert>;
  return <TableContainer sx={{ bgcolor: '#fff', borderRadius: 0, flex: 1, minHeight: 160, overflow: 'auto' }}>
    <Table size="small" aria-label={`Detalle de carga ${loadId}`} sx={{ borderCollapse: 'collapse', minWidth: 1500,
      '& th, & td': { border: '1px solid #000', color: '#000', fontFamily: 'Arial, sans-serif', fontSize: 14, fontWeight: 400, lineHeight: 1.3, p: '3px 5px', verticalAlign: 'top', borderRadius: 0 },
      '& th': { bgcolor: '#e0e0e0', whiteSpace: 'nowrap' },
    }}>
      <TableHead>
        <TableRow><TableCell colSpan={8} sx={{ bgcolor: '#fff !important', border: '0 !important' }} /><TableCell colSpan={2}>Grand Total</TableCell></TableRow>
        <TableRow>{query.data.headers.map((header, index) => <TableCell key={header} sx={{ minWidth: [145, 150, 300, 175, 90, 140, 80, 110, 130, 125][index] }}>{header}</TableCell>)}</TableRow>
      </TableHead>
      <TableBody>{query.data.rows.map((row, index) => <TableRow key={index}>{row.cells.map(entry => <TableCell key={entry.column} rowSpan={entry.rowSpan} colSpan={entry.colSpan}
        sx={{ bgcolor: entry.column >= 8 ? '#fff' : '#e0e0e0', textAlign: entry.column >= 8 ? 'right' : 'left', whiteSpace: entry.column === 2 || entry.column === 3 ? 'normal' : 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
        {entry.value === undefined ? entry.text : entry.value.toLocaleString('en-US', { minimumFractionDigits: entry.column === 8 ? 4 : 0, maximumFractionDigits: entry.column === 8 ? 4 : 0 })}
      </TableCell>)}</TableRow>)}</TableBody>
    </Table>
  </TableContainer>;
}
