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
import { usePeladoLibrasHoy, usePeladoLibrasHoyTalla, usePeladoPorSala } from '../../hooks/useDashboardData';
import { formatPeriodo, formatValue } from '../../utils/format';
import { PeladoLibrasHoyEstilo } from '../../types';
import { getPeladoSizeLeaders } from '../../utils/peladoTallas';

function EstiloCard({
  estilo,
  badge,
  librasPorPersona,
  librasTotalesPorHora,
  tallaDominante,
  tallaSiguiente,
}: {
  estilo: PeladoLibrasHoyEstilo;
  badge?: string;
  librasPorPersona?: number | null;
  librasTotalesPorHora?: number | null;
  tallaDominante?: string | null;
  tallaSiguiente?: string | null;
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
        ...(destacado && { containerType: 'inline-size' }),
      }}
    >
      <CardContent sx={{ py: destacado ? 0.875 : 1.25, px: destacado ? 1.25 : 1.75, minWidth: 0, '&:last-child': { pb: destacado ? 0.875 : 1.25 } }}>
        <Stack direction="row" justifyContent="space-between" alignItems="flex-start" mb={destacado ? 0.25 : 0.5} spacing={0.5}>
          <Typography variant="body2" fontWeight={700} noWrap sx={{ minWidth: 0, ...(destacado && { fontSize: 13 }) }} title={estilo.estilo}>
            {estilo.estilo}
          </Typography>
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

        <Stack
          direction={destacado ? 'column' : { xs: 'column', sm: 'row' }}
          justifyContent="space-between"
          alignItems={destacado ? 'stretch' : { xs: 'flex-start', sm: 'baseline' }}
          useFlexGap
          sx={{ gap: destacado ? 0.375 : { xs: 0.75, sm: 1 }, flexWrap: 'wrap' }}
        >
          <Stack direction="row" alignItems="baseline" justifyContent={destacado ? 'space-between' : undefined}
            useFlexGap sx={{ gap: 1, flexWrap: destacado ? 'nowrap' : 'wrap', ...(destacado && { width: '100%' }) }}>
            <Typography
              variant="h6"
              fontWeight={800}
              sx={{
                color: estilo.libras > 0 ? '#164a8b' : 'text.secondary',
                lineHeight: 1.1,
                whiteSpace: 'nowrap',
                ...(destacado && { fontSize: 18, letterSpacing: '-0.2px' }),
              }}
            >
              {formatValue(estilo.libras)}
              <Typography component="span" variant="caption" color="text.secondary" ml={0.5}>
                lbs
              </Typography>
            </Typography>
            {destacado && (
              <Typography variant="body2" title="Promedio acumulado: libras del día / horas transcurridas desde el inicio del pelado"
                sx={{ fontSize: { xs: 13, sm: 14 }, fontWeight: 800, color: '#000', lineHeight: 1.15, letterSpacing: '-0.2px', whiteSpace: 'nowrap' }}>
                {formatValue(estilo.librasPorHora ?? 0)} Lbs/h
              </Typography>
            )}
          </Stack>
          <Stack alignItems={{ xs: 'flex-start', sm: 'flex-end' }} spacing={destacado ? 0.125 : 0.25} sx={{
            minWidth: 0,
            maxWidth: '100%',
            color: '#000',
            fontSize: destacado ? { xs: 13, sm: 14 } : { xs: 15, sm: 16 },
            fontWeight: destacado ? 800 : 900,
            lineHeight: destacado ? 1.15 : 1.25,
            ...(destacado && { letterSpacing: '-0.2px' }),
            whiteSpace: 'nowrap',
          }}>
            {!destacado && <Typography variant="body2" title="Promedio acumulado: libras del día / horas transcurridas desde el inicio del pelado"
              sx={{ fontSize: 'inherit', fontWeight: 'inherit', lineHeight: 'inherit', letterSpacing: 'inherit' }}>
              {formatValue(estilo.librasPorHora ?? 0)} Lbs/h
            </Typography>}
            {librasPorPersona !== undefined && (
              <Stack direction="row" useFlexGap sx={{ gap: 0.75, flexWrap: 'wrap', justifyContent: { xs: 'flex-start', sm: 'flex-end' }, maxWidth: '100%' }}>
                <Typography variant="body2" sx={{ fontSize: 'inherit', fontWeight: 'inherit', lineHeight: 'inherit', letterSpacing: 'inherit' }}>
                  {librasPorPersona === null ? '—' : formatValue(librasPorPersona, 'decimal')} lbs/pers/h
                </Typography>
                {librasTotalesPorHora !== undefined && (
                  <Typography variant="body2" title="Ritmo reciente de todo el equipo: libras registradas durante los últimos 60 minutos"
                    sx={{ fontSize: 'inherit', fontWeight: 'inherit', lineHeight: 'inherit', letterSpacing: 'inherit' }}>
                    {librasTotalesPorHora === null ? '—' : formatValue(librasTotalesPorHora)} Lbs Totales/h
                  </Typography>
                )}
              </Stack>
            )}
            {tallaDominante !== undefined && (
              <Stack direction="row" useFlexGap sx={{ gap: 0.75, flexWrap: 'nowrap', justifyContent: 'flex-end', maxWidth: '100%',
                fontSize: destacado ? 'clamp(9px, 2.8cqw, 14px)' : 'inherit', overflowX: 'auto' }}>
                <Typography variant="body2" title="Talla con más libras producidas hoy y su porcentaje del total por talla"
                  sx={{ fontSize: 'inherit', fontWeight: 'inherit', lineHeight: 'inherit', letterSpacing: 'inherit', whiteSpace: 'nowrap', flexShrink: 0 }}>
                  Talla Prom: {tallaDominante ?? '—'}
                </Typography>
                <Typography variant="body2" title="Segunda talla con más libras producidas hoy y su porcentaje del total por talla"
                  sx={{ fontSize: 'inherit', fontWeight: 'inherit', lineHeight: 'inherit', letterSpacing: 'inherit', whiteSpace: 'nowrap', flexShrink: 0 }}>
                  Talla Sig: {tallaSiguiente ?? '—'}
                </Typography>
              </Stack>
            )}
          </Stack>
        </Stack>
      </CardContent>
    </Card>
  );
}

