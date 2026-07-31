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

function LiveCard({ linea, total = false }: { linea: IqfLiveLine; total?: boolean }) {
  const color = total ? '#164a8b' : linea.libras > 0 ? '#2e7d32' : '#94a3b8';

  return (
    <Card
      sx={{
        borderTop: `3px solid ${color}`,
        bgcolor: total
          ? 'rgba(22,74,139,0.06)'
          : linea.libras > 0
            ? 'rgba(46,125,50,0.03)'
            : 'background.paper',
        height: '100%',
      }}
    >
      <CardContent sx={{ py: 1.25, px: 1.75, '&:last-child': { pb: 1.25 } }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" mb={0.5} spacing={0.5}>
          <Typography variant="body2" fontWeight={700} noWrap sx={{ minWidth: 0 }} title={linea.linea}>
            {linea.linea}
          </Typography>
          <Chip
            size="small"
            label={
              total
                ? 'IQF 1 + IQF 2 + IQF 3'
                : linea.ultimaCaja
                  ? `Última lectura: ${linea.ultimaCaja}`
                  : 'Sin lectura hoy'
            }
            sx={{
              maxWidth: { xs: 124, sm: 'none' },
              bgcolor: `${color}18`,
              color,
              fontWeight: 700,
              height: 18,
              '& .MuiChip-label': {
                px: 0.7,
                fontSize: 9.5,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              },
            }}
          />
        </Stack>

        <Typography
          variant="h6"
          fontWeight={800}
          sx={{ color: linea.libras > 0 ? '#164a8b' : 'text.secondary', lineHeight: 1.1 }}
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
  const totalIqf =
    data?.lineas
      .filter((linea) => /\bIQF\s*[-#]?\s*[123]\b/i.test(linea.linea))
      .reduce((total, linea) => total + linea.libras, 0) ?? 0;

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
          <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11, flexBasis: { xs: '100%', sm: 'auto' }, pl: { xs: 2.75, sm: 0 } }}>
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
            gridTemplateColumns: {
              xs: 'repeat(2, minmax(0, 1fr))',
              sm: `repeat(${data.lineas.length + 1}, minmax(0, 1fr))`,
            },
            gap: 1,
            '& > :last-child:nth-of-type(odd)': { gridColumn: { xs: '1 / -1', sm: 'auto' } },
          }}
        >
          {data.lineas.map((linea) => (
            <LiveCard key={linea.linea} linea={linea} />
          ))}
          <LiveCard
            total
            linea={{
              linea: 'Total IQF',
              libras: totalIqf,
              cajas: 0,
              librasUltimaHora: 0,
              librasPorHora: 0,
              primeraCaja: '',
              ultimaCaja: '',
              minutosDesdeUltima: -1,
              activa: false,
            }}
          />
        </Box>
      )}
    </Box>
  );
}
