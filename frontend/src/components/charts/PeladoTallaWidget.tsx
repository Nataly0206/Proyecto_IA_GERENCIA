import { ChartConfig } from '../../types';
import ChartWidget from './ChartWidget';

const config: ChartConfig = {
  id: 'pelado-por-talla',
  type: 'cards',
  title: 'Detalle de Libras Peladas por Talla',
  subtitle: 'Rango de fechas y turno del filtro — fuente: STB_data',
  endpoint: 'pelado-por-talla',
  xField: 'talla',
  yField: 'libras',
  sort: { field: 'libras', direction: 'desc' },
  valueFormat: 'number',
  unitLabel: 'lbs peladas',
  showTotalCard: true,
};

/**
 * Libras peladas por talla totalizadas sobre el rango de fechas y turno
 * elegidos en GlobalFilters (igual que PeladoEstiloWidget pero por talla).
 */
export default function PeladoTallaWidget() {
  return <ChartWidget config={config} />;
}
