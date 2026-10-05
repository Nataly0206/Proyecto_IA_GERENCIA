import { useState } from 'react';
import dayjs from 'dayjs';
import {
  Alert,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Box,
  Card,
  CardContent,
  Chip,
  Skeleton,
  Stack,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tabs,
  Tab,
} from '@mui/material';
import BoltOutlinedIcon from '@mui/icons-material/BoltOutlined';
import { useIqfLive } from '../../hooks/useDashboardData';
import { formatPeriodo, formatValue } from '../../utils/format';
import { IqfLiveLine } from '../../types';
import IqfShiftWeekTable from './IqfShiftWeekTable';
import { compareIqfShifts, iqfShiftMetrics } from '../../utils/iqfShiftComparison';

function LiveCard({ linea, total = false, sumatoriaLibrasPorHora }: { linea: IqfLiveLine; total?: boolean; sumatoriaLibrasPorHora?: number }) {
  const color = total ? '#164a8b' : linea.libras > 0 ? '#2e7d32' : '#94a3b8';
  const displayName = total
    ? linea.linea
    : linea.linea.replace(/^(IQF\s*#\s*\d+).*$/i, '$1');

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
      <CardContent sx={{ py: 0.75, px: 1.75, '&:last-child': { pb: 0.75 } }}>
        <Stack direction="row" justifyContent="space-between" alignItems="flex-start" mb={0.25} spacing={0.5}>
          <Typography variant="body2" fontWeight={700} noWrap sx={{ minWidth: 0 }} title={linea.linea}>
            {displayName}
          </Typography>
          <Stack alignItems="flex-end" spacing={0.25} sx={{ minWidth: 0 }}>
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
        </Stack>

        <Stack direction="row" justifyContent="space-between" alignItems="baseline" spacing={total ? 1 : 2} sx={{ flexWrap: total ? 'wrap' : 'nowrap', rowGap: 0.5 }}>
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
          <Typography
            variant="body2"
            sx={{
              color: '#000',
              fontSize: { xs: 15, sm: 16 },
              fontWeight: 900,
              lineHeight: 1.25,
              whiteSpace: 'nowrap',
            }}
          >
            {formatValue(linea.librasPorHora)} lbs/h
          </Typography>
        </Stack>
        {total && sumatoriaLibrasPorHora !== undefined && (
          <Stack direction="row" alignItems="baseline" spacing={0.5} sx={{ mt: 0.25, whiteSpace: 'nowrap' }}>
            <Typography variant="caption" color="text.secondary" sx={{ lineHeight: 1.2 }}>Sumatoria IQFs</Typography>
            <Typography variant="body2" fontWeight={700} sx={{ color, lineHeight: 1.2 }}>
              {formatValue(sumatoriaLibrasPorHora)} <Typography component="span" variant="caption" color="text.secondary">lbs/h</Typography>
            </Typography>
          </Stack>
        )}
      </CardContent>
    </Card>
  );
}

export default function IqfLiveCounters() {
  const { data, isLoading, isError, error, dataUpdatedAt } = useIqfLive();
  const [turnosOpen, setTurnosOpen] = useState(false);
  const [turnosPeriodo, setTurnosPeriodo] = useState<'dia' | 'semana'>('dia');
  const comparacion = compareIqfShifts(data?.turnos ?? []);
  const isToday = data?.dia === dayjs().format('YYYY-MM-DD');
  const lineasIqf = data ? [1, 2, 3].flatMap((number) => {
    const matches = data.lineas.filter((linea) =>
      new RegExp(`\\bIQF\\s*[-#]?\\s*${number}\\b`, 'i').test(linea.linea));
    const canonical = matches.find((linea) => linea.linea.includes('(')) ?? matches[0];
    return canonical ? [canonical] : [];
  }) : [];
  const totalIqf = lineasIqf.reduce((total, linea) => total + linea.libras, 0);
  const promedioLibrasPorHora = lineasIqf.length > 0
    ? lineasIqf.reduce((total, linea) => total + linea.librasPorHora, 0) / lineasIqf.length
    : 0;

  return (
    <Box>
      <Stack direction="row" alignItems="center" spacing={0.75} mb={0.9} flexWrap="wrap" useFlexGap>
        <BoltOutlinedIcon color="primary" sx={{ fontSize: 16 }} />
        <Typography variant="subtitle2" fontWeight={800} sx={{ fontSize: 13 }}>
          Producción IQF {isToday || !data ? 'en Tiempo Real' : 'del día seleccionado'}
        </Typography>
        <Chip
          size="small"
          label={isToday || !data ? 'EN VIVO' : 'HISTÓRICO'}
          color="success"
          variant="outlined"
          sx={{ fontWeight: 700, height: 18, '& .MuiChip-label': { fontSize: 9.5, px: 0.75 } }}
        />
        {data && data.dia !== '' && (
          <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11, flexBasis: { xs: '100%', sm: 'auto' }, pl: { xs: 2.75, sm: 0 } }}>
            {formatPeriodo(data.dia)} · actualizado {new Date(dataUpdatedAt).toLocaleTimeString()}
          </Typography>
        )}
        <Button size="small" variant="outlined" onClick={() => { setTurnosPeriodo('dia'); setTurnosOpen(true); }} sx={{ ml: { sm: 'auto' }, textTransform: 'none', fontWeight: 700 }}>
          Ver por Turnos
        </Button>
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
          Error al cargar contadores IQF: {error instanceof Error ? error.message : 'desconocido'}
        </Alert>
      )}

      {!isLoading && !isError && lineasIqf.length === 0 && (
        <Alert severity="info" sx={{ py: 0.5 }}>
          Sin producción IQF registrada para el turno seleccionado.
        </Alert>
      )}

      {!isLoading && !isError && data && lineasIqf.length > 0 && (
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: {
              xs: 'repeat(2, minmax(0, 1fr))',
              sm: `repeat(${lineasIqf.length + 1}, minmax(0, 1fr))`,
            },
            gap: 1,
            '& > :last-child:nth-of-type(odd)': { gridColumn: { xs: '1 / -1', sm: 'auto' } },
          }}
        >
          {lineasIqf.map((linea) => (
            <LiveCard key={linea.linea} linea={linea} />
          ))}
          <LiveCard
            total
            sumatoriaLibrasPorHora={lineasIqf.reduce((total, linea) => total + linea.librasPorHora, 0)}
            linea={{
              linea: 'Total IQF',
              libras: totalIqf,
              cajas: 0,
              librasUltimaHora: 0,
              librasPorHora: promedioLibrasPorHora,
              primeraCaja: '',
              ultimaCaja: '',
              minutosDesdeUltima: -1,
              activa: false,
            }}
          />
        </Box>
      )}
      <Dialog open={turnosOpen} onClose={() => setTurnosOpen(false)} fullWidth maxWidth={turnosPeriodo === 'semana' ? 'lg' : 'md'} aria-labelledby="iqf-turnos-title" PaperProps={{ sx: { m: { xs: 1, sm: 4 }, width: { xs: 'calc(100% - 16px)', sm: 'calc(100% - 64px)' } } }}>
        <DialogTitle id="iqf-turnos-title">Comparación IQF por turnos{data ? ` · ${formatPeriodo(data.dia)}` : ''}</DialogTitle>
        <DialogContent dividers sx={{ px: { xs: 1, sm: 3 } }}>
          <Tabs value={turnosPeriodo} onChange={(_, value: 'dia' | 'semana') => setTurnosPeriodo(value)} aria-label="Período de comparación IQF" sx={{ mb: 2, borderBottom: 1, borderColor: 'divider' }}>
            <Tab value="dia" label={isToday || !data ? 'Hoy' : 'Día seleccionado'} sx={{ textTransform: 'none' }} />
            <Tab value="semana" label="Últimos 7 días" sx={{ textTransform: 'none' }} />
          </Tabs>
          {turnosPeriodo === 'semana' && <IqfShiftWeekTable enabled={turnosOpen} />}
          {turnosPeriodo === 'dia' && <>
          {isLoading && <Skeleton variant="rounded" height={220} />}
          {isError && <Alert severity="error">No se pudo cargar la comparación por turnos.</Alert>}
          {!isLoading && !isError && data?.turnos && <>
            <Alert severity={comparacion ? 'info' : 'warning'} sx={{ mb: 1.5 }}>
              <Typography variant="body2" fontWeight={700}>{isToday ? 'Comparación parcial' : 'Comparación del día seleccionado'}</Typography>
              {comparacion
                ? comparacion.mayor === null
                  ? 'Ambos turnos tienen el mismo promedio por IQF activo.'
                  : `El turno ${comparacion.mayor} tiene un promedio por IQF activo${comparacion.porcentaje !== null ? ` ${formatValue(comparacion.porcentaje)}% mayor que el turno ${comparacion.menor}` : ' mayor'}.`
                : data.turnos.length < 2
                  ? 'Selecciona Todos los turnos en el filtro para comparar A y B.'
                  : 'La diferencia se mostrará cuando ambos turnos tengan rendimientos calculables para sus IQFs con producción.'}
            </Alert>
            <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: `repeat(${data.turnos.length}, minmax(0, 1fr))` }, gap: 1, mb: 0.75 }}>
              {data.turnos.map((turno) => {
                const metrics = iqfShiftMetrics(turno);
                return (
                  <Card key={turno.turno} elevation={0} sx={{ borderRadius: 2, bgcolor: '#f3f6fa', border: 1, borderColor: '#dce4ee', color: '#334155' }}>
                    <CardContent sx={{ p: 1.25, '&:last-child': { pb: 1.25 } }}>
                      <Stack direction="row" justifyContent="space-between" alignItems="center" mb={0.5}>
                        <Typography variant="body2" fontWeight={700}>Total IQF · Turno {turno.turno}</Typography>
                        <Chip size="small" label={metrics.equipos ? `${metrics.equipos} IQFs con producción` : 'Sin registros'} sx={{ bgcolor: '#e5ebf2', color: '#64748b', fontSize: 9, height: 19 }} />
                      </Stack>
                      <Typography variant="caption" sx={{ color: 'text.secondary', fontSize: 10 }}>Libras producidas</Typography>
                      <Typography sx={{ fontSize: 23, fontWeight: 700, lineHeight: 1.2, fontVariantNumeric: 'tabular-nums', mb: 0.75 }}>
                        {turno.libras > 0 ? formatValue(turno.libras) : '—'} <Typography component="span" sx={{ fontSize: 10, color: 'text.secondary' }}>lbs</Typography>
                      </Typography>
                      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1, pt: 0.75, borderTop: '1px solid #dce4ee' }}>
                        {[
                          { label: 'Sumatoria IQFs', value: metrics.sumatoria },
                          { label: 'Promedio por IQF activo', value: metrics.promedio },
                        ].map((metric) => (
                          <Box key={metric.label}>
                            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', fontSize: 10 }}>{metric.label}</Typography>
                            <Typography sx={{ fontSize: 17, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{metric.value !== null ? formatValue(metric.value) : '—'} <Typography component="span" sx={{ fontSize: 10, color: 'text.secondary' }}>lbs/h</Typography></Typography>
                          </Box>
                        ))}
                      </Box>
                      {comparacion?.mayor === turno.turno && <Chip size="small" label="Mayor promedio por IQF" sx={{ mt: 0.75, bgcolor: '#e6eee9', color: '#476454', fontWeight: 600, fontSize: 9, height: 20 }} />}
                    </CardContent>
                  </Card>
                );
              })}
            </Box>
            <Typography variant="subtitle2" fontWeight={800} sx={{ mb: 1 }}>Detalle por equipo</Typography>
            <TableContainer sx={{ border: 1, borderColor: 'divider', borderRadius: 2 }}>
              <Table size="small" aria-label="Detalle IQF por turno" sx={{ '& td, & th': { py: 1 }, '& td': { fontVariantNumeric: 'tabular-nums' } }}>
                <TableHead>
                  <TableRow sx={{ bgcolor: 'action.hover' }}>
                    <TableCell>Equipo</TableCell>
                    <TableCell>Turno</TableCell>
                    <TableCell align="right">Producción (lbs)</TableCell>
                    <TableCell align="right">Rendimiento (lbs/h)</TableCell>
                    <TableCell align="right">Horas</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {[1, 2, 3].flatMap((number, index) => data.turnos!.map((turno, shiftIndex) => {
                    const line = turno.lineas[index];
                    return (
                      <TableRow key={`${number}-${turno.turno}`} sx={{ bgcolor: index % 2 === 0 ? 'background.paper' : 'action.hover', '&:last-child td': { borderBottom: 0 } }}>
                        {shiftIndex === 0 && <TableCell rowSpan={data.turnos!.length} sx={{ fontWeight: 800, color: '#164a8b', verticalAlign: 'middle' }}>IQF {number}</TableCell>}
                        <TableCell><Chip size="small" label={turno.turno} variant="outlined" sx={{ height: 22, fontWeight: 700 }} /></TableCell>
                        <TableCell align="right">{line?.libras > 0 ? formatValue(line.libras) : '—'}</TableCell>
                        <TableCell align="right" sx={{ fontWeight: 800, color: '#164a8b' }}>{line?.librasPorHora != null ? formatValue(line.librasPorHora) : '—'}</TableCell>
                        <TableCell align="right">{line?.libras > 0 ? formatValue(line.horas) : '—'}</TableCell>
                      </TableRow>
                    );
                  }))}
                </TableBody>
              </Table>
            </TableContainer>
          </>}
          </>}
        </DialogContent>
        <DialogActions><Button onClick={() => setTurnosOpen(false)}>Cerrar</Button></DialogActions>
      </Dialog>
    </Box>
  );
}
