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
} from '@mui/material';
import VisibilityOutlinedIcon from '@mui/icons-material/VisibilityOutlined';
import CloseOutlinedIcon from '@mui/icons-material/CloseOutlined';
import { ChartConfig, DataRow } from '../../types';
import ChartWidget from './ChartWidget';
import PeladoTallaWidget from './PeladoTallaWidget';
import { peladoWidgets } from '../../config/dashboardConfig';
import { useFilters } from '../../context/FiltersContext';

const BASE_TITLE = 'Libras Peladas por Estilo';
const BASE_SUBTITLE = 'Día y semana: rango seleccionado · mes: año seleccionado · turno del filtro';

const dailyTableConfig: ChartConfig = {
  ...peladoWidgets[0],
  title: BASE_TITLE,
  subtitle: BASE_SUBTITLE,
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
      unit: 'únicas por período',
      format: 'number',
    },
  ],
};

type Vista = 'dia' | 'semana' | 'mes';

/**
 * Libras peladas por estilo totalizadas sobre el rango de fechas y turno
 * elegidos en GlobalFilters (a diferencia de PeladoLibrasHoyCards, que
 * siempre muestra el día actual).
 */
export default function PeladoEstiloWidget() {
  const [tallaOpen, setTallaOpen] = useState(false);
  const [vista, setVista] = useState<Vista>('dia');
  const { filters } = useFilters();
  const year = filters.fechaFinal.slice(0, 4);
  const queryParams = { periodo: vista, ...(vista === 'mes' ? { fechaInicial: `${year}-01-01`, fechaFinal: `${year}-12-31` } : {}) };

  const config = useMemo(() => ({ ...dailyTableConfig, xLabel: vista === 'dia' ? 'Fecha' : vista === 'semana' ? 'Semana' : 'Mes' }), [vista]);
  const completeMonths = (rows: DataRow[]): DataRow[] => {
    if (vista !== 'mes' || rows.length === 0) return rows;
    const styles = Array.from(new Set(rows.map((row) => String(row.estilo))));
    const present = new Set(rows.map((row) => `${row.periodo}|${row.estilo}`));
    const empty: DataRow[] = [];
    for (let month = 1; month <= 12; month += 1) {
      const periodo = `${year}-${String(month).padStart(2, '0')}`;
      for (const estilo of styles) {
        if (!present.has(`${periodo}|${estilo}`)) empty.push({ periodo, estilo, libras: 0, horasTrabajadas: 0, personas: 0 });
      }
    }
    return [...rows, ...empty];
  };

  const chartWidget = (
    <ChartWidget
      autoHeight
      config={config}
      queryParams={queryParams}
      transform={completeMonths}
      actions={
        <Stack direction="row" spacing={1}>
          <ToggleButtonGroup
            size="small"
            exclusive
            value={vista}
            onChange={(_e, next: Vista | null) => next && setVista(next)}
            sx={{ '& .MuiToggleButton-root': { px: 1.25, py: 0.5, fontSize: 11, fontWeight: 700, lineHeight: 1 } }}
          >
            <ToggleButton value="dia" aria-label="Vista por día">Día</ToggleButton>
            <ToggleButton value="semana" aria-label="Vista por semana">Semana</ToggleButton>
            <ToggleButton value="mes" aria-label="Vista por mes">Mes</ToggleButton>
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
      <Box sx={{ flexShrink: 0 }}>{chartWidget}</Box>
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
