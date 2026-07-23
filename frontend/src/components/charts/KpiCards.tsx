import { useMemo } from 'react';
import { Box, LinearProgress, Typography } from '@mui/material';
import { ChartConfig, DataRow } from '../../types';
import { formatValue } from '../../utils/format';
import { CHART_COLORS } from '../../theme';

interface KpiCardsProps {
  config: ChartConfig;
  data: DataRow[];
}

function applySort(data: DataRow[], sort?: ChartConfig['sort']): DataRow[] {
  if (!sort) return data;
  const dir = sort.direction === 'asc' ? 1 : -1;
  return [...data].sort((a, b) => (Number(a[sort.field] ?? 0) - Number(b[sort.field] ?? 0)) * dir);
}

export default function KpiCards({ config, data }: KpiCardsProps) {
  const rows = useMemo(() => applySort(data, config.sort), [data, config.sort]);
  const yField = Array.isArray(config.yField) ? config.yField[0] : config.yField;
  const format = config.valueFormat ?? 'number';
  const colors = config.colors ?? CHART_COLORS;

  // En escritorio todos los procesos ocupan una sola fila. En anchos
  // menores se conserva la fila y se permite desplazamiento horizontal
  // para que las tarjetas no pierdan legibilidad.
  const cols = Math.max(rows.length, 1);

  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: {
          xs: `repeat(${cols}, minmax(150px, 1fr))`,
          lg: `repeat(${cols}, minmax(0, 1fr))`,
        },
        gap: 1,
        pt: 0.25,
        pb: 0.25,
        overflowX: 'auto',
        scrollbarWidth: 'thin',
      }}
    >
      {rows.map((row, index) => {
        const label = String(row[config.xField] ?? '');
        const value = Number(row[yField] ?? 0);
        const porcentaje = typeof row.porcentaje === 'number' ? (row.porcentaje as number) : null;
        const color = colors[index % colors.length];

        return (
          <Box
            key={`${label}-${index}`}
            sx={{
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
              minWidth: 0,
              px: { xs: 1.25, xl: 1.5 },
              py: 1,
              borderRadius: 1.5,
              bgcolor: 'background.paper',
              border: '1px solid',
              borderColor: 'divider',
              borderTop: `3px solid ${color}`,
              transition: 'box-shadow 0.15s ease',
              '&:hover': {
                boxShadow: '0 6px 20px rgba(17,24,39,0.10)',
              },
            }}
          >
            <Typography
              variant="caption"
              fontWeight={700}
              sx={{
                color: 'text.secondary',
                textTransform: 'uppercase',
                letterSpacing: 0.35,
                fontSize: 10.5,
                lineHeight: 1.2,
                mb: 0.65,
                display: 'block',
              }}
              noWrap
              title={label}
            >
              {label}
            </Typography>

            <Typography
              sx={{
                fontSize: { xs: '1.15rem', xl: '1.3rem' },
                fontWeight: 800,
                color: 'text.primary',
                lineHeight: 1,
              }}
            >
              {formatValue(value, format)}
            </Typography>
            <Typography
              variant="caption"
              sx={{
                color: 'text.secondary',
                mt: 0.2,
                display: 'block',
                fontSize: 10.5,
                fontWeight: 500,
              }}
            >
              lbs netas
            </Typography>

            {porcentaje !== null && (
              <Box mt={0.75}>
                <LinearProgress
                  variant="determinate"
                  value={porcentaje}
                  sx={{
                    height: 4,
                    borderRadius: 3,
                    bgcolor: `${color}20`,
                    mb: 0.25,
                    '& .MuiLinearProgress-bar': { bgcolor: color, borderRadius: 3 },
                  }}
                />
                <Typography
                  variant="caption"
                  fontWeight={700}
                  sx={{ color, fontSize: 10.5, lineHeight: 1.2 }}
                >
                  {porcentaje.toFixed(1)}% del total
                </Typography>
              </Box>
            )}
          </Box>
        );
      })}
    </Box>
  );
}
