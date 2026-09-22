import { Alert, Box, Chip, Skeleton, Stack, Typography } from '@mui/material';
import PrecisionManufacturingOutlinedIcon from '@mui/icons-material/PrecisionManufacturingOutlined';
import { useClasificadoPorMaquinaHoy } from '../../hooks/useDashboardData';
import { formatPeriodo } from '../../utils/format';
import { ChartConfig } from '../../types';
import KpiCards from '../charts/KpiCards';

const config: ChartConfig = {
  id: 'clasificado-por-maquina-hoy',
  type: 'cards',
  title: 'Libras Clasificadas por Máquina — Hoy',
  endpoint: 'clasificado-por-maquina',
  xField: 'maquina',
  yField: 'libras',
  sort: { field: 'libras', direction: 'desc' },
  valueFormat: 'number',
  unitLabel: 'lbs',
  showTotalCard: true,
  rateField: 'librasPorHora',
  rateWeightField: 'horas',
};

/**
 * Mismo estilo de tarjetas (libras + lbs/h) que "Libras Clasificadas por
 * Máquina", pero siempre del día en curso y en vivo — igual que
 * `PeladoLibrasHoyCards` / `IqfLiveCounters`, a diferencia del widget
 * filtrado por rango de fechas/turno.
 */
export default function ClasificadoPorMaquinaHoyCards() {
  const { data, isLoading, isError, error, dataUpdatedAt } = useClasificadoPorMaquinaHoy();

  return (
    <Box>
      <Stack direction="row" alignItems="center" spacing={0.75} mb={0.9} flexWrap="wrap" useFlexGap>
        <PrecisionManufacturingOutlinedIcon color="primary" sx={{ fontSize: 16 }} />
        <Typography variant="subtitle2" fontWeight={800} sx={{ fontSize: 13 }}>
          Libras Clasificadas por Máquina — Hoy
        </Typography>
        <Chip
          size="small"
          label="EN VIVO"
          color="success"
          variant="outlined"
          sx={{ fontWeight: 700, height: 18, '& .MuiChip-label': { fontSize: 9.5, px: 0.75 } }}
        />
        {data && data.dia !== '' && (
          <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11, flexBasis: { xs: '100%', sm: 'auto' }, pl: { xs: 2.75, sm: 0 } }}>
            {formatPeriodo(data.dia)} · actualizado {new Date(dataUpdatedAt).toLocaleTimeString()}
          </Typography>
        )}
      </Stack>

      {isLoading && (
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', sm: 'repeat(4, minmax(0, 1fr))' }, gap: 1 }}>
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} variant="rounded" height={64} />
          ))}
        </Box>
      )}

      {isError && (
        <Alert severity="error" sx={{ py: 0.5 }}>
          Error al cargar clasificado por máquina: {error instanceof Error ? error.message : 'desconocido'}
        </Alert>
      )}

      {!isLoading && !isError && (data?.maquinas.length ?? 0) === 0 && (
        <Alert severity="info" sx={{ py: 0.5 }}>
          Sin clasificado registrado hoy.
        </Alert>
      )}

      {!isLoading && !isError && data && data.maquinas.length > 0 && (
        <KpiCards config={config} data={data.maquinas} compact />
      )}
    </Box>
  );
}
