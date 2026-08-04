import { useMemo, useState } from 'react';
import { ToggleButton, ToggleButtonGroup, Tooltip } from '@mui/material';
import { ChartConfig } from '../../types';
import ChartWidget from './ChartWidget';

interface PeladoStyleWidgetProps {
  height?: number;
}

type Granularidad = 'total' | 'dia' | 'mes';
type Dimension = 'estilo' | 'talla';

const BASE_SUBTITLE = 'Libras asignadas — fuente: STB_data';

const ENDPOINT: Record<Dimension, Record<Granularidad, ChartConfig['endpoint']>> = {
  estilo: {
    total: 'pelado-por-estilo',
    dia: 'pelado-por-estilo-dia',
    mes: 'pelado-por-estilo-mes',
  },
  talla: {
    total: 'pelado-por-talla',
    dia: 'pelado-por-talla-dia',
    mes: 'pelado-por-talla-mes',
  },
};

/**
 * Widget de libras peladas por Estilo o por Talla, con selector Total /
 * Día / Mensual. Fuente: STB_data (vista V_PagosxPeladoIndividualPBI,
 * libras realmente asignadas a producción, no reporte de producción de
 * PlantaEmpacadora). El modo "Total" usa el agregado simple del rango
 * filtrado; "Día" y "Mensual" pivotean cada valor de la dimensión elegida
 * como serie sobre el período correspondiente.
 */
export default function PeladoStyleWidget({ height }: PeladoStyleWidgetProps) {
  const [granularidad, setGranularidad] = useState<Granularidad>('total');
  const [dimension, setDimension] = useState<Dimension>('estilo');

  const title = dimension === 'estilo' ? 'Libras Peladas por Estilo' : 'Libras Peladas por Talla';
  const endpoint = ENDPOINT[dimension][granularidad];

  const config: ChartConfig = useMemo(() => {
    if (granularidad === 'dia') {
      return {
        id: endpoint,
        type: 'table',
        title,
        subtitle: `${BASE_SUBTITLE} — por día`,
        endpoint,
        xField: 'periodo',
        xLabel: 'Fecha',
        yField: 'libras',
        seriesField: dimension,
        totalAggregation: 'sum',
        valueFormat: 'number',
        height,
      };
    }
    if (granularidad === 'mes') {
      return {
        id: endpoint,
        type: 'table',
        title,
        subtitle: `${BASE_SUBTITLE} — últimos 12 meses`,
        endpoint,
        xField: 'periodo',
        xLabel: 'Mes',
        yField: 'libras',
        seriesField: dimension,
        totalAggregation: 'sum',
        valueFormat: 'number',
        height,
      };
    }
    return {
      id: endpoint,
      type: 'bar',
      title,
      subtitle: BASE_SUBTITLE,
      endpoint,
      xField: dimension,
      yField: 'libras',
      sort: { field: 'libras', direction: 'desc' },
      valueFormat: 'number',
      showTotalCard: true,
      height,
    };
  }, [dimension, endpoint, granularidad, height, title]);

  return (
    <ChartWidget
      config={config}
      actions={
        <>
          <ToggleButtonGroup
            size="small"
            exclusive
            value={dimension}
            onChange={(_e, next: Dimension | null) => next && setDimension(next)}
            sx={{ '& .MuiToggleButton-root': { px: 1.25, py: 0.5, fontSize: 11, fontWeight: 700, lineHeight: 1 } }}
          >
            <ToggleButton value="estilo" aria-label="Por estilo">
              <Tooltip title="Agrupar por estilo">
                <span>Estilo</span>
              </Tooltip>
            </ToggleButton>
            <ToggleButton value="talla" aria-label="Por talla">
              <Tooltip title="Agrupar por talla">
                <span>Talla</span>
              </Tooltip>
            </ToggleButton>
          </ToggleButtonGroup>
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
        </>
      }
    />
  );
}
