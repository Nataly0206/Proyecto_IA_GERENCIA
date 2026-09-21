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

function EstiloCard({
  estilo,
  badge,
  decimal = false,
}: {
  estilo: PeladoLibrasHoyEstilo;
  badge?: string;
  decimal?: boolean;
}) {
  const destacado = Boolean(badge);
  const color = destacado ? '#164a8b' : estilo.libras > 0 ? '#2e7d32' : '#94a3b8';

  return (
    <Card
      sx={{
        borderTop: `3px solid ${color}`,
        bgcolor: destacado
          ? 'rgba(22,74,139,0.06)'
          : estilo.libras > 0
            ? 'rgba(46,125,50,0.03)'
            : 'background.paper',
        height: '100%',
        minWidth: 0,
      }}
    >
      <CardContent sx={{ py: { xs: 0.75, md: 1.25 }, px: { xs: 0.5, sm: 1, lg: 1.75 }, minWidth: 0, '&:last-child': { pb: { xs: 0.75, md: 1.25 } } }}>
        <Stack direction={{ xs: 'column', lg: 'row' }} justifyContent="space-between" alignItems={{ xs: 'flex-start', lg: 'center' }} mb={0.5} spacing={0.5}>
          <Typography variant="body2" fontWeight={700} sx={{ minWidth: 0, fontSize: { xs: 9, sm: 11, lg: 14 }, lineHeight: 1.15, overflowWrap: 'anywhere' }} title={estilo.estilo}>
            {estilo.estilo}
          </Typography>
          {!badge && <Typography variant="body2" fontWeight={700} sx={{ display: { xs: 'none', lg: 'block' }, flexBasis: '45%', flexShrink: 0 }}>lbs/h</Typography>}
          {badge && (
            <Chip
              size="small"
              label={badge}
              sx={{
                bgcolor: `${color}18`,
                color,
                fontWeight: 700,
                height: 18,
                maxWidth: '100%',
                display: { xs: 'none', sm: 'inline-flex' },
                '& .MuiChip-label': { px: 0.7, fontSize: 9.5 },
              }}
            />
          )}
        </Stack>

        <Box sx={{ display: 'grid', gridTemplateColumns: badge ? '1fr' : { xs: '1fr', lg: 'minmax(0, 1fr) minmax(0, .82fr)' }, alignItems: 'baseline', gap: { xs: 0.25, lg: 1 } }}>
          <Typography variant="h6" fontWeight={800}
            sx={{ color: estilo.libras > 0 ? '#164a8b' : 'text.secondary', lineHeight: 1.1, fontSize: { xs: 10, sm: 13, lg: 20 }, overflowWrap: 'anywhere' }}>
            {formatValue(estilo.libras, decimal ? 'decimal' : 'number')}
            <Typography component="span" variant="caption" color="text.secondary" sx={{ display: { xs: 'block', lg: 'inline' }, ml: { lg: 0.5 }, fontSize: { xs: 8, sm: 10, lg: 12 } }}>
              {decimal ? 'lbs/h' : 'lbs'}
            </Typography>
          </Typography>
          {!badge && <Box sx={{ minWidth: 0 }}>
            <Typography variant="caption" fontWeight={700} sx={{ display: { xs: 'block', lg: 'none' }, fontSize: { xs: 8, sm: 10 } }}>lbs/h</Typography>
            <Typography variant="h6" fontWeight={800}
              sx={{ color: (estilo.librasPorHora ?? 0) > 0 ? '#164a8b' : 'text.secondary', lineHeight: 1.1, fontSize: { xs: 10, sm: 13, lg: 20 }, overflowWrap: 'anywhere' }}>
              {formatValue(estilo.librasPorHora ?? 0, 'decimal')}
            </Typography>
          </Box>}
        </Box>
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
            gridTemplateColumns: `repeat(${data.estilos.length + 2}, minmax(0, 1fr))`,
            gap: { xs: 0.35, sm: 1 },
          }}
        >
          {data.estilos.map((estilo) => (
            <EstiloCard key={estilo.estilo} estilo={estilo} />
          ))}
          <EstiloCard badge="Total del día" estilo={{ estilo: 'Total', libras: data.total, librasPorHora: data.librasPorHoraPromedio }} />
          <EstiloCard
            badge="Promedio del día"
            decimal
            estilo={{ estilo: 'lbs/h promedio', libras: data.librasPorHoraPromedio, librasPorHora: data.librasPorHoraPromedio }}
          />
        </Box>
      )}
    </Box>
  );
}
