import { useMemo, useState } from 'react';
import {
  Alert,
  Box,
  Card,
  CardContent,
  CircularProgress,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  ToggleButton,
  ToggleButtonGroup,
  Tooltip,
  Typography,
} from '@mui/material';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import { useWidgetData } from '../../hooks/useDashboardData';
import { formatPeriodo, formatValue } from '../../utils/format';
import { DashboardEndpoint, PeladoPersonalPeriodRow, PeladoPersonalRow } from '../../types';

interface PeladoPersonalWidgetProps {
  height?: number;
}

type Granularidad = 'total' | 'dia' | 'mes';

const TITLE = 'Personal de Pelado';
const SUBTITLE = 'Empleados, libras y pago reales (fuente: STB_data)';
const HEADER_SX = { fontWeight: 800, bgcolor: '#f1f5f9', color: '#172033' } as const;

const ENDPOINT_BY_GRANULARIDAD: Record<Granularidad, DashboardEndpoint> = {
  total: 'pelado-personal',
  dia: 'pelado-personal-dia',
  mes: 'pelado-personal-mes',
};

function StatTile({
  icon,
  label,
  value,
  suffix,
  color,
}: {
  icon?: React.ReactNode;
  label: string;
  value: string;
  suffix: string;
  color: string;
}) {
  return (
    <Card sx={{ borderTop: `3px solid ${color}`, height: '100%' }}>
      <CardContent sx={{ py: 1.25, px: 1.75, '&:last-child': { pb: 1.25 } }}>
        <Stack direction="row" alignItems="center" spacing={0.5} mb={0.5}>
          {icon}
          <Typography variant="body2" fontWeight={700} noWrap>
            {label}
          </Typography>
        </Stack>
        <Typography variant="h6" fontWeight={800} sx={{ color, lineHeight: 1.1 }}>
          {value}
          <Typography component="span" variant="caption" color="text.secondary" ml={0.5}>
            {suffix}
          </Typography>
        </Typography>
      </CardContent>
    </Card>
  );
}

function TotalView({ data }: { data: PeladoPersonalRow[] }) {
  const row = data[0];
  if (!row) {
    return (
      <Alert severity="info" sx={{ mt: 2 }}>
        Sin datos de personal para el rango seleccionado.
      </Alert>
    );
  }
  return (
    <Box
      sx={{
        display: 'grid',
        gridTemplateColumns: { xs: 'repeat(1, 1fr)', sm: 'repeat(3, 1fr)' },
        gap: 1,
        mt: 0.5,
      }}
    >
      <StatTile
        icon={<GroupsOutlinedIcon sx={{ fontSize: 16, color: 'text.secondary' }} />}
        label="Empleados"
        value={formatValue(row.empleados)}
        suffix="personas distintas"
        color="#164a8b"
      />
      <StatTile
        label="Libras Procesadas"
        value={formatValue(row.libras)}
        suffix="lbs"
        color="#2e7d32"
      />
      <StatTile
        label="Pago Total"
        value={formatValue(row.valor, 'currency')}
        suffix=""
        color="#b45309"
      />
    </Box>
  );
}

