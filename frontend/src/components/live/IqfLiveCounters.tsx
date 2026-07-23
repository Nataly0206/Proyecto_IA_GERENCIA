import {
  Alert,
  Box,
  Card,
  CardContent,
  Chip,
  Skeleton,
  Stack,
  Typography,
} from '@mui/material';
import BoltOutlinedIcon from '@mui/icons-material/BoltOutlined';
import { useIqfLive } from '../../hooks/useDashboardData';
import { formatPeriodo, formatValue } from '../../utils/format';
import { IqfLiveLine } from '../../types';

function haceTexto(minutos: number): string {
  if (minutos < 1) return 'ahora';
  if (minutos < 60) return `${minutos} min`;
  const horas = Math.floor(minutos / 60);
  return `${horas}h ${minutos % 60}m`;
}

function LiveCard({ linea }: { linea: IqfLiveLine }) {
  const active = linea.activa;
  const color = active ? '#2e7d32' : '#94a3b8';

  return (
    <Card
      sx={{
        borderTop: `3px solid ${color}`,
        bgcolor: active ? 'rgba(46,125,50,0.03)' : 'background.paper',
        height: '100%',
      }}
    >
      <CardContent sx={{ py: 1.25, px: 1.75, '&:last-child': { pb: 1.25 } }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" mb={0.5} spacing={0.75}>
          <Typography variant="body2" fontWeight={700} noWrap sx={{ maxWidth: 110 }} title={linea.linea}>
            {linea.linea}
          </Typography>
          <Chip
            size="small"
            label={`Último registro: ${
              active ? 'ACTIVA' : linea.cajas === 0 ? 'SIN DATOS' : haceTexto(linea.minutosDesdeUltima)
            }`}
            sx={{
              bgcolor: `${color}18`,
              color,
              fontWeight: 700,
              height: 16,
              '& .MuiChip-label': { px: 0.6, fontSize: 9.5 },
            }}
          />
        </Stack>

        <Typography
          variant="h6"
          fontWeight={800}
          sx={{ color: active ? '#164a8b' : 'text.secondary', lineHeight: 1.1 }}
        >
          {formatValue(linea.libras)}
          <Typography component="span" variant="caption" color="text.secondary" ml={0.5}>
            lbs
          </Typography>
        </Typography>
      </CardContent>
    </Card>
  );
}

export default function IqfLiveCounters() {
  const { data, isLoading, isError, error, dataUpdatedAt } = useIqfLive();

  return (
    <Box>
      <Stack direction="row" alignItems="center" spacing={0.75} mb={0.9} flexWrap="wrap" useFlexGap>
        <BoltOutlinedIcon color="primary" sx={{ fontSize: 16 }} />
        <Typography variant="subtitle2" fontWeight={800} sx={{ fontSize: 13 }}>
          Producción IQF en Tiempo Real
        </Typography>
        <Chip
          size="small"
          label="EN VIVO"
          color="success"
          variant="outlined"
          sx={{ fontWeight: 700, height: 18, '& .MuiChip-label': { fontSize: 9.5, px: 0.75 } }}
        />
        {data && data.dia !== '' && (
          <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11 }}>
            {formatPeriodo(data.dia)} · actualizado {new Date(dataUpdatedAt).toLocaleTimeString()}
          </Typography>
        )}
      </Stack>

      {isLoading && (
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1 }}>
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} variant="rounded" height={68} />
          ))}
        </Box>
      )}

      {isError && (
        <Alert severity="error" sx={{ py: 0.5 }}>
          Error al cargar contadores IQF: {error instanceof Error ? error.message : 'desconocido'}
        </Alert>
      )}

      {!isLoading && !isError && (data?.lineas.length ?? 0) === 0 && (
        <Alert severity="info" sx={{ py: 0.5 }}>
          Sin producción IQF registrada para el turno seleccionado.
        </Alert>
      )}

      {!isLoading && !isError && data && data.lineas.length > 0 && (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: `repeat(${data.lineas.length}, 1fr)`,
            gap: 1,
          }}
        >
          {data.lineas.map((linea) => (
            <LiveCard key={linea.linea} linea={linea} />
          ))}
        </Box>
      )}
    </Box>
  );
}
