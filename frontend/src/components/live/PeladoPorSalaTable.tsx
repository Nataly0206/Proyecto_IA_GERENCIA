import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  InputAdornment,
  Skeleton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableFooter,
  TableHead,
  TableRow,
  TableSortLabel,
  TextField,
  ToggleButton,
  ToggleButtonGroup,
  Typography,
} from '@mui/material';
import MeetingRoomOutlinedIcon from '@mui/icons-material/MeetingRoomOutlined';
import StraightenOutlinedIcon from '@mui/icons-material/StraightenOutlined';
import CloseIcon from '@mui/icons-material/Close';
import FilterAltOutlinedIcon from '@mui/icons-material/FilterAltOutlined';
import { apiClient } from '../../api/client';
import { useFilters } from '../../context/FiltersContext';
import { usePeladoLibrasHoyTalla, usePeladoPorSala } from '../../hooks/useDashboardData';
import { formatPeriodo, formatValue } from '../../utils/format';

const NUM_SX = { fontVariantNumeric: 'tabular-nums' } as const;

const HEAD_CELL_SX = {
  fontWeight: 700,
  fontSize: 10.5,
  letterSpacing: 0.4,
  textTransform: 'uppercase',
  color: '#64748b',
  bgcolor: '#fff',
  borderBottom: '2px solid #e2e8f0',
  lineHeight: 1.3,
  py: 1,
} as const;

const BODY_NUM_SX = { fontSize: 12.5, color: '#1e293b', borderColor: '#eef2f7', ...NUM_SX } as const;

const FOOT_CELL_SX = {
  fontWeight: 800,
  fontSize: 12.5,
  color: '#0f172a',
  bgcolor: '#f8fafc',
  borderTop: '2px solid #cbd5e1',
  borderBottom: 'none',
  ...NUM_SX,
} as const;

const ROW_SX = {
  '&:nth-of-type(even) td': { bgcolor: '#fbfcfe' },
  '&:hover td': { bgcolor: '#eef4fb' },
  '& td': { transition: 'background-color 120ms ease' },
} as const;

function HeadCell({ label, unit, align = 'right' }: { label: string; unit?: string; align?: 'left' | 'right' }) {
  return (
    <TableCell align={align} sx={HEAD_CELL_SX}>
      <Box>{label}</Box>
      {unit && (
        <Box sx={{ fontSize: 9, fontWeight: 600, letterSpacing: 0, color: '#94a3b8', textTransform: 'none' }}>
          {unit}
        </Box>
      )}
    </TableCell>
  );
}

const salaNum = (nombre: string) => Number(nombre.replace(/\D/g, '')) || 0;
const HOURS_STORAGE_KEY = 'pelado-salas-horas-minimas:v1';
const TALLAS_GRANDES = new Set(['16/20', '21/25', '26/30', '31/35', '36/40', '41/50']);
type SalaDailyRow = { fecha: string; personas: number; libras: number; librasPorHoraPromedio: number; horasTrabajadas: number };

function clasificarTalla(talla: string): 'grande' | 'pequeno' | 'sinClasificar' {
  const normalizada = talla.toUpperCase().replace(/\s/g, '').replace(/-/g, '/');
  if (!normalizada || normalizada.includes('SINTALLA')) return 'sinClasificar';
  return TALLAS_GRANDES.has(normalizada) ? 'grande' : 'pequeno';
}

function readStoredHours(userId: string): string {
  try {
    const stored = localStorage.getItem(`${HOURS_STORAGE_KEY}:${userId}`);
    return stored && Number.isFinite(Number(stored)) && Number(stored) >= 0 && Number(stored) <= 24 ? stored : '';
  } catch {
    return '';
  }
}

