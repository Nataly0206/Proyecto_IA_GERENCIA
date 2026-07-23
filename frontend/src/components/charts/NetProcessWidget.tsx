import { useMemo, useState } from 'react';
import { ToggleButton, ToggleButtonGroup, Tooltip } from '@mui/material';
import { ChartConfig } from '../../types';
import ChartWidget from './ChartWidget';

interface NetProcessWidgetProps {
  height?: number;
}

type Granularidad = 'total' | 'dia' | 'mes';

const BASE_TITLE = 'Libras Congeladas Netas por Tipo de Proceso';
const BASE_SUBTITLE = 'Excluye FRESH TAIL (compra de materia prima) y reempaque';

/**
 * Widget de libras netas por proceso con selector Total / Día / Mensual.
 * El modo "Total" usa la consulta y agregado original del reporte; los
 * modos "Día" y "Mensual" pivotean cada proceso como serie sobre el
 * período correspondiente.
 */
export default function NetProcessWidget({ height }: NetProcessWidgetProps) {
  const [granularidad, setGranularidad] = useState<Granularidad>('total');

  const config: ChartConfig = useMemo(() => {
    if (granularidad === 'dia') {
      return {
        id: 'libras-netas-proceso-dia',
        type: 'table',
        title: BASE_TITLE,
        subtitle: `${BASE_SUBTITLE} — por día`,
        endpoint: 'libras-netas-proceso-dia',
        xField: 'periodo',
        xLabel: 'Fecha',
        yField: 'libras',
        seriesField: 'proceso',
        totalAggregation: 'sum',
        valueFormat: 'number',
        height,
      };
    }
    if (granularidad === 'mes') {
      return {
        id: 'libras-netas-proceso-mes',
        type: 'table',
        title: BASE_TITLE,
        subtitle: `${BASE_SUBTITLE} — últimos 12 meses`,
        endpoint: 'libras-netas-proceso-mes',
        xField: 'periodo',
        xLabel: 'Mes',
        yField: 'libras',
        seriesField: 'proceso',
        totalAggregation: 'sum',
        valueFormat: 'number',
        height,
      };
    }
    return {
      id: 'libras-netas-proceso',
      type: 'cards',
      title: BASE_TITLE,
      subtitle: BASE_SUBTITLE,
      endpoint: 'libras-netas-proceso',
      xField: 'proceso',
      yField: 'libras',
      sort: { field: 'libras', direction: 'desc' },
      valueFormat: 'number',
      height,
    };
  }, [granularidad, height]);

  return (
    <ChartWidget
      config={config}
      actions={
        <ToggleButtonGroup
          size="small"
          exclusive
          value={granularidad}
          onChange={(_e, next: Granularidad | null) => next && setGranularidad(next)}
          sx={{ '& .MuiToggleButton-root': { px: 1.25, py: 0.5, fontSize: 11, fontWeight: 700, lineHeight: 1 } }}
        >
          <ToggleButton value="total" aria-label="Vista total">
            <Tooltip title="Total del rango filtrado">
              <span>Total</span>
            </Tooltip>
          </ToggleButton>
          <ToggleButton value="dia" aria-label="Vista diaria">
            <Tooltip title="Por día">
              <span>Día</span>
            </Tooltip>
          </ToggleButton>
          <ToggleButton value="mes" aria-label="Vista mensual">
            <Tooltip title="Últimos 12 meses">
              <span>Mensual</span>
            </Tooltip>
          </ToggleButton>
        </ToggleButtonGroup>
      }
    />
  );
}
