import { useMemo, useState } from 'react';
import {
  Box,
  Button,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  Stack,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
} from '@mui/material';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import CloseOutlinedIcon from '@mui/icons-material/CloseOutlined';
import { ChartConfig } from '../../types';
import ChartWidget from './ChartWidget';
import PeladoTallaWidget from './PeladoTallaWidget';
import { peladoWidgets } from '../../config/dashboardConfig';

const TABLE_H = 440;
const BASE_TITLE = 'Libras Peladas por Estilo';
const BASE_SUBTITLE = 'Rango de fechas y turno del filtro — fuente: STB_data';

const dailyTableConfig: ChartConfig = {
  ...peladoWidgets[0],
  altChartType: undefined,
  trendChartType: undefined,
  showAverageRow: true,
  extraColumns: [
    {
      field: 'horasTrabajadas',
      label: 'Horas Trabajadas',
      unit: 'h · planta',
      format: 'decimal',
    },
    {
      field: 'personas',
      label: 'Personas',
      unit: 'pelando ese día',
      format: 'number',
    },
  ],
};

type Vista = 'total' | 'diario';

const totalConfig: ChartConfig = {
  id: 'pelado-por-estilo',
  type: 'cards',
  title: BASE_TITLE,
  subtitle: BASE_SUBTITLE,
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
  const [vista, setVista] = useState<Vista>('total');

  const config = useMemo(() => (vista === 'diario' ? dailyTableConfig : totalConfig), [vista]);

  const chartWidget = (
    <ChartWidget
      config={config}
      actions={
        <Stack direction="row" spacing={1}>
          <ToggleButtonGroup
            size="small"
            exclusive
            value={vista}
            onChange={(_e, next: Vista | null) => next && setVista(next)}
            sx={{ '& .MuiToggleButton-root': { px: 1.25, py: 0.5, fontSize: 11, fontWeight: 700, lineHeight: 1 } }}
          >
            <ToggleButton value="total" aria-label="Vista total">
              <Tooltip title="Total del rango filtrado">
                <span>Total</span>
              </Tooltip>
            </ToggleButton>
            <ToggleButton value="diario" aria-label="Vista diaria">
              <Tooltip title="Total diario">
                <span>Diario</span>
              </Tooltip>
            </ToggleButton>
          </ToggleButtonGroup>
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
  );

  return (
    <>
      {vista === 'diario' ? (
        <Box sx={{ height: TABLE_H, flexShrink: 0 }}>{chartWidget}</Box>
      ) : (
        chartWidget
      )}
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
