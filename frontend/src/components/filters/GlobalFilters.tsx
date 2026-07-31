import {
  Box,
  Button,
  Checkbox,
  FormControlLabel,
  FormGroup,
  MenuItem,
  TextField,
  Typography,
} from '@mui/material';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import { useFilters } from '../../context/FiltersContext';
import { TURNOS } from '../../types';
import { getDateFilterError, isValidIsoDate } from '../../utils/dateFilters';

/**
 * Barra de filtros globales. Los reportes reaccionan a estos valores a
 * través del FiltersContext + React Query. Nota: el reporte mensual usa
 * una ventana fija de 12 meses (solo le afecta el filtro de turno).
 */
export default function GlobalFilters() {
  const {
    filters,
    showChartValues,
    setShowChartValues,
    updateFilter,
    resetFilters,
  } = useFilters();
  const dateError = getDateFilterError(filters);
  const initialDateError =
    !isValidIsoDate(filters.fechaInicial) || filters.fechaInicial > filters.fechaFinal;
  const finalDateError =
    !isValidIsoDate(filters.fechaFinal) || filters.fechaInicial > filters.fechaFinal;

  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: {
          xs: '1fr 1fr',
          sm: 'minmax(145px, 1fr) minmax(145px, 1fr) minmax(120px, .75fr) auto auto',
        },
        gap: 1,
        alignItems: 'center',
      }}
    >
      <TextField
        label="Desde"
        type="date"
        size="small"
        fullWidth
        value={filters.fechaInicial}
        onChange={(e) => updateFilter('fechaInicial', e.target.value)}
        InputLabelProps={{ shrink: true }}
        inputProps={{ max: filters.fechaFinal || undefined }}
        error={initialDateError}
        helperText={initialDateError ? dateError : undefined}
      />

      <TextField
        label="Hasta"
        type="date"
        size="small"
        fullWidth
        value={filters.fechaFinal}
        onChange={(e) => updateFilter('fechaFinal', e.target.value)}
        InputLabelProps={{ shrink: true }}
        inputProps={{ min: filters.fechaInicial || undefined }}
        error={finalDateError}
        helperText={finalDateError && !initialDateError ? dateError : undefined}
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

      <FormGroup>
        <FormControlLabel
          control={
            <Checkbox
              size="small"
              checked={showChartValues}
              onChange={(event) => setShowChartValues(event.target.checked)}
            />
          }
          label={
            <Typography variant="button" color="primary" whiteSpace="nowrap">
              Ver valores
            </Typography>
          }
          sx={{
            height: 40,
            alignItems: 'center',
            m: 0,
            '& .MuiCheckbox-root': { color: 'primary.main' },
          }}
        />
      </FormGroup>

      <Button
        variant="outlined"
        startIcon={<RestartAltIcon />}
        onClick={resetFilters}
        sx={{ height: 40, whiteSpace: 'nowrap' }}
      >
        Limpiar
      </Button>
    </Box>
  );
}