export default function PeladoPorSalaTable({ userId }: { userId: string }) {
  const { filters } = useFilters();
  const { data, isLoading, isError, error, dataUpdatedAt } = usePeladoPorSala();
  const [tallaOpen, setTallaOpen] = useState(false);
  const [vista, setVista] = useState<'salas' | 'dia' | 'semana' | 'mes'>('dia');
  const reportYear = filters.fechaFinal.slice(0, 4);
  const reportFilters = vista === 'mes'
    ? { ...filters, fechaInicial: `${reportYear}-01-01`, fechaFinal: `${reportYear}-12-31` }
    : filters;
  const [minHours, setMinHours] = useState(() => readStoredHours(userId));
  const [preferencesUserId, setPreferencesUserId] = useState<string | null>(null);
  const [preferenceError, setPreferenceError] = useState('');

  const parsedHours = Number(minHours);
  const hoursThreshold = minHours !== '' && Number.isFinite(parsedHours) && parsedHours >= 0 && parsedHours <= 24 ? parsedHours : null;
  const validHours = minHours === '' || (Number.isFinite(parsedHours) && parsedHours >= 0 && parsedHours <= 24);
  const dailyQuery = useQuery<SalaDailyRow[]>({
    queryKey: [vista === 'mes' ? 'pelado-por-sala-diario:mensual-v2' : 'pelado-por-sala-diario:periodos-v1', vista, reportFilters, hoursThreshold],
    queryFn: async ({ signal }) => (await apiClient.get<SalaDailyRow[]>('/dashboard/pelado-por-sala-diario', {
      params: { ...reportFilters, periodo: vista === 'salas' ? 'dia' : vista, minHours: hoursThreshold ?? undefined },
      signal,
    })).data,
    enabled: vista !== 'salas' && validHours,
    // Evita repetir automáticamente una consulta anual que acaba de fallar.
    retry: vista === 'mes' ? false : 1,
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    let active = true;
    setPreferencesUserId(null);
    apiClient.get<{ minHours: number | null }>('/dashboard/pelado-preferencia-horas-sala')
      .then(({ data }) => {
        if (!active) return;
        setMinHours(typeof data.minHours === 'number' && data.minHours >= 0 && data.minHours <= 24
          ? String(data.minHours) : readStoredHours(userId));
        setPreferencesUserId(userId);
      })
      .catch(() => {
        if (active) setPreferenceError('No se pudo cargar el filtro de horas guardado.');
      });
    return () => { active = false; };
  }, [userId]);

  useEffect(() => {
    try {
      if (minHours === '') localStorage.removeItem(`${HOURS_STORAGE_KEY}:${userId}`);
      else localStorage.setItem(`${HOURS_STORAGE_KEY}:${userId}`, minHours);
    } catch {
      // El filtro sigue activo durante la sesión.
    }
  }, [minHours, userId]);

  useEffect(() => {
    if (preferencesUserId !== userId || !validHours) return;
    const timeout = window.setTimeout(() => {
      void apiClient.put('/dashboard/pelado-preferencia-horas-sala', {
        minHours: minHours === '' ? null : Number(minHours),
      }).then(() => setPreferenceError(''))
        .catch(() => setPreferenceError('No se pudo guardar el filtro de horas.'));
    }, 300);
    return () => window.clearTimeout(timeout);
  }, [minHours, preferencesUserId, userId, validHours]);
  const salas = [...(data?.salas ?? [])]
    .filter((sala) => hoursThreshold === null || sala.horasTrabajadas > hoursThreshold)
    .sort((a, b) => salaNum(a.sala) - salaNum(b.sala));
  const maxLibrasHoy = salas.reduce((m, s) => Math.max(m, s.librasPeladasHoy), 0);
  const totales = salas.reduce(
    (acc, s) => ({
      personasActivas: acc.personasActivas + s.personasActivas,
      librasUltimos30Min: acc.librasUltimos30Min + s.librasUltimos30Min,
      librasPeladasHoy: acc.librasPeladasHoy + s.librasPeladasHoy,
      librasPorHora: acc.librasPorHora + s.librasPorHora,
    }),
    {
      personasActivas: 0,
      librasUltimos30Min: 0,
      librasPeladasHoy: 0,
      librasPorHora: 0,
    },
  );

  const dailyRows = [...(dailyQuery.data ?? [])];
  if (vista === 'mes' && dailyRows.length > 0) {
    const present = new Set(dailyRows.map((row) => row.fecha));
    for (let month = 1; month <= 12; month += 1) {
      const fecha = `${reportYear}-${String(month).padStart(2, '0')}`;
      if (!present.has(fecha)) dailyRows.push({ fecha, personas: 0, libras: 0, librasPorHoraPromedio: 0, horasTrabajadas: 0 });
    }
    dailyRows.sort((a, b) => a.fecha.localeCompare(b.fecha));
  }
  const dailyDays = dailyRows.length;
  const dailyTotales = dailyRows.reduce(
    (acc, r) => ({
      personas: acc.personas + r.personas,
      libras: acc.libras + r.libras,
      librasPorHoraPromedio: acc.librasPorHoraPromedio + r.librasPorHoraPromedio,
      horasTrabajadas: acc.horasTrabajadas + r.horasTrabajadas,
    }),
    { personas: 0, libras: 0, librasPorHoraPromedio: 0, horasTrabajadas: 0 },
  );
  const dailyPromedios = dailyDays > 0 ? {
    personas: dailyTotales.personas / dailyDays,
    libras: dailyTotales.libras / dailyDays,
    librasPorHoraPromedio: dailyTotales.librasPorHoraPromedio / dailyDays,
    horasTrabajadas: dailyTotales.horasTrabajadas / dailyDays,
  } : null;

  return (
    <Card sx={{ flexShrink: 0, borderRadius: 2 }}>
      <CardContent sx={{ p: '14px !important' }}>
        <Box
          sx={{
            display: 'flex',
            alignItems: 'center',
            flexWrap: 'nowrap',
            gap: 1,
            mb: 1.25,
            overflowX: 'auto',
            whiteSpace: 'nowrap',
            py: 0.25,
          }}
        >
          <Stack
            direction="row"
            alignItems="center"
            spacing={0.75}
            sx={{ flexShrink: 0 }}
          >
            <Box
              sx={{
                width: 26,
                height: 26,
                display: 'grid',
                placeItems: 'center',
                borderRadius: 1,
                bgcolor: 'rgba(22, 74, 139, 0.08)',
                color: 'primary.main',
              }}
            >
              <MeetingRoomOutlinedIcon sx={{ fontSize: 16 }} />
            </Box>
            <Typography variant="subtitle2" fontWeight={800} sx={{ fontSize: 14, lineHeight: 1.2 }}>
              Actividad de Pelado por Sala
            </Typography>
            {vista === 'salas' && data && data.dia !== '' && (
              <Typography
                variant="caption"
                color="text.secondary"
                sx={{ fontSize: 11 }}
              >
                {formatPeriodo(data.dia)} · actualizado {new Date(dataUpdatedAt).toLocaleTimeString()}
                {data.horasTranscurridas > 0 &&
                  ` · libras/hora sobre ${formatValue(data.horasTranscurridas, 'decimal')} h del día`}
              </Typography>
            )}
          </Stack>
          <Box sx={{ height: 24, borderLeft: '1px solid', borderColor: 'divider', ml: 'auto', mr: 0.5, flexShrink: 0 }} />
          <FilterAltOutlinedIcon color="primary" sx={{ fontSize: 18, flexShrink: 0 }} />
          <Typography variant="body2" fontWeight={700} sx={{ flexShrink: 0 }}>Mostrar salas con más de</Typography>
          <TextField size="small" type="number" value={minHours}
            onChange={(event) => setMinHours(event.target.value)}
            error={!validHours}
            inputProps={{ min: 0, max: 24, step: 0.25, 'aria-label': 'Horas trabajadas mínimas por sala' }}
            InputProps={{ endAdornment: <InputAdornment position="end">h</InputAdornment> }}
            sx={{ width: 110, flexShrink: 0, '& .MuiInputBase-input': { py: 0.7 } }} />
          <Typography variant="body2" color="text.secondary" sx={{ flexShrink: 0 }}>{vista === 'salas' ? 'trabajadas hoy' : 'trabajadas por día'}</Typography>
          {minHours !== '' && <Button size="small" sx={{ flexShrink: 0 }} onClick={() => setMinHours('')}>Quitar filtro</Button>}
          <Typography variant="caption" color="text.secondary" sx={{ ml: 1, flexShrink: 0 }}>
            {vista === 'salas' ? `${salas.length} de ${data?.salas.length ?? 0} salas visibles` : 'Personas únicas por período'}
          </Typography>
          <ToggleButtonGroup
            size="small"
            exclusive
            value={vista}
            onChange={(_e, next: 'salas' | 'dia' | 'semana' | 'mes' | null) => next && setVista(next)}
            disabled={!validHours}
            sx={{ flexShrink: 0, '& .MuiToggleButton-root': { px: 1.25, py: 0.4, fontSize: 12, fontWeight: 700, lineHeight: 1, textTransform: 'none' } }}
          >
            <ToggleButton value="dia" aria-label="Vista por día">Día</ToggleButton>
            <ToggleButton value="semana" aria-label="Vista por semana">Semana</ToggleButton>
            <ToggleButton value="mes" aria-label="Vista por mes">Mes</ToggleButton>
          </ToggleButtonGroup>
          <Button size="small" variant={vista === 'salas' ? 'contained' : 'outlined'}
            onClick={() => setVista('salas')} disabled={!validHours}
            sx={{ flexShrink: 0, whiteSpace: 'nowrap' }}>Salas · hoy</Button>
          <Button
            size="small"
            variant="outlined"
            startIcon={<StraightenOutlinedIcon sx={{ fontSize: 16 }} />}
            onClick={() => setTallaOpen(true)}
            sx={{ flexShrink: 0, textTransform: 'none', fontWeight: 700, fontSize: 12, py: 0.4 }}
          >
            Por talla · hoy
          </Button>
        </Box>
        {!validHours && <Alert severity="warning" sx={{ mb: 1 }}>Ingresa un valor entre 0 y 24 horas.</Alert>}
        {preferenceError && <Alert severity="error" onClose={() => setPreferenceError('')} sx={{ mb: 1 }}>{preferenceError}</Alert>}

        {vista === 'salas' && isLoading && <Skeleton variant="rounded" height={240} />}

        {vista === 'salas' && isError && (
          <Alert severity="error" sx={{ py: 0.5 }}>
            Error al cargar actividad por sala: {error instanceof Error ? error.message : 'desconocido'}
          </Alert>
        )}

        {vista === 'salas' && !isLoading && !isError && data && data.salas.length === 0 && (
          <Alert severity="info" sx={{ py: 0.5 }}>
            Sin salas registradas.
          </Alert>
        )}

        {vista === 'salas' && !isLoading && !isError && data && data.salas.length > 0 && salas.length === 0 && (
          <Alert severity="info" sx={{ py: 0.5 }}>Ninguna sala supera el límite de horas indicado.</Alert>
        )}

        {vista === 'salas' && !isLoading && !isError && data && salas.length > 0 && (
          <TableContainer
            sx={{
              maxHeight: 360,
              borderRadius: 1.5,
              border: '1px solid #e6ebf2',
              // En pantallas angostas la tabla desborda su ancho y se
              // desplaza en horizontal dentro de este contenedor, sin
              // empujar el layout de la página.
              overflowX: 'auto',
              WebkitOverflowScrolling: 'touch',
            }}
          >
            <Table size="small" stickyHeader sx={{ minWidth: 620 }}>
              <TableHead>
                <TableRow>
                  <HeadCell label="Sala" align="left" />
                  <HeadCell label="Personas activas" unit="pelando hoy" />
                  <HeadCell label="Libras 30 min" unit="lbs · en vivo" />
                  <HeadCell label="Libras hoy" unit="lbs · acumulado" />
                  <HeadCell label="Libras / hora" unit="lbs · promedio" />
                  <HeadCell label="Horas trabajadas" unit="h · primer a último registro" />
                </TableRow>
              </TableHead>
              <TableBody>
                {salas.map((sala) => (
                  <TableRow key={sala.sala} sx={ROW_SX}>
                    <TableCell sx={{ py: 0.9, borderColor: '#eef2f7' }}>
                      <Stack direction="row" alignItems="center" spacing={1}>
                        <Box
                          sx={{
                            width: 24,
                            height: 24,
                            borderRadius: 1,
                            display: 'grid',
                            placeItems: 'center',
                            bgcolor: 'rgba(22, 74, 139, 0.09)',
                            color: 'primary.main',
                            fontSize: 12,
                            fontWeight: 800,
                          }}
                        >
                          {salaNum(sala.sala) || '·'}
                        </Box>
                        <Typography sx={{ fontSize: 12.5, fontWeight: 700, color: '#0f172a' }}>
                          {sala.sala}
                        </Typography>
                      </Stack>
                    </TableCell>

                    <TableCell align="right" sx={BODY_NUM_SX}>
                      {sala.personasActivas > 0 ? (
                        <Box
                          component="span"
                          sx={{
                            display: 'inline-block',
                            minWidth: 26,
                            px: 0.9,
                            py: 0.15,
                            borderRadius: 1,
                            bgcolor: 'rgba(46, 125, 50, 0.12)',
                            color: '#2e7d32',
                            fontWeight: 800,
                            fontSize: 12,
                          }}
                        >
                          {formatValue(sala.personasActivas)}
                        </Box>
                      ) : (
                        <Box component="span" sx={{ color: '#94a3b8' }}>
                          0
                        </Box>
                      )}
                    </TableCell>

                    <TableCell align="right" sx={BODY_NUM_SX}>
                      {formatValue(sala.librasUltimos30Min)}
                    </TableCell>

                    <TableCell align="right" sx={BODY_NUM_SX}>
                      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 0.5 }}>
                        <span>{formatValue(sala.librasPeladasHoy)}</span>
                        <Box sx={{ width: 72, height: 3, borderRadius: 2, bgcolor: '#e9eef5', overflow: 'hidden' }}>
                          <Box
                            sx={{
                              height: '100%',
                              borderRadius: 2,
                              bgcolor: 'primary.main',
                              width: `${maxLibrasHoy > 0 ? Math.max((sala.librasPeladasHoy / maxLibrasHoy) * 100, sala.librasPeladasHoy > 0 ? 4 : 0) : 0}%`,
                            }}
                          />
                        </Box>
                      </Box>
                    </TableCell>

                    <TableCell align="right" sx={{ ...BODY_NUM_SX, fontWeight: 700, color: 'primary.main' }}>
                      {formatValue(sala.librasPorHora)}
                    </TableCell>

                    <TableCell align="right" sx={BODY_NUM_SX}>
                      {formatValue(sala.horasTrabajadas, 'decimal')}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell sx={{ ...FOOT_CELL_SX, fontSize: 11, letterSpacing: 0.4, textTransform: 'uppercase', color: '#64748b' }}>
                    {hoursThreshold === null ? 'Total planta' : 'Total visible'}
                  </TableCell>
                  <TableCell align="right" sx={FOOT_CELL_SX}>{formatValue(totales.personasActivas)}</TableCell>
                  <TableCell align="right" sx={FOOT_CELL_SX}>{formatValue(totales.librasUltimos30Min)}</TableCell>
                  <TableCell align="right" sx={FOOT_CELL_SX}>{formatValue(totales.librasPeladasHoy)}</TableCell>
                  <TableCell align="right" sx={{ ...FOOT_CELL_SX, color: 'primary.main' }}>
                    {formatValue(totales.librasPorHora)}
                  </TableCell>
                  <TableCell align="right" sx={FOOT_CELL_SX}>{formatValue(data?.horasTranscurridas ?? 0, 'decimal')}</TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </TableContainer>
        )}

        {vista !== 'salas' && (
          <Box>
            <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mb: 1 }}>
              {formatPeriodo(reportFilters.fechaInicial)} a {formatPeriodo(reportFilters.fechaFinal)}
              {filters.turno ? ` · ${filters.turno}` : ' · todos los turnos'}
              {hoursThreshold !== null ? ` · salas con más de ${hoursThreshold} h por día` : ' · todas las salas'}
            </Typography>
            {dailyQuery.isLoading && <Skeleton variant="rounded" height={220} />}
            {dailyQuery.isError && <Alert severity="error">No se pudo cargar la actividad del período por sala.</Alert>}
            {!dailyQuery.isLoading && !dailyQuery.isError && dailyQuery.data?.length === 0 &&
              <Alert severity="info">Sin actividad para el período y límite de horas seleccionados.</Alert>}
            {!dailyQuery.isLoading && !dailyQuery.isError && Boolean(dailyQuery.data?.length) &&
              <TableContainer sx={{ maxHeight: 360, border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
                <Table size="small" stickyHeader>
                  <TableHead><TableRow>
                    <HeadCell label={vista === 'dia' ? 'Fecha' : vista === 'semana' ? 'Semana' : 'Mes'} align="left" />
                    <HeadCell label="Personas" />
                    <HeadCell label="Total libras" unit="lbs" />
                    <HeadCell label="lbs/h promedio" unit="libras / horas del período" />
                    <HeadCell label="Horas trabajadas" unit="h · suma de jornadas" />
                  </TableRow></TableHead>
                  <TableBody>{dailyRows.map((row) =>
                    <TableRow key={row.fecha} hover>
                      <TableCell>{formatPeriodo(row.fecha)}</TableCell>
                      <TableCell align="right" sx={BODY_NUM_SX}>{formatValue(row.personas)}</TableCell>
                      <TableCell align="right" sx={BODY_NUM_SX}>{formatValue(row.libras)}</TableCell>
                      <TableCell align="right" sx={BODY_NUM_SX}>{formatValue(row.librasPorHoraPromedio, 'decimal')}</TableCell>
                      <TableCell align="right" sx={BODY_NUM_SX}>{formatValue(row.horasTrabajadas, 'decimal')}</TableCell>
                    </TableRow>)}</TableBody>
                  <TableFooter sx={{ position: 'sticky', bottom: 0, zIndex: 2 }}>
                    <TableRow>
                      <TableCell sx={{ ...FOOT_CELL_SX, fontSize: 11, letterSpacing: 0.4, textTransform: 'uppercase', color: '#64748b' }}>
                        Total
                      </TableCell>
                      <TableCell align="right" sx={FOOT_CELL_SX}>{formatValue(dailyTotales.personas)}</TableCell>
                      <TableCell align="right" sx={FOOT_CELL_SX}>{formatValue(dailyTotales.libras)}</TableCell>
                      <TableCell align="right" sx={{ ...FOOT_CELL_SX, color: 'primary.main' }}>{formatValue(dailyTotales.horasTrabajadas > 0 ? dailyTotales.libras / dailyTotales.horasTrabajadas : 0, 'decimal')}</TableCell>
                      <TableCell align="right" sx={FOOT_CELL_SX}>{formatValue(dailyTotales.horasTrabajadas, 'decimal')}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 700, fontSize: 11, letterSpacing: 0.4, textTransform: 'uppercase', color: '#64748b', bgcolor: '#f3f6fb', borderTop: '1px solid #dbe3ee' }}>
                        Promedio
                      </TableCell>
                      <TableCell align="right" sx={{ ...BODY_NUM_SX, fontWeight: 700, bgcolor: '#f3f6fb', borderTop: '1px solid #dbe3ee' }}>{formatValue(dailyPromedios?.personas ?? 0, 'decimal')}</TableCell>
                      <TableCell align="right" sx={{ ...BODY_NUM_SX, fontWeight: 700, bgcolor: '#f3f6fb', borderTop: '1px solid #dbe3ee' }}>{formatValue(dailyPromedios?.libras ?? 0, 'decimal')}</TableCell>
                      <TableCell align="right" sx={{ ...BODY_NUM_SX, fontWeight: 700, color: 'primary.main', bgcolor: '#f3f6fb', borderTop: '1px solid #dbe3ee' }}>{formatValue(dailyPromedios?.librasPorHoraPromedio ?? 0, 'decimal')}</TableCell>
                      <TableCell align="right" sx={{ ...BODY_NUM_SX, fontWeight: 700, bgcolor: '#f3f6fb', borderTop: '1px solid #dbe3ee' }}>{formatValue(dailyPromedios?.horasTrabajadas ?? 0, 'decimal')}</TableCell>
                    </TableRow>
                  </TableFooter>
                </Table>
              </TableContainer>}
          </Box>
        )}
      </CardContent>

      <PeladoTallaHoyDialog open={tallaOpen} onClose={() => setTallaOpen(false)} />
    </Card>
  );
}

function PeladoTallaHoyDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data, isLoading, isError, error, dataUpdatedAt } = usePeladoLibrasHoyTalla(open);
  const [sortBy, setSortBy] = useState<'talla' | 'libras' | 'porcentaje'>('talla');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');
  const total = data?.total ?? 0;
  const tallas = (data?.tallas ?? [])
    .map((talla) => ({
      ...talla,
      porcentaje: total > 0 ? (talla.libras / total) * 100 : 0,
    }))
    .sort((a, b) => {
      const comparison = sortBy === 'talla'
        ? a.talla.localeCompare(b.talla, 'es', { numeric: true, sensitivity: 'base' })
        : a[sortBy] - b[sortBy];
      return sortDirection === 'asc' ? comparison : -comparison;
    });
  const grupos = (data?.tallas ?? []).reduce(
    (acumulado, talla) => {
      acumulado[clasificarTalla(talla.talla)] += talla.libras;
      return acumulado;
    },
    { grande: 0, pequeno: 0, sinClasificar: 0 },
  );
  const porcentajesGrupo = { grande: 0, pequeno: 0, sinClasificar: 0 };
  if (total > 0) {
    const participaciones = (Object.keys(grupos) as Array<keyof typeof grupos>).map((grupo) => {
      const exacto = (grupos[grupo] / total) * 10_000;
      const puntos = Math.floor(exacto);
      return { grupo, puntos, residuo: exacto - puntos };
    });
    const puntosFaltantes = Math.max(0, 10_000 - participaciones.reduce((suma, item) => suma + item.puntos, 0));
    const porResiduo = [...participaciones].sort((a, b) => b.residuo - a.residuo);
    for (let indice = 0; indice < puntosFaltantes; indice += 1) {
      porResiduo[indice % porResiduo.length].puntos += 1;
    }
    for (const item of participaciones) porcentajesGrupo[item.grupo] = item.puntos / 100;
  }
  const groupCellSx = {
    fontWeight: 800,
    fontSize: 12,
    color: '#17362c',
    bgcolor: '#eef7f3',
    borderTop: '1px solid #cfe3d9',
    ...NUM_SX,
  } as const;

  const changeSort = (column: 'talla' | 'libras' | 'porcentaje') => {
    if (sortBy === column) {
      setSortDirection((current) => current === 'asc' ? 'desc' : 'asc');
      return;
    }
    setSortBy(column);
    setSortDirection(column === 'talla' ? 'asc' : 'desc');
  };

  const sortableHead = (
    label: string,
    column: 'talla' | 'libras' | 'porcentaje',
    align: 'left' | 'right',
    unit?: string,
  ) => (
    <TableCell align={align} sortDirection={sortBy === column ? sortDirection : false} sx={HEAD_CELL_SX}>
      <TableSortLabel
        active={sortBy === column}
        direction={sortBy === column ? sortDirection : 'asc'}
        onClick={() => changeSort(column)}
        sx={{
          color: 'inherit !important',
          '& .MuiTableSortLabel-icon': { fontSize: 15 },
        }}
      >
        <Box sx={{ textAlign: align }}>
          <Box>{label}</Box>
          {unit && (
            <Box sx={{ fontSize: 9, fontWeight: 600, letterSpacing: 0, color: '#94a3b8', textTransform: 'none' }}>
              {unit}
            </Box>
          )}
        </Box>
      </TableSortLabel>
    </TableCell>
  );

  return (
    <Dialog open={open} onClose={onClose} maxWidth="xs" fullWidth>
      <DialogTitle sx={{ p: 1.75, pb: 1.25 }}>
        <Stack direction="row" alignItems="flex-start" justifyContent="space-between" spacing={1}>
          <Box sx={{ minWidth: 0 }}>
            <Typography sx={{ fontSize: 14, fontWeight: 800, lineHeight: 1.2 }}>
              Libras Peladas por Talla — Hoy
            </Typography>
            {data && data.dia !== '' && (
              <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11 }}>
                {formatPeriodo(data.dia)} · actualizado {new Date(dataUpdatedAt).toLocaleTimeString()}
              </Typography>
            )}
          </Box>
          <IconButton size="small" onClick={onClose} aria-label="Cerrar" sx={{ mt: -0.5, mr: -0.5 }}>
            <CloseIcon sx={{ fontSize: 18 }} />
          </IconButton>
        </Stack>
      </DialogTitle>
      <DialogContent dividers sx={{ p: 1.75 }}>
        {isLoading && <Skeleton variant="rounded" height={200} />}

        {isError && (
          <Alert severity="error" sx={{ py: 0.5 }}>
            Error al cargar libras por talla: {error instanceof Error ? error.message : 'desconocido'}
          </Alert>
        )}

        {!isLoading && !isError && tallas.length === 0 && (
          <Alert severity="info" sx={{ py: 0.5 }}>
            Sin libras peladas registradas hoy.
          </Alert>
        )}

        {!isLoading && !isError && tallas.length > 0 && (
          <TableContainer sx={{ maxHeight: 360, borderRadius: 1.5, border: '1px solid #e6ebf2' }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  {sortableHead('Talla / gramaje', 'talla', 'left')}
                  {sortableHead('Libras hoy', 'libras', 'right', 'lbs · acumulado')}
                  {sortableHead('Porcentaje', 'porcentaje', 'right', '% del total')}
                </TableRow>
              </TableHead>
              <TableBody>
                {tallas.map((t) => (
                  <TableRow key={t.talla} sx={ROW_SX}>
                    <TableCell sx={{ fontSize: 12.5, fontWeight: 700, color: '#0f172a', borderColor: '#eef2f7' }}>
                      {t.talla}
                    </TableCell>
                    <TableCell align="right" sx={BODY_NUM_SX}>
                      {formatValue(t.libras)}
                    </TableCell>
                    <TableCell align="right" sx={{ ...BODY_NUM_SX, fontWeight: 700, color: 'primary.main' }}>
                      {formatValue(t.porcentaje, 'percent')}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell sx={{ ...FOOT_CELL_SX, fontSize: 11, letterSpacing: 0.4, textTransform: 'uppercase', color: '#64748b' }}>
                    Total
                  </TableCell>
                  <TableCell align="right" sx={FOOT_CELL_SX}>{formatValue(total)}</TableCell>
                  <TableCell align="right" sx={{ ...FOOT_CELL_SX, color: 'primary.main' }}>
                    {formatValue(total > 0 ? 100 : 0, 'percent')}
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell sx={groupCellSx}>Grande</TableCell>
                  <TableCell align="right" sx={groupCellSx}>{formatValue(grupos.grande)}</TableCell>
                  <TableCell align="right" sx={{ ...groupCellSx, color: 'primary.main' }}>
                    {formatValue(porcentajesGrupo.grande, 'percent')}
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell sx={groupCellSx}>Pequeño</TableCell>
                  <TableCell align="right" sx={groupCellSx}>{formatValue(grupos.pequeno)}</TableCell>
                  <TableCell align="right" sx={{ ...groupCellSx, color: 'primary.main' }}>
                    {formatValue(porcentajesGrupo.pequeno, 'percent')}
                  </TableCell>
                </TableRow>
                {grupos.sinClasificar > 0 && (
                  <TableRow>
                    <TableCell sx={groupCellSx}>Sin clasificar</TableCell>
                    <TableCell align="right" sx={groupCellSx}>{formatValue(grupos.sinClasificar)}</TableCell>
                    <TableCell align="right" sx={{ ...groupCellSx, color: 'primary.main' }}>
                      {formatValue(porcentajesGrupo.sinClasificar, 'percent')}
                    </TableCell>
                  </TableRow>
                )}
              </TableFooter>
            </Table>
          </TableContainer>
        )}
      </DialogContent>
    </Dialog>
  );
}
