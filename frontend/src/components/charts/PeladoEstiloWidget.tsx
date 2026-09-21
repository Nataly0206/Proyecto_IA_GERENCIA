import { useState } from 'react';
import { Button, Dialog, DialogContent, DialogTitle, IconButton, Stack } from '@mui/material';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import TodayOutlinedIcon from '@mui/icons-material/TodayOutlined';
import CloseOutlinedIcon from '@mui/icons-material/CloseOutlined';
import { ChartConfig } from '../../types';
import ChartWidget from './ChartWidget';
import PeladoTallaWidget from './PeladoTallaWidget';
import { peladoWidgets } from '../../config/dashboardConfig';

const dailyTableConfig: ChartConfig = {
  ...peladoWidgets[0],
  altChartType: undefined,
  trendChartType: undefined,
};

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
  const [tallaOpen, setTallaOpen] = useState(false);
  const [diarioOpen, setDiarioOpen] = useState(false);

  return (
    <>
      <ChartWidget
        config={config}
        actions={
          <Stack direction="row" spacing={1}>
          <Button size="small" variant="outlined" startIcon={<TodayOutlinedIcon />}
            onClick={() => setDiarioOpen(true)} sx={{ whiteSpace: 'nowrap', fontWeight: 700 }}>
            Total diario
          </Button>
          <Button
            size="small"
            variant="outlined"
            startIcon={<VisibilityOutlinedIcon />}
            onClick={() => setTallaOpen(true)}
            sx={{ whiteSpace: 'nowrap', fontWeight: 700 }}
          >
            Ver por talla
          </Button>
          </Stack>
        }
      />
      <Dialog open={diarioOpen} onClose={() => setDiarioOpen(false)} fullWidth maxWidth="lg">
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', py: 1.5 }}>
          Libras Peladas por Estilo — Total diario
          <IconButton aria-label="Cerrar total diario por estilo" onClick={() => setDiarioOpen(false)}>
            <CloseOutlinedIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers sx={{ p: 1.5 }}>
          {diarioOpen && <ChartWidget config={dailyTableConfig} />}
        </DialogContent>
      </Dialog>
      <Dialog open={tallaOpen} onClose={() => setTallaOpen(false)} fullWidth maxWidth="md">
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', py: 1.5 }}>
          Detalle de Libras Peladas por Talla
          <IconButton aria-label="Cerrar detalle por talla" onClick={() => setTallaOpen(false)}>
            <CloseOutlinedIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers sx={{ p: 1.5 }}>
          {tallaOpen && <PeladoTallaWidget />}
        </DialogContent>
      </Dialog>
    </>
  );
}
