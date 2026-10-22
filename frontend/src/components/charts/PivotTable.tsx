import { useEffect, useMemo, useRef, useState } from 'react';
import DragIndicatorIcon from '@mui/icons-material/DragIndicator';
import {
  Box,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableFooter,
  TableHead,
  TableRow,
} from '@mui/material';
import { ChartConfig, DataRow, ValueFormat } from '../../types';
import { formatPeriodo, formatValue } from '../../utils/format';

interface PivotTableProps {
  config: ChartConfig;
  autoHeight?: boolean;
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
  borderTop: '2px solid #b8c7d9',
} as const;
const AVERAGE_SX = {
  fontWeight: 700,
  bgcolor: '#f3f6fb',
  color: '#172033',
  borderTop: '1px solid #dbe3ee',
} as const;
const SHARE_SX = {
  fontWeight: 800,
  bgcolor: '#eef7f3',
  color: '#176247',
  borderTop: '1px solid #cfe3d9',
} as const;

/**
 * Tabla pivote estilo "RENDIMIENTOS IQF X HORA": filas = xField,
 * columnas = seriesField, celda = yField. Los totales de fila/columna
 * son promedios ponderados por weightField (número de grupos), lo que
 * reproduce exactamente los Grand Total del reporte oficial.
 */
export default function PivotTable({ config, data, columnOrder, onColumnReorder, autoHeight = false }: PivotTableProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !config.mobileSummaryOnly) return;
    const updateWidth = () => setContainerWidth(container.clientWidth);
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    observer.observe(container);
    return () => observer.disconnect();
  }, [config.mobileSummaryOnly]);
  const trailingColumns = config.trailingTextColumns ?? [];
  const additionalTextColumns = Math.max(0, trailingColumns.length - 1);
  const summaryValueColumns = 3 + (config.teamHourlyColumn ? 1 : 0);
  const summaryWidth = Math.max(0, containerWidth);
  const [dropTarget, setDropTarget] = useState<string | null>(null);
  const valueField = Array.isArray(config.yField) ? config.yField[0] : config.yField;
  const colField = config.seriesField ?? 'linea';
  const weightField = config.weightField ?? 'grupos';
  const extraColumns = useMemo(() => config.extraColumns ?? [], [config.extraColumns]);

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

  const extraByPeriodo = useMemo(() => {
    const result = new Map<string, Map<string, number>>();
    if (extraColumns.length === 0) return result;
    for (const col of extraColumns) result.set(col.field, new Map());
    for (const row of data) {
      const periodo = String(row[config.xField] ?? '');
      if (periodo === '') continue;
      for (const col of extraColumns) {
        const perPeriodo = result.get(col.field)!;
        if (perPeriodo.has(periodo)) continue;
        const raw = row[col.field];
        if (raw === undefined || raw === null) continue;
        perPeriodo.set(periodo, Number(raw));
      }
    }
    return result;
  }, [data, config.xField, extraColumns]);

  const daysField = config.dailyAverageColumn?.daysField;
  const daysByPeriodo = useMemo(() => {
    const result = new Map<string, number>();
    if (!daysField) return result;
    for (const row of data) {
      const periodo = String(row[config.xField] ?? '');
      const days = Number(row[daysField] ?? 0);
      if (periodo !== '' && Number.isFinite(days)) result.set(periodo, Math.max(result.get(periodo) ?? 0, days));
    }
    return result;
  }, [data, config.xField, daysField]);
  const perDay = (total: number | null, days: number): number | null =>
    total === null || days <= 0 ? null : total / days;

  /**
   * Grand Total de una columna auxiliar (Horas Trabajadas, Personas):
   * siempre es la suma, igual que el Grand Total de cualquier otra
   * columna de la tabla — nunca un promedio, aunque el valor por sí
   * mismo (ej. horas trabajadas ese día) no sea acumulable día a día de
   * forma perfecta, para que "Total" siga significando total.
   */
  const sumExtra = (values: number[]): number | null => {
    if (values.length === 0) return null;
    return values.reduce((acc, v) => acc + v, 0);
  };
  /** Promedio de una columna auxiliar: siempre divide entre la cantidad
   *  total de días del período mostrado, igual que `simpleAverage`. */
  const avgExtra = (values: number[]): number | null => {
    if (averageDivisor === 0) return null;
    return values.reduce((acc, v) => acc + v, 0) / averageDivisor;
  };

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
  /**
   * Promedio por día del período mostrado: siempre divide entre la
   * cantidad de días (`periodos.length`), no entre la cantidad de celdas
   * con datos — de lo contrario cada columna (y el Grand Total) promedia
   * sobre una cantidad de días distinta según cuántos días tuvo valores,
   * dando un "promedio" que no guarda relación con el total de la columna.
   */
  const simpleAverage = (items: Cell[]): number | null => {
    if (averageDivisor === 0) return null;
    return items.reduce((acc, cell) => acc + cell.value, 0) / averageDivisor;
  };

  const rowCells = (periodo: string): Cell[] =>
    columnas.flatMap((col) => cells.get(`${periodo}|${col}`) ?? []);
  const averageDivisor = config.averageActivePeriodsOnly
    ? periodos.filter((periodo) => rowCells(periodo).some((cell) => cell.value !== 0)).length
    : periodos.length;
  const colCells = (col: string): Cell[] =>
    periodos.flatMap((periodo) => cells.get(`${periodo}|${col}`) ?? []);
  const hourlyPerPerson = (periodo: string): number | null => {
    const column = config.hourlyPerPersonColumn;
    if (!column) return null;
    if (column.valueField) {
      const row = data.find((item) => String(item[config.xField] ?? '') === periodo);
      const value = row?.[column.valueField];
      if (value !== undefined) return value === null ? null : Number(value);
    }
    const hours = extraByPeriodo.get(column.hoursField)?.get(periodo) ?? 0;
    const people = extraByPeriodo.get(column.peopleField)?.get(periodo) ?? 0;
    const total = aggregate(rowCells(periodo));
    return total !== null && hours > 0 && people > 0 ? total / hours / people : null;
  };
  const teamHourly = (periodo: string): number | null => {
    const column = config.teamHourlyColumn;
    if (!column) return null;
    if (column.valueField) {
      const row = data.find(item => String(item[config.xField] ?? '') === periodo);
      const value = row?.[column.valueField];
      if (value !== undefined) return value !== null && Number.isFinite(Number(value)) ? Number(value) : null;
    }
    const hours = extraByPeriodo.get(column.hoursField)?.get(periodo) ?? 0;
    const total = aggregate(rowCells(periodo));
    return total !== null && Number.isFinite(hours) && hours > 0 ? total / hours : null;
  };
  const grandTotal = aggregate(periodos.flatMap((periodo) => rowCells(periodo)));
  const shareByColumn = new Map<string, number>();
  if (config.showShareRow && grandTotal && grandTotal > 0 && columnas.length > 0) {
    const shares = columnas.map((col) => {
      const columnTotal = aggregate(colCells(col)) ?? 0;
      const exactBasisPoints = (columnTotal / grandTotal) * 10_000;
      const basisPoints = Math.floor(exactBasisPoints);
      return { col, basisPoints, remainder: exactBasisPoints - basisPoints };
    });
    const missingBasisPoints = Math.max(0, 10_000 - shares.reduce((sum, share) => sum + share.basisPoints, 0));
    const byLargestRemainder = [...shares].sort((a, b) => b.remainder - a.remainder);
    for (let index = 0; index < missingBasisPoints; index += 1) {
      byLargestRemainder[index % byLargestRemainder.length].basisPoints += 1;
    }
    for (const share of shares) shareByColumn.set(share.col, share.basisPoints / 100);
  }

  const firstColumnSx = config.stickyFirstColumn ? {
    position: 'sticky',
    left: 0,
    zIndex: 1,
    whiteSpace: 'nowrap',
  } : config.stickyFirstColumnMobile ? {
    position: { xs: 'sticky', sm: 'static' },
    left: { xs: 0, sm: 'auto' },
    zIndex: { xs: 1, sm: 'auto' },
    whiteSpace: 'nowrap',
  } : {};
  const renderValue = (value: number | null | undefined, format?: ValueFormat) =>
    value === null || value === undefined ? '—' : formatValue(value, format ?? config.valueFormat ?? 'decimal');

  return (
    <TableContainer ref={containerRef} sx={{ height: autoHeight ? 'auto' : '100%', maxHeight: config.height ?? 440, mt: 0.5, borderRadius: 1, border: '1px solid rgba(148, 163, 184, 0.18)' }}>
      <Table size="small" stickyHeader sx={config.mobileSummaryOnly ? {
        width: {
          xs: summaryWidth + (extraColumns.length + columnas.length + additionalTextColumns) * 110,
          sm: '100%',
        },
        tableLayout: { xs: 'fixed', sm: 'auto' },
        '& .MuiTableCell-root': {
          boxSizing: 'border-box',
          px: { xs: 0.5, sm: 2 },
          fontSize: { xs: 11, sm: 'inherit' },
          lineHeight: { xs: 1.35, sm: 'inherit' },
        },
        '& thead .MuiTableCell-root': {
          whiteSpace: { xs: 'normal', sm: 'nowrap' },
          overflowWrap: { xs: 'anywhere', sm: 'normal' },
        },
        '& tr > :first-child': {
          width: { xs: summaryWidth * 0.31, sm: 'auto' },
        },
        ...Object.fromEntries(Array.from({ length: extraColumns.length + columnas.length }, (_, index) => [
          `& tr > :nth-child(${index + 2})`,
          { width: { xs: 110, sm: 'auto' } },
        ])),
        ...Object.fromEntries(Array.from({ length: summaryValueColumns }, (_, i) => i + 1).map((index) => [
          `& tr > :nth-last-child(${index + additionalTextColumns})`,
          { width: { xs: summaryWidth * 0.69 / summaryValueColumns, sm: 'auto' } },
        ])),
        ...(additionalTextColumns ? { '& tr > :last-child': { width: { xs: 110, sm: 'auto' } } } : {}),
      } : undefined}>
        <TableHead>
          <TableRow>
            <TableCell sx={{ ...HEADER_SX, ...firstColumnSx, zIndex: { xs: 4, sm: 2 } }}>{config.xLabel ?? 'Período'}</TableCell>
            {extraColumns.map((extraCol) => (
              <TableCell key={extraCol.field} align="right" sx={HEADER_SX}>
                {extraCol.label}
                {extraCol.unit && (
                  <Box component="span" sx={{ display: 'block', fontSize: 9, fontWeight: 600, color: '#64748b' }}>
                    {extraCol.unit}
                  </Box>
                )}
              </TableCell>
            ))}
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
            {config.hourlyPerPersonColumn && (
              <TableCell align="right" sx={{ ...HEADER_SX, whiteSpace: 'nowrap' }}>
                lbs/pers/h
              </TableCell>
            )}
            {config.teamHourlyColumn && (
              <TableCell align="right" sx={HEADER_SX} title="Libras del día / horas de la jornada. Hoy usa el ritmo en curso de la card Total.">
                Lbs/h
                <Box component="span" sx={{ display: 'block', fontSize: 9, fontWeight: 600, color: '#64748b' }}>promedio del equipo</Box>
              </TableCell>
            )}
            {config.dailyAverageColumn && (
              <TableCell align="right" sx={HEADER_SX}>
                {config.dailyAverageColumn.label}
                {config.dailyAverageColumn.unit && (
                  <Box component="span" sx={{ display: 'block', fontSize: 9, fontWeight: 600, color: '#64748b' }}>
                    {config.dailyAverageColumn.unit}
                  </Box>
                )}
              </TableCell>
            )}
            {trailingColumns.map((column) => <TableCell key={column.field} align="right" sx={{ ...HEADER_SX, whiteSpace: 'nowrap' }}>{column.label}</TableCell>)}
          </TableRow>
        </TableHead>
        <TableBody>
          {periodos.map((periodo) => (
            <TableRow key={periodo} hover>
              <TableCell sx={{ fontWeight: 600, bgcolor: 'background.paper', ...firstColumnSx }}>{formatPeriodo(periodo)}</TableCell>
              {extraColumns.map((extraCol) => (
                <TableCell key={extraCol.field} align="right">
                  {renderValue(extraByPeriodo.get(extraCol.field)?.get(periodo) ?? null, extraCol.format)}
                </TableCell>
              ))}
              {columnas.map((col) => (
                <TableCell key={col} align="right">
                  {renderValue(cells.get(`${periodo}|${col}`)?.value ?? null)}
                </TableCell>
              ))}
              <TableCell align="right" sx={{ fontWeight: 600 }}>
                {renderValue(aggregate(rowCells(periodo)))}
              </TableCell>
              {config.hourlyPerPersonColumn && (
                <TableCell align="right" sx={{ fontWeight: 600, color: 'primary.main' }}>
                  {renderValue(hourlyPerPerson(periodo), 'decimal')}
                </TableCell>
              )}
              {config.teamHourlyColumn && (
                <TableCell align="right" sx={{ fontWeight: 700, color: 'primary.main' }}>
                  {renderValue(teamHourly(periodo), 'number')}
                </TableCell>
              )}
              {config.dailyAverageColumn && (
                <TableCell align="right" sx={{ fontWeight: 600, color: 'primary.main' }}>
                  {renderValue(perDay(aggregate(rowCells(periodo)), daysByPeriodo.get(periodo) ?? 0))}
                </TableCell>
              )}
              {trailingColumns.map((column) => (
                <TableCell key={column.field} align="right" sx={{ whiteSpace: 'normal', fontWeight: 600 }}>
                  {String(data.find((row) => String(row[config.xField] ?? '') === periodo)?.[column.field] ?? '—')}
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
        <TableFooter sx={{ position: 'sticky', bottom: 0, zIndex: 2 }}>
          <TableRow>
            <TableCell sx={{ ...TOTAL_SX, ...firstColumnSx }}>Grand Total</TableCell>
            {extraColumns.map((extraCol) => (
              <TableCell key={extraCol.field} align="right" sx={TOTAL_SX}>
                {renderValue(sumExtra(
                  periodos.map((p) => extraByPeriodo.get(extraCol.field)?.get(p)).filter((v): v is number => v !== undefined),
                ), extraCol.format)}
              </TableCell>
            ))}
            {columnas.map((col) => (
              <TableCell key={col} align="right" sx={TOTAL_SX}>
                {renderValue(aggregate(colCells(col)))}
              </TableCell>
            ))}
            <TableCell align="right" sx={TOTAL_SX}>
              {renderValue(grandTotal)}
            </TableCell>
            {config.hourlyPerPersonColumn && <TableCell align="right" sx={TOTAL_SX}>—</TableCell>}
            {config.teamHourlyColumn && <TableCell align="right" sx={TOTAL_SX}>—</TableCell>}
            {config.dailyAverageColumn && (
              <TableCell align="right" sx={TOTAL_SX}>
                {renderValue(perDay(grandTotal, periodos.reduce((sum, periodo) => sum + (daysByPeriodo.get(periodo) ?? 0), 0)))}
              </TableCell>
            )}
            {trailingColumns.map((column) => <TableCell key={column.field} align="right" sx={TOTAL_SX}>—</TableCell>)}
          </TableRow>
          {config.showShareRow && (
            <TableRow>
              <TableCell sx={{ ...SHARE_SX, ...firstColumnSx }}>% del total</TableCell>
              {extraColumns.map((extraCol) => (
                <TableCell key={extraCol.field} align="right" sx={SHARE_SX}>—</TableCell>
              ))}
              {columnas.map((col) => (
                <TableCell key={col} align="right" sx={SHARE_SX}>
                  {formatValue(shareByColumn.get(col) ?? 0, 'percent')}
                </TableCell>
              ))}
              <TableCell align="right" sx={SHARE_SX}>
                {formatValue(grandTotal && grandTotal > 0 ? 100 : 0, 'percent')}
              </TableCell>
              {config.hourlyPerPersonColumn && <TableCell align="right" sx={SHARE_SX}>—</TableCell>}
              {config.teamHourlyColumn && <TableCell align="right" sx={SHARE_SX}>—</TableCell>}
              {config.dailyAverageColumn && <TableCell align="right" sx={SHARE_SX}>—</TableCell>}
              {trailingColumns.map((column) => <TableCell key={column.field} align="right" sx={SHARE_SX}>—</TableCell>)}
            </TableRow>
          )}
          {config.showAverageRow && (
            <TableRow>
              <TableCell sx={{ ...AVERAGE_SX, ...firstColumnSx }}>{config.averageLabel ?? 'Promedio'}</TableCell>
              {extraColumns.map((extraCol) => (
                <TableCell key={extraCol.field} align="right" sx={AVERAGE_SX}>
                  {renderValue(avgExtra(
                    periodos.map((p) => extraByPeriodo.get(extraCol.field)?.get(p)).filter((v): v is number => v !== undefined),
                  ), extraCol.format)}
                </TableCell>
              ))}
              {columnas.map((col) => (
                <TableCell key={col} align="right" sx={AVERAGE_SX}>
                  {renderValue(simpleAverage(colCells(col)))}
                </TableCell>
              ))}
              <TableCell align="right" sx={AVERAGE_SX}>
                {renderValue(simpleAverage(periodos.flatMap((periodo) => rowCells(periodo))))}
              </TableCell>
              {config.hourlyPerPersonColumn && (
                <TableCell align="right" sx={AVERAGE_SX}>
                  {renderValue((() => {
                    const values = periodos.map(hourlyPerPerson).filter((value): value is number => value !== null && Number.isFinite(value));
                    return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
                  })(), 'decimal')}
                </TableCell>
              )}
              {config.teamHourlyColumn && (
                <TableCell align="right" sx={AVERAGE_SX} title="Promedio de los ritmos diarios del equipo con horas disponibles; no es una suma de tasas.">
                  {renderValue((() => {
                    const values = periodos.map(teamHourly).filter((value): value is number => value !== null && Number.isFinite(value));
                    return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
                  })(), 'number')}
                </TableCell>
              )}
              {config.dailyAverageColumn && <TableCell align="right" sx={AVERAGE_SX}>—</TableCell>}
              {trailingColumns.map((column) => <TableCell key={column.field} align="right" sx={AVERAGE_SX}>—</TableCell>)}
            </TableRow>
          )}
        </TableFooter>
      </Table>
    </TableContainer>
  );
}
