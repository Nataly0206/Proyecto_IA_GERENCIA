import { ReactNode, useMemo, useState } from 'react';
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
  TableSortLabel,
  Typography,
} from '@mui/material';
import { DashboardEndpoint, DataRow, ValueFormat } from '../../types';
import { useWidgetData } from '../../hooks/useDashboardData';
import { formatPeriodo, formatValue } from '../../utils/format';

export interface WidgetColumn {
  key: string;
  label: string;
  align?: 'left' | 'right';
  /** 'periodo' formatea fechas ISO; los ValueFormat formatean números. */
  format?: ValueFormat | 'periodo' | 'text';
  /**
   * Fila de totales al pie. `'sum'` suma la columna; `{ ratio: [num, den] }`
   * calcula una razón ponderada (Σnum ÷ Σden), escalada a porcentaje cuando
   * la columna usa formato `'percent'`. Si ninguna columna define `total`,
   * no se dibuja fila de totales.
   */
  total?: 'sum' | { ratio: [string, string] };
}

const numericFormat = (f: WidgetColumn['format']): ValueFormat =>
  f && f !== 'periodo' && f !== 'text' ? f : 'number';

interface WidgetDataTableProps {
  title: string;
  icon: ReactNode;
  endpoint: DashboardEndpoint;
  columns: WidgetColumn[];
  /** Columna por la que se ordena inicialmente (desc). */
  defaultSortKey?: string;
  subtitle?: string;
  emptyText?: string;
  maxHeight?: number;
}

const HEADER_SX = { fontWeight: 800, bgcolor: '#f1f5f9', color: '#172033' } as const;

function renderCell(row: DataRow, col: WidgetColumn): string {
  const raw = row[col.key];
  if (raw === null || raw === undefined || raw === '') return '—';
  if (col.format === 'periodo') return formatPeriodo(String(raw));
  if (col.format && col.format !== 'text') return formatValue(Number(raw), col.format);
  return String(raw);
}

/**
 * Tabla de detalle genérica alimentada por un endpoint de dashboard
 * (respeta los filtros globales vía `useWidgetData`). Ordenable por
 * cualquier columna. Se usa para listados planos que no encajan en la
 * tabla pivote (contenedores exportados, órdenes de compra).
 */
export default function WidgetDataTable({
  title,
  icon,
  endpoint,
  columns,
  defaultSortKey,
  subtitle,
  emptyText = 'Sin datos para los filtros seleccionados.',
  maxHeight = 420,
}: WidgetDataTableProps) {
  const { data, isLoading, isError, error, dataUpdatedAt } = useWidgetData(endpoint);
  const [sortKey, setSortKey] = useState(defaultSortKey ?? columns[0]?.key);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');

  const rows = useMemo(() => {
    const list = [...(data ?? [])];
    if (!sortKey) return list;
    const numeric = list.every((r) => r[sortKey] === undefined || !Number.isNaN(Number(r[sortKey])));
    list.sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      const cmp = numeric
        ? Number(av ?? 0) - Number(bv ?? 0)
        : String(av ?? '').localeCompare(String(bv ?? ''));
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return list;
  }, [data, sortKey, sortDir]);

  const toggleSort = (key: string) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const totals = useMemo(() => {
    if (!columns.some((c) => c.total)) return null;
    const sum = (key: string) => rows.reduce((acc, r) => acc + (Number(r[key]) || 0), 0);
    const out: Record<string, number> = {};
    for (const col of columns) {
      if (col.total === 'sum') out[col.key] = sum(col.key);
      else if (col.total && typeof col.total === 'object') {
        const den = sum(col.total.ratio[1]);
        const ratio = den > 0 ? sum(col.total.ratio[0]) / den : 0;
        out[col.key] = col.format === 'percent' ? ratio * 100 : ratio;
      }
    }
    return out;
  }, [rows, columns]);

  return (
    <Box>
      <Stack direction="row" alignItems="center" spacing={0.75} mb={0.9} flexWrap="wrap" useFlexGap>
        {icon}
        <Typography variant="subtitle2" fontWeight={800} sx={{ fontSize: 13 }}>
          {title}
        </Typography>
        {subtitle && (
          <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11 }}>
            {subtitle}
            {dataUpdatedAt ? ` · actualizado ${new Date(dataUpdatedAt).toLocaleTimeString()}` : ''}
          </Typography>
        )}
      </Stack>

      {isLoading && <Skeleton variant="rounded" height={260} />}

      {isError && (
        <Alert severity="error" sx={{ py: 0.5 }}>
          Error al cargar datos: {error instanceof Error ? error.message : 'desconocido'}
        </Alert>
      )}

      {!isLoading && !isError && rows.length === 0 && (
        <Alert severity="info" sx={{ py: 0.5 }}>
          {emptyText}
        </Alert>
      )}

      {!isLoading && !isError && rows.length > 0 && (
        <TableContainer
          sx={{ maxHeight, borderRadius: 1, border: '1px solid rgba(148, 163, 184, 0.18)' }}
        >
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                {columns.map((col) => (
                  <TableCell
                    key={col.key}
                    align={col.align ?? (col.format && col.format !== 'text' && col.format !== 'periodo' ? 'right' : 'left')}
                    sx={HEADER_SX}
                    sortDirection={sortKey === col.key ? sortDir : false}
                  >
                    <TableSortLabel
                      active={sortKey === col.key}
                      direction={sortKey === col.key ? sortDir : 'desc'}
                      onClick={() => toggleSort(col.key)}
                    >
                      {col.label}
                    </TableSortLabel>
                  </TableCell>
                ))}
              </TableRow>
            </TableHead>
            <TableBody>
              {rows.map((row, i) => (
                <TableRow key={i} hover>
                  {columns.map((col) => (
                    <TableCell
                      key={col.key}
                      align={col.align ?? (col.format && col.format !== 'text' && col.format !== 'periodo' ? 'right' : 'left')}
                      sx={col.key === columns[0].key ? { fontWeight: 600 } : undefined}
                    >
                      {renderCell(row, col)}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
              {totals && (
                <TableRow
                  sx={{
                    '& td': {
                      fontWeight: 800,
                      bgcolor: '#f1f5f9',
                      color: '#172033',
                      borderTop: '2px solid rgba(148, 163, 184, 0.45)',
                      position: 'sticky',
                      bottom: 0,
                    },
                  }}
                >
                  {columns.map((col, idx) => (
                    <TableCell
                      key={col.key}
                      align={col.align ?? (col.format && col.format !== 'text' && col.format !== 'periodo' ? 'right' : 'left')}
                    >
                      {idx === 0
                        ? 'Total'
                        : col.key in totals
                          ? formatValue(totals[col.key], numericFormat(col.format))
                          : ''}
                    </TableCell>
                  ))}
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  );
}
