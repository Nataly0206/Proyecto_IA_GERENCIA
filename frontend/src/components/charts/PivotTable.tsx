import { useMemo, useState } from 'react';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import {
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
} from '@mui/material';
import { ChartConfig, DataRow } from '../../types';
import { formatPeriodo, formatValue } from '../../utils/format';

interface PivotTableProps {
  config: ChartConfig;
  data: DataRow[];
  columnOrder?: string[];
  onColumnReorder?: (source: string, target: string) => void;
}

interface Cell {
  value: number;
  weight: number;
}

const HEADER_SX = { fontWeight: 800, bgcolor: '#f1f5f9', color: '#172033' } as const;
const TOTAL_SX = {
  fontWeight: 800,
  bgcolor: '#e8eef7',
  color: '#172033',
  position: 'sticky',
  bottom: 0,
  zIndex: 2,
  borderTop: '2px solid #b8c7d9',
} as const;

/**
 * Tabla pivote estilo "RENDIMIENTOS IQF X HORA": filas = xField,
 * columnas = seriesField, celda = yField. Los totales de fila/columna
 * son promedios ponderados por weightField (número de grupos), lo que
 * reproduce exactamente los Grand Total del reporte oficial.
 */
export default function PivotTable({ config, data, columnOrder, onColumnReorder }: PivotTableProps) {
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const valueField = Array.isArray(config.yField) ? config.yField[0] : config.yField;
  const colField = config.seriesField ?? 'linea';
  const weightField = config.weightField ?? 'grupos';

  const { periodos, columnas, cells } = useMemo(() => {
    const cellMap = new Map<string, Cell>();
    const rowSet = new Set<string>();
    const colSet = new Set<string>();
    for (const row of data) {
      const periodo = String(row[config.xField] ?? '');
      const col = String(row[colField] ?? '');
      if (periodo === '' || col === '') continue;
      rowSet.add(periodo);
      colSet.add(col);
      cellMap.set(`${periodo}|${col}`, {
        value: Number(row[valueField] ?? 0),
        weight: Number(row[weightField] ?? 1),
      });
    }
    return {
      periodos: Array.from(rowSet).sort(),
      columnas: Array.from(colSet).sort((a, b) => {
        const aPosition = columnOrder?.indexOf(a) ?? -1;
        const bPosition = columnOrder?.indexOf(b) ?? -1;
        if (aPosition >= 0 && bPosition >= 0) return aPosition - bPosition;
        if (aPosition >= 0) return -1;
        if (bPosition >= 0) return 1;
        return a.localeCompare(b);
      }),
      cells: cellMap,
    };
  }, [data, config.xField, colField, valueField, weightField, columnOrder]);

  const weightedAvg = (items: Cell[]): number | null => {
    const totalWeight = items.reduce((acc, c) => acc + c.weight, 0);
    if (totalWeight === 0) return null;
    return items.reduce((acc, c) => acc + c.value * c.weight, 0) / totalWeight;
  };
  const aggregate = (items: Cell[]): number | null => {
    if (items.length === 0) return null;
    if (config.totalAggregation === 'sum') {
      return items.reduce((acc, cell) => acc + cell.value, 0);
    }
    return weightedAvg(items);
  };

  const rowCells = (periodo: string): Cell[] =>
    columnas.flatMap((col) => cells.get(`${periodo}|${col}`) ?? []);
  const colCells = (col: string): Cell[] =>
    periodos.flatMap((periodo) => cells.get(`${periodo}|${col}`) ?? []);

  const renderValue = (value: number | null | undefined) =>
    value === null || value === undefined ? '—' : formatValue(value, config.valueFormat ?? 'decimal');

  return (
    <TableContainer sx={{ height: '100%', maxHeight: config.height ?? '100%', mt: 0.5, borderRadius: 1, border: '1px solid rgba(148, 163, 184, 0.18)' }}>
      <Table size="small" stickyHeader>
        <TableHead>
          <TableRow>
            <TableCell sx={HEADER_SX}>{config.xLabel ?? 'Período'}</TableCell>
            {columnas.map((col) => (
              <TableCell key={col} align="right" draggable={Boolean(onColumnReorder)}
                title={onColumnReorder ? 'Arrastra para ordenar las columnas' : undefined}
                onDragStart={onColumnReorder ? (event) => {
                  event.dataTransfer.effectAllowed = 'move';
                  event.dataTransfer.setData('text/plain', col);
                } : undefined}
                onDragOver={onColumnReorder ? (event) => {
                  event.preventDefault();
                  event.dataTransfer.dropEffect = 'move';
                  setDropTarget(col);
                } : undefined}
                onDrop={onColumnReorder ? (event) => {
                  event.preventDefault();
                  const source = event.dataTransfer.getData('text/plain');
                  setDropTarget(null);
                  if (columnas.includes(source) && source !== col) onColumnReorder(source, col);
                } : undefined}
                onDragEnd={onColumnReorder ? () => setDropTarget(null) : undefined}
                sx={{ ...HEADER_SX, ...(onColumnReorder && { cursor: 'grab', userSelect: 'none' }),
                  ...(dropTarget === col && { boxShadow: 'inset 3px 0 #164a8b', bgcolor: '#e3eefb' }) }}>
                {onColumnReorder && <DragIndicatorIcon sx={{ fontSize: 15, verticalAlign: 'middle', mr: 0.4, color: 'primary.main' }} />}
                {col}
              </TableCell>
            ))}
            <TableCell align="right" sx={HEADER_SX}>
              Grand Total
            </TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {periodos.map((periodo) => (
            <TableRow key={periodo} hover>
              <TableCell sx={{ fontWeight: 600 }}>{formatPeriodo(periodo)}</TableCell>
              {columnas.map((col) => (
                <TableCell key={col} align="right">
                  {renderValue(cells.get(`${periodo}|${col}`)?.value ?? null)}
                </TableCell>
              ))}
              <TableCell align="right" sx={{ fontWeight: 600 }}>
                {renderValue(aggregate(rowCells(periodo)))}
              </TableCell>
            </TableRow>
          ))}
          <TableRow>
            <TableCell sx={TOTAL_SX}>Grand Total</TableCell>
            {columnas.map((col) => (
              <TableCell key={col} align="right" sx={TOTAL_SX}>
                {renderValue(aggregate(colCells(col)))}
              </TableCell>
            ))}
            <TableCell align="right" sx={TOTAL_SX}>
              {renderValue(
                aggregate(periodos.flatMap((periodo) => rowCells(periodo))),
              )}
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </TableContainer>
  );
}
