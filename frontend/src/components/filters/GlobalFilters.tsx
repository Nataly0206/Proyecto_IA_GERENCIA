import { Button, Divider, MenuItem, Stack, TextField } from '@mui/material';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import { useFilters } from '../../context/FiltersContext';
import { TURNOS } from '../../types';

/**
 * Barra de filtros globales. Los reportes reaccionan a estos valores a
 * través del FiltersContext + React Query. Nota: el reporte mensual usa
 * una ventana fija de 12 meses (solo le afecta el filtro de turno).
 */
export default function GlobalFilters() {
  const { filters, updateFilter, resetFilters } = useFilters();

  return (
    <Stack spacing={2.25}>
      <TextField
        label="Fecha Inicial"
        type="date"
        size="small"
        fullWidth
        value={filters.fechaInicial}
        onChange={(e) => updateFilter('fechaInicial', e.target.value)}
        InputLabelProps={{ shrink: true }}
      />

      <TextField
        label="Fecha Final"
        type="date"
        size="small"
        fullWidth
        value={filters.fechaFinal}
        onChange={(e) => updateFilter('fechaFinal', e.target.value)}
        InputLabelProps={{ shrink: true }}
      />

      <TextField
        label="Turno"
        select
        size="small"
        fullWidth
        value={filters.turno}
        onChange={(e) => updateFilter('turno', e.target.value)}
      >
        <MenuItem value="">Todos</MenuItem>
        {TURNOS.map((turno) => (
          <MenuItem key={turno} value={turno}>
            Turno {turno}
          </MenuItem>
        ))}
      </TextField>

      <Divider />

      <Button
        variant="outlined"
        startIcon={<RestartAltIcon />}
        onClick={resetFilters}
        sx={{ alignSelf: 'flex-start' }}
      >
        Limpiar filtros
      </Button>
    </Stack>
  );
}
