import {
  Box,
  Button,
  Checkbox,
  FormControlLabel,
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
          xs: 'minmax(0, 1fr)',
          sm: 'repeat(2, minmax(0, 1fr))',
          md: 'minmax(150px, 1fr) minmax(150px, 1fr) minmax(130px, .8fr) auto',
        },
        gap: { xs: 1.25, md: 1 },
        alignItems: 'start',
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

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: 'minmax(0, 1fr) minmax(0, 1fr)', sm: 'repeat(2, auto)' },
          gap: 1,
          gridColumn: { xs: '1', sm: '1 / -1', md: 'auto' },
        }}
      >
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
            minWidth: 0,
            alignItems: 'center',
            m: 0,
            px: 0.75,
            border: 1,
            borderColor: 'divider',
            borderRadius: 1,
            justifyContent: 'center',
            bgcolor: 'background.paper',
            '& .MuiCheckbox-root': { color: 'primary.main' },
            '& .MuiFormControlLabel-label': { lineHeight: 1 },
          }}
        />

        <Button
          variant="outlined"
          startIcon={<RestartAltIcon />}
          onClick={resetFilters}
          sx={{ height: 40, minWidth: 0, whiteSpace: 'nowrap' }}
        >
          Limpiar
        </Button>
      </Box>
    </Box>
  );
}
