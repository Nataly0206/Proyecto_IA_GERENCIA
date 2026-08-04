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
import ContentCutOutlinedIcon from '@mui/icons-material/ContentCutOutlined';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import { usePeladoLive } from '../../hooks/useDashboardData';
import { formatPeriodo, formatValue } from '../../utils/format';
import { PeladoLiveStyle } from '../../types';

function LiveCard({ estilo, total = false }: { estilo: PeladoLiveStyle; total?: boolean }) {
  const color = total ? '#164a8b' : estilo.libras > 0 ? '#2e7d32' : '#94a3b8';

  return (
    <Card
      sx={{
        borderTop: `3px solid ${color}`,
        bgcolor: total
          ? 'rgba(22,74,139,0.06)'
          : estilo.libras > 0
            ? 'rgba(46,125,50,0.03)'
            : 'background.paper',
        height: '100%',
      }}
    >
      <CardContent sx={{ py: 1.25, px: 1.75, '&:last-child': { pb: 1.25 } }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center" mb={0.5} spacing={0.5}>
          <Typography variant="body2" fontWeight={700} noWrap sx={{ minWidth: 0 }} title={estilo.estilo}>
            {estilo.estilo}
          </Typography>
          <Chip
            size="small"
            label={
              total
                ? 'Todos los estilos'
                : estilo.ultimaCaja
                  ? `Última lectura: ${estilo.ultimaCaja}`
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
          sx={{ color: estilo.libras > 0 ? '#164a8b' : 'text.secondary', lineHeight: 1.1 }}
        >
          {formatValue(estilo.libras)}
          <Typography component="span" variant="caption" color="text.secondary" ml={0.5}>
            lbs
          </Typography>
        </Typography>
      </CardContent>
    </Card>
  );
}

function OrdenesActivasCard({ ordenesActivas }: { ordenesActivas: number }) {
  const activo = ordenesActivas > 0;
  const color = activo ? '#2e7d32' : '#94a3b8';

  return (
    <Card
      sx={{
        borderTop: `3px solid ${color}`,
        bgcolor: activo ? 'rgba(46,125,50,0.03)' : 'background.paper',
        height: '100%',
      }}
    >
      <CardContent sx={{ py: 1.25, px: 1.75, '&:last-child': { pb: 1.25 } }}>
        <Stack direction="row" alignItems="center" spacing={0.5} mb={0.5}>
          <GroupsOutlinedIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
          <Typography variant="body2" fontWeight={700} noWrap>
            Órdenes activas
          </Typography>
        </Stack>
        <Typography
          variant="h6"
          fontWeight={800}
          sx={{ color: activo ? '#164a8b' : 'text.secondary', lineHeight: 1.1 }}
        >
          {ordenesActivas}
          <Typography component="span" variant="caption" color="text.secondary" ml={0.5}>
            en los últimos 15 min
          </Typography>
        </Typography>
      </CardContent>
    </Card>
  );
}

export default function PeladoLiveCounters() {
  const { data, isLoading, isError, error, dataUpdatedAt } = usePeladoLive();
  const totalPelado = data?.estilos.reduce((total, estilo) => total + estilo.libras, 0) ?? 0;

  return (
    <Box>
      <Stack direction="row" alignItems="center" spacing={0.75} mb={0.9} flexWrap="wrap" useFlexGap>
        <ContentCutOutlinedIcon color="primary" sx={{ fontSize: 16 }} />
        <Typography variant="subtitle2" fontWeight={800} sx={{ fontSize: 13 }}>
          Producción Pelado en Tiempo Real
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
          Error al cargar contadores de pelado: {error instanceof Error ? error.message : 'desconocido'}
        </Alert>
      )}

      {!isLoading && !isError && (data?.estilos.length ?? 0) === 0 && (
        <Alert severity="info" sx={{ py: 0.5 }}>
          Sin producción pelada registrada para el turno seleccionado.
        </Alert>
      )}

      {!isLoading && !isError && data && data.estilos.length > 0 && (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: {
              xs: 'repeat(2, minmax(0, 1fr))',
              sm: `repeat(${data.estilos.length + 2}, minmax(0, 1fr))`,
            },
            gap: 1,
            '& > :last-child:nth-of-type(odd)': { gridColumn: { xs: '1 / -1', sm: 'auto' } },
          }}
        >
          {data.estilos.map((estilo) => (
            <LiveCard key={estilo.estilo} estilo={estilo} />
          ))}
          <LiveCard
            total
            estilo={{
              estilo: 'Total Pelado',
              libras: totalPelado,
              ultimaCaja: '',
              minutosDesdeUltima: -1,
              activo: false,
            }}
          />
          <OrdenesActivasCard ordenesActivas={data.ordenesActivas} />
        </Box>
      )}
    </Box>
  );
}
