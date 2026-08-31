import { ReactNode } from 'react';
import { Alert, Box, Card, CardContent, Chip, Skeleton, Stack, Typography } from '@mui/material';
import { ValueFormat } from '../../types';
import { formatValue } from '../../utils/format';

export interface ResumenMetric {
  label: string;
  value: number;
  format?: ValueFormat;
  /** Texto bajo el valor (ej. "lbs", "contenedores"). */
  unit?: string;
  /** Color de acento: neutro, alerta (naranja) o positivo (verde). */
  tone?: 'default' | 'warn' | 'good';
}

const TONE_COLOR: Record<NonNullable<ResumenMetric['tone']>, string> = {
  default: '#164a8b',
  warn: '#b45309',
  good: '#2e7d32',
};

interface ResumenCardsProps {
  title: string;
  icon: ReactNode;
  metrics: ResumenMetric[];
  isLoading: boolean;
  isError: boolean;
  errorText?: string;
  /** Etiqueta de período mostrada junto al título (día o semana). */
  periodoLabel?: string;
  updatedAt?: number;
  liveBadge?: boolean;
  emptyText?: string;
}

/**
 * Fila de tarjetas-indicador "en vivo" para los módulos de proceso.
 * Mismo diseño que los contadores de IQF / Pelado (borde superior de
 * color, valor grande, chip de estado).
 */
export default function ResumenCards({
  title,
  icon,
  metrics,
  isLoading,
  isError,
  errorText,
  periodoLabel,
  updatedAt,
  liveBadge = true,
  emptyText = 'Sin datos para hoy.',
}: ResumenCardsProps) {
  const allZero = metrics.length > 0 && metrics.every((m) => !m.value);

  return (
    <Box>
      <Stack direction="row" alignItems="center" spacing={0.75} mb={0.9} flexWrap="wrap" useFlexGap>
        {icon}
        <Typography variant="subtitle2" fontWeight={800} sx={{ fontSize: 13 }}>
          {title}
        </Typography>
        {liveBadge && (
          <Chip
            size="small"
            label="EN VIVO"
            color="success"
            variant="outlined"
            sx={{ fontWeight: 700, height: 18, '& .MuiChip-label': { fontSize: 9.5, px: 0.75 } }}
          />
        )}
        {periodoLabel && (
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ fontSize: 11, flexBasis: { xs: '100%', sm: 'auto' }, pl: { xs: 2.75, sm: 0 } }}
          >
            {periodoLabel}
            {updatedAt ? ` · actualizado ${new Date(updatedAt).toLocaleTimeString()}` : ''}
          </Typography>
        )}
      </Stack>

      {isLoading && (
        <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 1 }}>
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} variant="rounded" height={72} />
          ))}
        </Box>
      )}

      {isError && (
        <Alert severity="error" sx={{ py: 0.5 }}>
          Error al cargar indicadores: {errorText ?? 'desconocido'}
        </Alert>
      )}

      {!isLoading && !isError && allZero && (
        <Alert severity="info" sx={{ py: 0.5 }}>
          {emptyText}
        </Alert>
      )}

      {!isLoading && !isError && !allZero && (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: {
              xs: 'repeat(2, minmax(0, 1fr))',
              sm: `repeat(${Math.min(metrics.length, 4)}, minmax(0, 1fr))`,
              lg: `repeat(${metrics.length}, minmax(0, 1fr))`,
            },
            gap: 1,
          }}
        >
          {metrics.map((m) => {
            const color = TONE_COLOR[m.tone ?? 'default'];
            return (
              <Card key={m.label} sx={{ borderTop: `3px solid ${color}`, height: '100%' }}>
                <CardContent sx={{ py: 1.25, px: 1.75, '&:last-child': { pb: 1.25 } }}>
                  <Typography
                    variant="caption"
                    fontWeight={700}
                    noWrap
                    title={m.label}
                    sx={{
                      color: 'text.secondary',
                      textTransform: 'uppercase',
                      letterSpacing: 0.35,
                      fontSize: 10.5,
                      display: 'block',
                      mb: 0.5,
                    }}
                  >
                    {m.label}
                  </Typography>
                  <Typography variant="h6" fontWeight={800} sx={{ color, lineHeight: 1.1 }}>
                    {formatValue(m.value, m.format ?? 'number')}
                    {m.unit && (
                      <Typography component="span" variant="caption" color="text.secondary" ml={0.5}>
                        {m.unit}
                      </Typography>
                    )}
                  </Typography>
                </CardContent>
              </Card>
            );
          })}
        </Box>
      )}
    </Box>
  );
}
