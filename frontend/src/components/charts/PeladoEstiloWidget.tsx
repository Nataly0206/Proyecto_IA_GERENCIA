import { useState } from 'react';
import { Button, Dialog, DialogContent, DialogTitle, IconButton } from '@mui/material';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import CloseOutlinedIcon from '@mui/icons-material/CloseOutlined';
import { ChartConfig } from '../../types';
import ChartWidget from './ChartWidget';
import PeladoTallaWidget from './PeladoTallaWidget';

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

  return (
    <>
      <ChartWidget
        config={config}
        actions={
          <Button
            size="small"
            variant="outlined"
            startIcon={<VisibilityOutlinedIcon />}
            onClick={() => setTallaOpen(true)}
            sx={{ whiteSpace: 'nowrap', fontWeight: 700 }}
          >
            Ver por talla
          </Button>
        }
      />
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
