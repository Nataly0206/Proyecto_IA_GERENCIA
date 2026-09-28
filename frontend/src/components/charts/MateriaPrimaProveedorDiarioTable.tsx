import { useMemo } from 'react';
import dayjs from 'dayjs';
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

type Period = 'dia' | 'semana';

function startOfIsoWeek(value: string): string {
  const date = new Date(`${value}T00:00:00Z`);
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() - day + 1);
  return date.toISOString().slice(0, 10);
}

function endOfIsoWeek(value: string): string {
  const date = new Date(`${startOfIsoWeek(value)}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 6);
  return date.toISOString().slice(0, 10);
}

const HEADER_SX = { fontWeight: 800, bgcolor: '#f1f5f9', color: '#172033', whiteSpace: 'nowrap' } as const;
const TOTAL_SX = {
  position: 'sticky',
  bottom: 0,
  zIndex: 2,
  fontWeight: 800,
  bgcolor: '#f8fafc',
  whiteSpace: 'nowrap',
  borderTop: '2px solid',
  borderTopColor: 'divider',
} as const;

export default function MateriaPrimaProveedorDiarioTable({ hiddenProviders, period = 'dia' }: { hiddenProviders: Set<string>; period?: Period }) {
  const weeklyRange = useMemo(() => {
    const end = dayjs();
    const mondayOffset = (end.day() + 6) % 7;
    const currentMonday = end.subtract(mondayOffset, 'day');
    return {
      fechaInicial: currentMonday.subtract(11, 'week').format('YYYY-MM-DD'),
      fechaFinal: end.format('YYYY-MM-DD'),
    };
  }, []);
  const { data, isLoading, isError, error } = useWidgetData(
    'compra-mp-por-proveedor-dia',
    period === 'semana' ? weeklyRange : undefined,
  );
  const rows = useMemo(
    () => ((data ?? []) as unknown as SourceRow[]).filter((row) => !hiddenProviders.has(row.proveedor)),
    [data, hiddenProviders],
  );
  const report = useMemo(() => {
    const proveedores = Array.from(new Set(rows.map((row) => row.proveedor))).sort((a, b) => a.localeCompare(b));
    const periodos = new Map<string, Map<string, number>>();
    if (period === 'semana') {
      const currentMonday = startOfIsoWeek(weeklyRange.fechaFinal);
      const anchor = new Date(`${currentMonday}T00:00:00Z`);
      for (let offset = 11; offset >= 0; offset -= 1) {
        const monday = new Date(anchor);
        monday.setUTCDate(monday.getUTCDate() - offset * 7);
        periodos.set(monday.toISOString().slice(0, 10), new Map());
      }
    }
    const totalesProveedor = new Map<string, number>();
    for (const row of rows) {
      const periodKey = period === 'semana' ? startOfIsoWeek(row.fecha) : row.fecha;
      const valores = periodos.get(periodKey) ?? new Map<string, number>();
      valores.set(row.proveedor, (valores.get(row.proveedor) ?? 0) + Number(row.librasHoso));
      periodos.set(periodKey, valores);
      totalesProveedor.set(row.proveedor, (totalesProveedor.get(row.proveedor) ?? 0) + Number(row.librasHoso));
    }
    return {
      proveedores,
      periodos: Array.from(periodos.entries()).sort(([a], [b]) => b.localeCompare(a)),
      totalesProveedor,
      totalGeneral: rows.reduce((sum, row) => sum + Number(row.librasHoso), 0),
    };
  }, [rows, period, weeklyRange.fechaFinal]);

  const isWeekly = period === 'semana';

  return <Box>
    <Typography variant="subtitle2" fontWeight={800} sx={{ fontSize: 13, mb: 0.25 }}>Materia Prima por Proveedor — {isWeekly ? 'Semanal' : 'Diario'}</Typography>
    <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 0.9 }}>
      {isWeekly ? 'Semanas (lunes a domingo)' : 'Fechas'} del rango seleccionado · valores en lbs HOSO (WSO ÷ 0.65)
    </Typography>
    {isLoading && <Skeleton variant="rounded" height={260} />}
    {isError && <Alert severity="error" sx={{ py: 0.5 }}>Error al cargar el detalle {isWeekly ? 'semanal' : 'diario'}: {error instanceof Error ? error.message : 'desconocido'}</Alert>}
    {!isLoading && !isError && rows.length === 0 && !isWeekly && <Alert severity="info" sx={{ py: 0.5 }}>Sin materia prima de proveedores visibles en el rango seleccionado.</Alert>}
    {!isLoading && !isError && (rows.length > 0 || isWeekly) && <TableContainer sx={{ maxHeight: 460, borderRadius: 1, border: '1px solid rgba(148, 163, 184, 0.18)' }}>
      <Table size="small" stickyHeader>
        <TableHead><TableRow>
          <TableCell sx={{ ...HEADER_SX, position: 'sticky', left: 0, zIndex: 4, minWidth: isWeekly ? 210 : 125 }}>{isWeekly ? 'Semana' : 'Fecha'}</TableCell>
          {report.proveedores.map((proveedor) => <TableCell key={proveedor} align="right" sx={HEADER_SX}>{proveedor}</TableCell>)}
          <TableCell align="right" sx={HEADER_SX}>Total {isWeekly ? 'semana' : 'día'}</TableCell>
        </TableRow></TableHead>
        <TableBody>
          {report.periodos.map(([fecha, valores]) => <TableRow key={fecha} hover>
            <TableCell sx={{ position: 'sticky', left: 0, zIndex: 1, bgcolor: 'background.paper', fontWeight: 700 }}>{isWeekly ? `${formatPeriodo(fecha)} → ${formatPeriodo(endOfIsoWeek(fecha))}` : formatPeriodo(fecha)}</TableCell>
            {report.proveedores.map((proveedor) => <TableCell key={proveedor} align="right">{formatValue(valores.get(proveedor) ?? 0, 'number')}</TableCell>)}
            <TableCell align="right" sx={{ fontWeight: 800 }}>{formatValue(Array.from(valores.values()).reduce((sum, value) => sum + value, 0), 'number')}</TableCell>
          </TableRow>)}
          <TableRow>
            <TableCell sx={{ ...TOTAL_SX, left: 0, zIndex: 3 }}>Total proveedor</TableCell>
            {report.proveedores.map((proveedor) => <TableCell key={proveedor} align="right" sx={TOTAL_SX}>{formatValue(report.totalesProveedor.get(proveedor) ?? 0, 'number')}</TableCell>)}
            <TableCell align="right" sx={TOTAL_SX}>{formatValue(report.totalGeneral, 'number')}</TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </TableContainer>}
  </Box>;
}