function PeriodTable({ data, xLabel, height }: { data: PeladoPersonalPeriodRow[]; xLabel: string; height?: number }) {
  return (
    <>
      <TableContainer sx={{ maxHeight: height ?? 340, mt: 0.5, borderRadius: 1, border: '1px solid rgba(148, 163, 184, 0.18)' }}>
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell sx={HEADER_SX}>{xLabel}</TableCell>
              <TableCell align="right" sx={HEADER_SX}>Empleados</TableCell>
              <TableCell align="right" sx={HEADER_SX}>Libras</TableCell>
              <TableCell align="right" sx={HEADER_SX}>Pago</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {data.map((row) => (
              <TableRow key={row.periodo} hover>
                <TableCell sx={{ fontWeight: 600 }}>{formatPeriodo(row.periodo)}</TableCell>
                <TableCell align="right">{formatValue(row.empleados)}</TableCell>
                <TableCell align="right">{formatValue(row.libras)}</TableCell>
                <TableCell align="right">{formatValue(row.valor, 'currency')}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
      <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.5 }}>
        Empleados = personas distintas en cada período (no es sumable entre filas).
      </Typography>
    </>
  );
}

/**
 * Widget de personal de pelado con selector Total / Día / Mensual, mismo
 * patrón que <PeladoStyleWidget />. A diferencia de los reportes por
 * estilo/línea (categóricos), este trae 3 métricas por período sin
 * categoría que pivotear, así que se renderiza a mano (tarjetas KPI en
 * "Total", tabla plana en "Día"/"Mensual") en vez de vía ChartWidget.
 */
export default function PeladoPersonalWidget({ height }: PeladoPersonalWidgetProps) {
  const [granularidad, setGranularidad] = useState<Granularidad>('total');
  const endpoint = ENDPOINT_BY_GRANULARIDAD[granularidad];
  const { data, isLoading, isError, error } = useWidgetData(endpoint);

  const subtitle = useMemo(() => {
    if (granularidad === 'dia') return `${SUBTITLE} — por día`;
    if (granularidad === 'mes') return `${SUBTITLE} — últimos 12 meses`;
    return SUBTITLE;
  }, [granularidad]);

  return (
    <Card sx={{ height: granularidad === 'total' ? 'auto' : { xs: 'auto', md: '100%' }, minHeight: 0 }}>
      <CardContent sx={{ display: 'flex', flexDirection: 'column', p: '14px !important' }}>
        <Stack direction={{ xs: 'column', sm: 'row' }} justifyContent="space-between" alignItems={{ xs: 'stretch', sm: 'center' }} spacing={{ xs: 1, sm: 1.5 }} mb={1}>
          <Box sx={{ minWidth: 0 }}>
            <Typography variant="subtitle2" fontWeight={800} lineHeight={1.2} sx={{ whiteSpace: { sm: 'nowrap' }, fontSize: { xs: 15, sm: 14 } }}>
              {TITLE}
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.3 }}>
              {subtitle}
            </Typography>
          </Box>
          <ToggleButtonGroup
            size="small"
            exclusive
            value={granularidad}
            onChange={(_e, next: Granularidad | null) => next && setGranularidad(next)}
            sx={{ '& .MuiToggleButton-root': { px: 1.25, py: 0.5, fontSize: 11, fontWeight: 700, lineHeight: 1 } }}
          >
            <ToggleButton value="total" aria-label="Vista total">
              <Tooltip title="Total del rango filtrado">
                <span>Total</span>
              </Tooltip>
            </ToggleButton>
            <ToggleButton value="dia" aria-label="Vista diaria">
              <Tooltip title="Por día">
                <span>Día</span>
              </Tooltip>
            </ToggleButton>
            <ToggleButton value="mes" aria-label="Vista mensual">
              <Tooltip title="Últimos 12 meses">
                <span>Mensual</span>
              </Tooltip>
            </ToggleButton>
          </ToggleButtonGroup>
        </Stack>

        {isLoading && (
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: height ?? 200 }}>
            <CircularProgress size={32} />
          </Box>
        )}

        {isError && (
          <Alert severity="error" sx={{ mt: 2 }}>
            Error al cargar personal de pelado: {error instanceof Error ? error.message : 'desconocido'}
          </Alert>
        )}

        {!isLoading && !isError && data && granularidad === 'total' && (
          <TotalView data={data as PeladoPersonalRow[]} />
        )}

        {!isLoading && !isError && data && granularidad !== 'total' && (
          (data as PeladoPersonalPeriodRow[]).length === 0 ? (
            <Alert severity="info" sx={{ mt: 2 }}>
              Sin datos para los filtros seleccionados.
            </Alert>
          ) : (
            <PeriodTable
              data={data as PeladoPersonalPeriodRow[]}
              xLabel={granularidad === 'dia' ? 'Fecha' : 'Mes'}
              height={height}
            />
          )
        )}
      </CardContent>
    </Card>
  );
}
