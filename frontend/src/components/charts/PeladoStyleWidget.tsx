import { useMemo, useState } from 'react';
import { ToggleButton, ToggleButtonGroup, Tooltip } from '@mui/material';
import { ChartConfig } from '../../types';
import ChartWidget from './ChartWidget';

interface PeladoStyleWidgetProps {
  height?: number;
}

type Granularidad = 'total' | 'dia' | 'mes';

const BASE_TITLE = 'Libras Peladas por Estilo';
const BASE_SUBTITLE = 'PD, PPV, PPV-FR, PPV-UK, COOK, PTO — producto sin cáscara';

/**
 * Widget de libras peladas por estilo con selector Total / Día / Mensual.
 * Mismo patrón que <NetProcessWidget />: el modo "Total" usa el agregado
 * simple del rango filtrado; "Día" y "Mensual" pivotean cada estilo como
 * serie sobre el período correspondiente.
 */
export default function PeladoStyleWidget({ height }: PeladoStyleWidgetProps) {
  const [granularidad, setGranularidad] = useState<Granularidad>('total');

  const config: ChartConfig = useMemo(() => {
    if (granularidad === 'dia') {
      return {
        id: 'pelado-por-estilo-dia',
        type: 'table',
        title: BASE_TITLE,
        subtitle: `${BASE_SUBTITLE} — por día`,
        endpoint: 'pelado-por-estilo-dia',
        xField: 'periodo',
        xLabel: 'Fecha',
        yField: 'libras',
        seriesField: 'estilo',
        totalAggregation: 'sum',
        valueFormat: 'number',
        height,
      };
    }
    if (granularidad === 'mes') {
      return {
        id: 'pelado-por-estilo-mes',
        type: 'table',
        title: BASE_TITLE,
        subtitle: `${BASE_SUBTITLE} — últimos 12 meses`,
        endpoint: 'pelado-por-estilo-mes',
        xField: 'periodo',
        xLabel: 'Mes',
        yField: 'libras',
        seriesField: 'estilo',
        totalAggregation: 'sum',
        valueFormat: 'number',
        height,
      };
    }
    return {
      id: 'pelado-por-estilo',
      type: 'bar',
      title: BASE_TITLE,
      subtitle: BASE_SUBTITLE,
      endpoint: 'pelado-por-estilo',
      xField: 'estilo',
      yField: 'libras',
      sort: { field: 'libras', direction: 'desc' },
      valueFormat: 'number',
      showTotalCard: true,
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