export default function PeladoLibrasHoyCards() {
  const { data, isLoading, isError, error, dataUpdatedAt } = usePeladoLibrasHoy();
  const { data: actividad, isError: actividadError } = usePeladoPorSala();
  const { data: produccionTallas, isError: tallasError } = usePeladoLibrasHoyTalla(true);
  const tallas = getPeladoSizeLeaders(!tallasError && produccionTallas && produccionTallas.dia === data?.dia ? produccionTallas.tallas : []);
  const tallaDominante = tallas.principal;
  const tallaSiguiente = tallas.siguiente;
  const personasActivas = actividad?.salas.reduce((total, sala) => total + sala.personasActivas, 0) ?? 0;
  const librasPorPersona = !actividadError && actividad && actividad.dia === data?.dia && personasActivas > 0
    ? (data.librasPorHoraPromedio ?? 0) / personasActivas
    : null;
  const librasTotalesPorHora = data?.ritmoUltimaHora?.libras ?? null;
  const estilosConLibras = data?.estilos.filter((estilo) => estilo.libras > 0) ?? [];

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
        <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', sm: 'repeat(4, minmax(0, 1fr))' }, gap: 1 }}>
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

      {!isLoading && !isError && estilosConLibras.length === 0 && (
        <Alert severity="info" sx={{ py: 0.5 }}>
          Sin producción de pelado registrada hoy.
        </Alert>
      )}

      {!isLoading && !isError && data && estilosConLibras.length > 0 && (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: {
              xs: 'repeat(2, minmax(0, 1fr))',
              sm: `repeat(${Math.min(estilosConLibras.length + 1, 4)}, minmax(0, 1fr))`,
              lg: `repeat(${estilosConLibras.length + 1}, minmax(0, 1fr))`,
            },
            gap: 1,
            '& > :last-child:nth-of-type(odd)': { gridColumn: { xs: '1 / -1', sm: 'auto' } },
          }}
        >
          {estilosConLibras.map((estilo) => (
            <EstiloCard key={estilo.estilo} estilo={estilo} />
          ))}
          <EstiloCard badge="Total del día" tallaDominante={tallaDominante} tallaSiguiente={tallaSiguiente} librasPorPersona={librasPorPersona} librasTotalesPorHora={librasTotalesPorHora} estilo={{ estilo: 'Total', libras: data.total, librasPorHora: data.librasPorHoraPromedio }} />
        </Box>
      )}
    </Box>
  );
}
