import { ChartConfig } from '../../types';
import ChartWidget from './ChartWidget';

const config: ChartConfig = {
  id: 'pelado-por-estilo',
  type: 'cards',
  title: 'Libras Peladas por Estilo',
  subtitle: 'Rango de fechas y turno del filtro — fuente: STB_data',
  endpoint: 'pelado-por-estilo',
  xField: 'estilo',
  yField: 'libras',
  sort: { field: 'libras', direction: 'desc' },
  valueFormat: 'number',
  unitLabel: 'lbs peladas',
  showTotalCard: true,
};

/**
 * Libras peladas por estilo totalizadas sobre el rango de fechas y turno
 * elegidos en GlobalFilters (a diferencia de PeladoLibrasHoyCards, que
 * siempre muestra el día actual).
 */
export default function PeladoEstiloWidget() {
  return <ChartWidget config={config} />;
}
