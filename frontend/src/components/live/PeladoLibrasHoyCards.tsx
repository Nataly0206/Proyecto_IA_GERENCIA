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
import { usePeladoLibrasHoy } from '../../hooks/useDashboardData';
import { formatPeriodo, formatValue } from '../../utils/format';
import { PeladoLibrasHoyEstilo } from '../../types';

function EstiloCard({ estilo, total = false }: { estilo: PeladoLibrasHoyEstilo; total?: boolean }) {
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
          {total && (
            <Chip
              size="small"
              label="Total del día"
              sx={{
                bgcolor: `${color}18`,
                color,
                fontWeight: 700,
                height: 18,
                '& .MuiChip-label': { px: 0.7, fontSize: 9.5 },
              }}
            />
          )}
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

export default function PeladoLibrasHoyCards() {
  const { data, isLoading, isError, error, dataUpdatedAt } = usePeladoLibrasHoy();

  return (
    <Box>
      <Stack direction="row" alignItems="center" spacing={0.75} mb={0.9} flexWrap="wrap" useFlexGap>
        <ContentCutOutlinedIcon color="primary" sx={{ fontSize: 16 }} />
        <Typography variant="subtitle2" fontWeight={800} sx={{ fontSize: 13 }}>
          Libras Peladas Hoy por Estilo
        </Typography>
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
          Error al cargar libras peladas: {error instanceof Error ? error.message : 'desconocido'}
        </Alert>
      )}

      {!isLoading && !isError && (data?.estilos.length ?? 0) === 0 && (
        <Alert severity="info" sx={{ py: 0.5 }}>
          Sin producción de pelado registrada hoy.
        </Alert>
      )}

      {!isLoading && !isError && data && data.estilos.length > 0 && (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: {
              xs: 'repeat(2, minmax(0, 1fr))',
              sm: `repeat(${Math.min(data.estilos.length + 1, 6)}, minmax(0, 1fr))`,
            },
            gap: 1,
            '& > :last-child:nth-of-type(odd)': { gridColumn: { xs: '1 / -1', sm: 'auto' } },
          }}
        >
          {data.estilos.map((estilo) => (
            <EstiloCard key={estilo.estilo} estilo={estilo} />
          ))}
          <EstiloCard total estilo={{ estilo: 'Total', libras: data.total }} />
        </Box>
      )}
    </Box>
  );
}
