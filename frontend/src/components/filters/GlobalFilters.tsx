import { useState } from 'react';
import {
  Box,
  Button,
  Checkbox,
  FormControlLabel,
  IconButton,
  InputAdornment,
  MenuItem,
  Popover,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import RestartAltIcon from '@mui/icons-material/RestartAlt';
import CalendarMonthOutlinedIcon from '@mui/icons-material/CalendarMonthOutlined';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import ChevronRightIcon from '@mui/icons-material/ChevronRight';
import dayjs from 'dayjs';
import { useFilters } from '../../context/FiltersContext';
import { TURNOS } from '../../types';
import { getDateFilterError, isValidIsoDate } from '../../utils/dateFilters';

const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic'];
const MONTH_NAMES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

function MonthPicker({ value, onChange }: { value: string; onChange: (month: string) => void }) {
  const today = dayjs();
  const selected = /^\d{4}-\d{2}$/.test(value) ? dayjs(`${value}-01`) : null;
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [year, setYear] = useState(selected?.year() ?? today.year());
  const openPicker = (element: HTMLElement) => {
    setYear(selected?.year() ?? today.year());
    setAnchor(element);
  };
  const chooseMonth = (monthIndex: number) => {
    onChange(`${year}-${String(monthIndex + 1).padStart(2, '0')}`);
    setAnchor(null);
  };

  return (
    <>
      <TextField
        label="Mes"
        size="small"
        fullWidth
        value={selected ? `${MONTH_NAMES[selected.month()]} de ${selected.year()}` : ''}
        onClick={(event) => openPicker(event.currentTarget)}
        inputProps={{ readOnly: true, 'aria-label': 'Seleccionar mes' }}
        InputLabelProps={{ shrink: true }}
        InputProps={{
          readOnly: true,
          endAdornment: (
            <InputAdornment position="end">
              <IconButton
                size="small"
                aria-label="Abrir selector de mes"
                onClick={(event) => { event.stopPropagation(); openPicker(event.currentTarget); }}
              >
                <CalendarMonthOutlinedIcon fontSize="small" />
              </IconButton>
            </InputAdornment>
          ),
        }}
        sx={{ cursor: 'pointer', '& input': { cursor: 'pointer' } }}
      />
      <Popover
        open={Boolean(anchor)}
        anchorEl={anchor}
        onClose={() => setAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
        transformOrigin={{ vertical: 'top', horizontal: 'left' }}
      >
        <Box sx={{ width: 320, maxWidth: 'calc(100vw - 32px)', p: 1.5 }}>
          <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mb: 1 }}>
            <IconButton size="small" onClick={() => setYear((current) => current - 1)} aria-label="Año anterior">
              <ChevronLeftIcon />
            </IconButton>
            <Typography fontWeight={800}>{year}</Typography>
            <IconButton size="small" onClick={() => setYear((current) => current + 1)} disabled={year >= today.year()} aria-label="Año siguiente">
              <ChevronRightIcon />
            </IconButton>
          </Stack>
          <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: .75 }}>
            {MONTHS.map((label, monthIndex) => {
              const monthValue = `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
              const disabled = dayjs(`${monthValue}-01`).isAfter(today, 'month');
              return (
                <Button
                  key={label}
                  size="small"
                  variant={value === monthValue ? 'contained' : 'text'}
                  disabled={disabled}
                  onClick={() => chooseMonth(monthIndex)}
                  sx={{ minWidth: 0, py: 1 }}
                >
                  {label}
                </Button>
              );
            })}
          </Box>
          <Stack direction="row" justifyContent="flex-end" sx={{ mt: 1 }}>
            <Button size="small" onClick={() => { onChange(today.format('YYYY-MM')); setAnchor(null); }}>
              Este mes
            </Button>
          </Stack>
        </Box>
      </Popover>
    </>
  );
}

/**
 * Barra de filtros globales. Los reportes reaccionan a estos valores a
 * través del FiltersContext + React Query. Nota: el reporte mensual usa
 * una ventana fija de 12 meses (solo le afecta el filtro de turno).
 */
export default function GlobalFilters({
  hideTurno = false,
  hideChartValues = false,
}: {
  hideTurno?: boolean;
  hideChartValues?: boolean;
}) {
  const {
    filters,
    showChartValues,
    setShowChartValues,
    updateFilter,
    setFilters,
    resetFilters,
  } = useFilters();
  const selectedMonth = filters.fechaInicial.slice(0, 7) === filters.fechaFinal.slice(0, 7)
    ? filters.fechaInicial.slice(0, 7)
    : '';
  const selectMonth = (month: string) => {
    if (!/^\d{4}-\d{2}$/.test(month)) return;
    const start = dayjs(`${month}-01`);
    const today = dayjs();
    setFilters({
      ...filters,
      fechaInicial: start.format('YYYY-MM-DD'),
      fechaFinal: (start.isSame(today, 'month') ? today : start.endOf('month')).format('YYYY-MM-DD'),
    });
  };
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
          md: hideTurno
            ? 'minmax(140px, 1fr) minmax(140px, 1fr) minmax(140px, .9fr) auto'
            : 'minmax(140px, 1fr) minmax(140px, 1fr) minmax(140px, .9fr) minmax(120px, .8fr) auto',
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

      <MonthPicker value={selectedMonth} onChange={selectMonth} />

      {!hideTurno && (
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
      )}

      <Box
        sx={{
          display: 'grid',
          gridTemplateColumns: { xs: 'minmax(0, 1fr) minmax(0, 1fr)', sm: 'repeat(2, auto)' },
          gap: 1,
          gridColumn: { xs: '1', sm: '1 / -1', md: 'auto' },
        }}
      >
        {!hideChartValues && <FormControlLabel
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
        />}

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
