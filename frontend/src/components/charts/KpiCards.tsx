import { useMemo } from 'react';
import { Box, LinearProgress, Stack, Typography } from '@mui/material';
import { ChartConfig, DataRow } from '../../types';
import { formatValue } from '../../utils/format';
import { CHART_COLORS } from '../../theme';
import { categoryColor } from '../../utils/categoryColors';

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
  const yField = Array.isArray(config.yField) ? config.yField[0] : config.yField;
  const rateField = config.rateField;
  const rows = useMemo(() => {
    const sortedRows = applySort(data, config.sort);
    if (!config.showTotalCard) return sortedRows;

    const total = sortedRows.reduce((sum, row) => {
      const value = Number(row[yField] ?? 0);
      return sum + (Number.isFinite(value) ? value : 0);
    }, 0);

    const totalRow: DataRow = {
      [config.xField]: 'TOTAL',
      [yField]: total,
      __isTotalCard: true,
    };

    if (rateField) {
      if (config.rateWeightField) {
        const totalWeight = sortedRows.reduce((sum, row) => sum + Number(row[config.rateWeightField!] ?? 0), 0);
        totalRow[rateField] = totalWeight > 0 ? total / totalWeight : 0;
      } else {
        const rates = sortedRows.map((row) => Number(row[rateField] ?? 0)).filter((v) => Number.isFinite(v));
        totalRow[rateField] = rates.length > 0 ? rates.reduce((sum, v) => sum + v, 0) / rates.length : 0;
      }
    }

    return [...sortedRows, totalRow];
  }, [data, config.sort, config.showTotalCard, config.xField, yField, rateField, config.rateWeightField]);
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
          xs: 'repeat(2, minmax(0, 1fr))',
          sm: `repeat(${Math.min(cols, 3)}, minmax(0, 1fr))`,
          lg: `repeat(${cols}, minmax(0, 1fr))`,
        },
        gap: 1,
        pt: 0.25,
        pb: 0.25,
        overflow: 'visible',
      }}
    >
      {rows.map((row, index) => {
        const label = String(row[config.xField] ?? '');
        const value = Number(row[yField] ?? 0);
        const porcentaje = typeof row.porcentaje === 'number' ? (row.porcentaje as number) : null;
        const isTotal = row.__isTotalCard === true;
        const color = isTotal ? '#164a8b' : config.colorByLabel ? categoryColor(label, colors) : colors[index % colors.length];
        const rateValue = rateField ? Number(row[rateField] ?? 0) : null;

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
              border: '1px solid',
              borderColor: isTotal ? 'primary.main' : 'divider',
              borderTop: `3px solid ${color}`,
              bgcolor: isTotal ? 'rgba(22, 74, 139, 0.06)' : 'background.paper',
              transition: 'box-shadow 0.15s ease',
              minHeight: { xs: 118, sm: 104 },
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

            {rateValue !== null ? (
              <Stack direction="row" justifyContent="space-between" alignItems="baseline" spacing={1}>
                <Typography
                  sx={{
                    fontSize: { xs: '1.05rem', xl: '1.2rem' },
                    fontWeight: 800,
                    color: 'text.primary',
                    lineHeight: 1,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {formatValue(value, format)}
                  <Typography component="span" variant="caption" color="text.secondary" ml={0.4}>
                    {config.unitLabel ?? 'lbs'}
                  </Typography>
                </Typography>
                <Typography
                  sx={{
                    fontSize: { xs: 14, xl: 15 },
                    fontWeight: 900,
                    color: '#000',
                    lineHeight: 1.25,
                    whiteSpace: 'nowrap',
                  }}
                >
                  {formatValue(rateValue, 'decimal')} {config.rateUnit ?? 'lbs/h'}
                </Typography>
              </Stack>
            ) : (
              <>
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
                  {isTotal ? `${config.unitLabel ?? 'lbs netas'} en total` : config.unitLabel ?? 'lbs netas'}
                </Typography>
              </>
            )}

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
