import { useState } from 'react';
import { Stack, ToggleButton, ToggleButtonGroup } from '@mui/material';
import { ChartConfig, DataRow } from '../../types';
import { exportacionesWidgets } from '../../config/dashboardConfig';
import { WeightUnit } from '../../utils/weightUnits';
import { ExportGrouping, groupExportRows } from '../../utils/exportaciones';
import ChartWidget from './ChartWidget';
import { useFilters } from '../../context/FiltersContext';

type Periodo = 'total' | 'dia' | 'semana' | 'mes';
type Agrupacion = ExportGrouping;

export default function ExportacionesEstiloWidget({ weightUnit, queryParams }: {
  weightUnit: WeightUnit; queryParams: Record<string, string>;
}) {
  const { filters } = useFilters();
  const [periodo, setPeriodo] = useState<Periodo>('total');
  const [agrupacion, setAgrupacion] = useState<Agrupacion>('estilo');
  const total = periodo === 'total';
  const dimension = agrupacion === 'ambos' ? 'Estilo y Cliente' : agrupacion === 'cliente' ? 'Cliente' : 'Estilo';
  const config: ChartConfig = {
    ...exportacionesWidgets[0],
    title: `${weightUnit === 'kg' ? 'Kg' : 'Libras'} Exportadas por ${dimension}`,
    subtitle: periodo === 'mes'
      ? `Enero a diciembre de ${filters.fechaFinal.slice(0, 4)} · clientes seleccionados · fecha de carga`
      : 'Rango de fechas y clientes seleccionados · fecha de carga · semanas de lunes a domingo',
    type: total ? 'cards' : 'table',
    xField: total ? 'grupo' : 'periodo',
    xLabel: periodo === 'semana' ? 'Semana' : periodo === 'mes' ? 'Mes' : 'Fecha',
    seriesField: total ? undefined : 'grupo',
    sort: total ? { field: 'libras', direction: 'desc' } : undefined,
    totalAggregation: 'sum',
    showTotalCard: total,
    unitLabel: `${weightUnit} exportadas`,
    valueFormat: 'number',
    stickyFirstColumn: !total,
  };
  const transform = (rows: DataRow[]) => groupExportRows(rows, agrupacion, weightUnit);
  return <ChartWidget autoHeight config={config} queryParams={{ ...queryParams, periodo }} transform={transform}
    actions={<Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
      <ToggleButtonGroup size="small" exclusive value={periodo} aria-label="Período de libras exportadas"
        onChange={(_event, value: Periodo | null) => { if (value) setPeriodo(value); }}
        sx={{ '& .MuiToggleButton-root': { px: 1.25, py: 0.5, fontSize: 11, fontWeight: 700, lineHeight: 1 } }}>
        <ToggleButton value="total">Total</ToggleButton>
        <ToggleButton value="dia">Día</ToggleButton>
        <ToggleButton value="semana">Semana</ToggleButton>
        <ToggleButton value="mes">Mes</ToggleButton>
      </ToggleButtonGroup>
      <ToggleButtonGroup size="small" exclusive value={agrupacion} aria-label="Agrupar libras exportadas"
        onChange={(_event, value: Agrupacion | null) => { if (value) setAgrupacion(value); }}
        sx={{ '& .MuiToggleButton-root': { px: 1.25, py: 0.5, fontSize: 11, fontWeight: 700, lineHeight: 1 } }}>
        <ToggleButton value="estilo">Por estilo</ToggleButton>
        <ToggleButton value="cliente">Por cliente</ToggleButton>
        <ToggleButton value="ambos">Estilo y cliente</ToggleButton>
      </ToggleButtonGroup>
    </Stack>} />;
}
