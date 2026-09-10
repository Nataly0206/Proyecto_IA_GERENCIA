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
  /** Muestra la media aritmética de la columna en la fila de promedios. */
  average?: boolean;
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
  /** Variante visual para tablas operativas con mayor densidad de datos. */
  variant?: 'default' | 'recepcion';
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
  variant = 'default',
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

  const averages = useMemo(() => {
    if (!columns.some((c) => c.average)) return null;
    const out: Record<string, number> = {};
    for (const col of columns) {
      if (!col.average) continue;
      const values = rows
        .map((row) => Number(row[col.key]))
        .filter((value) => Number.isFinite(value));
      out[col.key] = values.length > 0
        ? values.reduce((sum, value) => sum + value, 0) / values.length
        : 0;
    }
    return out;
  }, [rows, columns]);

  const isRecepcion = variant === 'recepcion';

  return (
    <Box
      sx={isRecepcion ? {
        bgcolor: 'background.paper',
        border: '1px solid rgba(22, 74, 139, 0.14)',
        borderRadius: 2,
        boxShadow: '0 10px 28px rgba(23, 32, 51, 0.07)',
        p: { xs: 1.25, sm: 1.75 },
      } : undefined}
    >
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
          sx={{
            maxHeight,
            borderRadius: isRecepcion ? 1.5 : 1,
            border: isRecepcion ? '1px solid #d8e3f0' : '1px solid rgba(148, 163, 184, 0.18)',
            boxShadow: isRecepcion ? 'inset 0 0 0 1px rgba(255,255,255,0.5)' : 'none',
          }}
        >
          <Table size="small" stickyHeader sx={isRecepcion ? { minWidth: 1180 } : undefined}>
            <TableHead>
              <TableRow>
                {columns.map((col) => (
                  <TableCell
                    key={col.key}
                    align={col.align ?? (col.format && col.format !== 'text' && col.format !== 'periodo' ? 'right' : 'left')}
                    sx={isRecepcion ? {
                      ...HEADER_SX,
                      bgcolor: '#164a8b',
                      color: '#fff',
                      py: 1.15,
                      whiteSpace: 'nowrap',
                      borderBottom: 'none',
                      '& .MuiTableSortLabel-root, & .MuiTableSortLabel-root:hover, & .MuiTableSortLabel-root.Mui-active': { color: '#fff' },
                      '& .MuiTableSortLabel-icon': { color: '#fff !important' },
                    } : HEADER_SX}
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
                <TableRow
                  key={i}
                  hover
                  sx={isRecepcion ? {
                    bgcolor: i % 2 === 0 ? '#fff' : '#f7faff',
                    '&:hover': { bgcolor: '#eaf2fb !important' },
                    '& td': { borderColor: '#e7edf5', py: 0.9, whiteSpace: 'nowrap' },
                  } : undefined}
                >
                  {columns.map((col) => (
                    <TableCell
                      key={col.key}
                      align={col.align ?? (col.format && col.format !== 'text' && col.format !== 'periodo' ? 'right' : 'left')}
                      sx={{
                        ...(col.key === columns[0].key ? { fontWeight: 600 } : {}),
                        ...(isRecepcion && col.key === 'cliente' ? { fontWeight: 700, color: '#243b53' } : {}),
                      }}
                    >
                      {isRecepcion && col.key === 'remision' ? (
                        <Box
                          component="span"
                          sx={{
                            display: 'inline-flex',
                            px: 0.9,
                            py: 0.3,
                            borderRadius: 1,
                            bgcolor: '#e7f0fb',
                            color: '#164a8b',
                            fontWeight: 800,
                            fontSize: 11.5,
                            border: '1px solid #cddff3',
                          }}
                        >
                          {renderCell(row, col)}
                        </Box>
                      ) : isRecepcion && (col.key === 'rendimientoFinca' || col.key === 'rendimientoPlanta') ? (
                        <Box
                          component="span"
                          sx={{
                            display: 'inline-block',
                            minWidth: 58,
                            px: 0.75,
                            py: 0.25,
                            borderRadius: 1,
                            textAlign: 'center',
                            bgcolor: '#eaf7f2',
                            color: '#08775b',
                            fontWeight: 800,
                          }}
                        >
                          {renderCell(row, col)}
                        </Box>
                      ) : renderCell(row, col)}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
              {totals && (
                <TableRow
                  sx={{
                    '& td': {
                      fontWeight: 800,
                      bgcolor: isRecepcion ? '#dfeafa' : '#f1f5f9',
                      color: isRecepcion ? '#123a6d' : '#172033',
                      borderTop: isRecepcion ? '2px solid #9db9da' : '2px solid rgba(148, 163, 184, 0.45)',
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
              {averages && (
                <TableRow
                  sx={{
                    '& td': {
                      fontWeight: 800,
                      bgcolor: isRecepcion ? '#edf3fb' : '#f8fafc',
                      color: isRecepcion ? '#123a6d' : '#172033',
                      borderTop: '1px solid rgba(148, 163, 184, 0.3)',
                    },
                  }}
                >
                  {columns.map((col, idx) => (
                    <TableCell
                      key={col.key}
                      align={col.align ?? (col.format && col.format !== 'text' && col.format !== 'periodo' ? 'right' : 'left')}
                    >
                      {idx === 0
                        ? 'Promedio'
                        : col.key in averages
                          ? formatValue(averages[col.key], numericFormat(col.format))
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
