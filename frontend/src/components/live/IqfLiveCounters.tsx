import {
  Alert,
  Box,
  Card,
  CardContent,
  Chip,
  Grid,
  Skeleton,
  Stack,
  Typography,
} from '@mui/material';
import BoltOutlinedIcon from '@mui/icons-material/BoltOutlined';
import { useIqfLive } from '../../hooks/useDashboardData';
import { formatPeriodo, formatValue } from '../../utils/format';
import { IqfLiveLine } from '../../types';

function haceTexto(minutos: number): string {
  if (minutos < 1) return 'hace instantes';
  if (minutos < 60) return `hace ${minutos} min`;
  const horas = Math.floor(minutos / 60);
  return `hace ${horas} h ${minutos % 60} min`;
}

function estadoLinea(linea: IqfLiveLine): string {
  if (linea.activa) return 'En producción';
  if (linea.cajas === 0) return 'Sin actividad hoy';
  return `Detenida ${haceTexto(linea.minutosDesdeUltima)}`;
}

function LiveCard({ linea }: { linea: IqfLiveLine }) {
  const color = linea.activa ? '#2e7d32' : '#94a3b8';
  return (
    <Card sx={{ height: '100%', borderLeft: `4px solid ${color}` }}>
      <CardContent sx={{ py: 0.9, px: 1.5, '&:last-child': { pb: 0.9 } }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" mb={0.4} spacing={1}>
          <Typography variant="subtitle2" fontWeight={800}>{linea.linea}</Typography>
          <Chip
            size="small"
            label={estadoLinea(linea)}
            sx={{
              bgcolor: `${color}1a`,
              color,
              fontWeight: 600,
              height: 18,
              '& .MuiChip-label': { px: 0.75, fontSize: 10 },
            }}
          />
        </Stack>

        <Typography variant="h6" fontWeight={800} sx={{ color: '#164a8b', lineHeight: 1.05 }}>
          {formatValue(linea.libras)}
          <Typography component="span" variant="caption" color="text.secondary" ml={0.75} fontSize={12}>
            lbs
          </Typography>
        </Typography>
      </CardContent>
    </Card>
  );
}

/**
 * Contadores en tiempo real por línea IQF: acumulado del día de
 * producción, caja por caja según los registros de la torre de pesaje
 * (Seriales.Created). Se refresca automáticamente cada 30 minutos.
 */
export default function IqfLiveCounters() {
  const { data, isLoading, isError, error, dataUpdatedAt } = useIqfLive();

  return (
    <Box>
      <Stack direction="row" alignItems="center" spacing={0.75} mb={0.75} flexWrap="wrap" useFlexGap>
        <BoltOutlinedIcon color="primary" sx={{ fontSize: 18 }} />
        <Typography variant="subtitle2" fontWeight={800}>Producción IQF en Tiempo Real</Typography>
        <Chip
          size="small"
          label="EN VIVO · 30 min"
          color="success"
          variant="outlined"
          sx={{ fontWeight: 700, height: 20, '& .MuiChip-label': { fontSize: 10, px: 0.85 } }}
        />
        {data && data.dia !== '' && (
          <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11 }}>
            {formatPeriodo(data.dia)} · {new Date(dataUpdatedAt).toLocaleTimeString()}
          </Typography>
        )}
      </Stack>

      {isLoading && (
        <Grid container spacing={1}>
          {[1, 2, 3].map((i) => (
            <Grid item xs={12} sm={6} md={4} key={i}>
              <Skeleton variant="rounded" height={82} />
            </Grid>
          ))}
        </Grid>
      )}

      {isError && (
        <Alert severity="error" sx={{ py: 0.5 }}>
          Error al cargar contadores: {error instanceof Error ? error.message : 'desconocido'}
        </Alert>
      )}

      {!isLoading && !isError && (data?.lineas.length ?? 0) === 0 && (
        <Alert severity="info" sx={{ py: 0.5 }}>Sin producción IQF registrada para el turno seleccionado.</Alert>
      )}

      {!isLoading && !isError && data && data.lineas.length > 0 && (
        <Grid container spacing={1}>
          {data.lineas.map((linea) => (
            <Grid item xs={12} sm={6} md={4} key={linea.linea}>
              <LiveCard linea={linea} />
            </Grid>
          ))}
        </Grid>
      )}
    </Box>
  );
}
