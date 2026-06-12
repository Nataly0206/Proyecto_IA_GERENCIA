import { useMemo } from 'react';
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
}

interface Cell {
  value: number;
  weight: number;
}

const HEADER_SX = { fontWeight: 800, bgcolor: '#f1f5f9', color: '#172033' } as const;
const TOTAL_SX = { fontWeight: 800, bgcolor: '#f8fafc' } as const;

/**
 * Tabla pivote estilo "RENDIMIENTOS IQF X HORA": filas = xField,
 * columnas = seriesField, celda = yField. Los totales de fila/columna
 * son promedios ponderados por weightField (número de grupos), lo que
 * reproduce exactamente los Grand Total del reporte oficial.
 */
export default function PivotTable({ config, data }: PivotTableProps) {
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
      columnas: Array.from(colSet).sort(),
      cells: cellMap,
    };
  }, [data, config.xField, colField, valueField, weightField]);

  const weightedAvg = (items: Cell[]): number | null => {
    const totalWeight = items.reduce((acc, c) => acc + c.weight, 0);
    if (totalWeight === 0) return null;
    return items.reduce((acc, c) => acc + c.value * c.weight, 0) / totalWeight;
  };

  const rowCells = (periodo: string): Cell[] =>
    columnas.flatMap((col) => cells.get(`${periodo}|${col}`) ?? []);
  const colCells = (col: string): Cell[] =>
    periodos.flatMap((periodo) => cells.get(`${periodo}|${col}`) ?? []);

  const renderValue = (value: number | null | undefined) =>
    value === null || value === undefined ? '—' : formatValue(value, config.valueFormat ?? 'decimal');

  return (
    <TableContainer sx={{ maxHeight: config.height ?? 430, mt: 0.5, borderRadius: 1, border: '1px solid rgba(148, 163, 184, 0.18)' }}>
      <Table size="small" stickyHeader>
        <TableHead>
          <TableRow>
            <TableCell sx={HEADER_SX}>{config.xLabel ?? 'Período'}</TableCell>
            {columnas.map((col) => (
              <TableCell key={col} align="right" sx={HEADER_SX}>
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
                {renderValue(weightedAvg(rowCells(periodo)))}
              </TableCell>
            </TableRow>
          ))}
          <TableRow>
            <TableCell sx={TOTAL_SX}>Grand Total</TableCell>
            {columnas.map((col) => (
              <TableCell key={col} align="right" sx={TOTAL_SX}>
                {renderValue(weightedAvg(colCells(col)))}
              </TableCell>
            ))}
            <TableCell align="right" sx={TOTAL_SX}>
              {renderValue(
                weightedAvg(periodos.flatMap((periodo) => rowCells(periodo))),
              )}
            </TableCell>
          </TableRow>
        </TableBody>
      </Table>
    </TableContainer>
  );
}
