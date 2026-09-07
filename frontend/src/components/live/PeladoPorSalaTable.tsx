import {
  Alert,
  Box,
  Card,
  CardContent,
  Skeleton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableFooter,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import MeetingRoomOutlinedIcon from '@mui/icons-material/MeetingRoomOutlined';
import { usePeladoPorSala } from '../../hooks/useDashboardData';
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

export default function PeladoPorSalaTable() {
  const { data, isLoading, isError, error, dataUpdatedAt } = usePeladoPorSala();

  const salas = [...(data?.salas ?? [])].sort((a, b) => salaNum(a.sala) - salaNum(b.sala));
  const maxLibrasHoy = salas.reduce((m, s) => Math.max(m, s.librasPeladasHoy), 0);
  const totales = salas.reduce(
    (acc, s) => ({
      personasActivas: acc.personasActivas + s.personasActivas,
      librasUltimos30Min: acc.librasUltimos30Min + s.librasUltimos30Min,
      librasPeladasHoy: acc.librasPeladasHoy + s.librasPeladasHoy,
      librasPorHora: acc.librasPorHora + s.librasPorHora,
      empleadosRegistrandoHoy: acc.empleadosRegistrandoHoy + s.empleadosRegistrandoHoy,
    }),
    {
      personasActivas: 0,
      librasUltimos30Min: 0,
      librasPeladasHoy: 0,
      librasPorHora: 0,
      empleadosRegistrandoHoy: 0,
    },
  );

  return (
    <Card sx={{ flexShrink: 0, borderRadius: 2 }}>
      <CardContent sx={{ p: '14px !important' }}>
        <Stack direction="row" alignItems="center" spacing={0.75} mb={1} flexWrap="wrap" useFlexGap>
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
          {data && data.dia !== '' && (
            <Typography
              variant="caption"
              color="text.secondary"
              sx={{ fontSize: 11, flexBasis: { xs: '100%', sm: 'auto' }, pl: { xs: 4.25, sm: 0 } }}
            >
              {formatPeriodo(data.dia)} · actualizado {new Date(dataUpdatedAt).toLocaleTimeString()}
              {data.horasTranscurridas > 0 &&
                ` · libras/hora sobre ${formatValue(data.horasTranscurridas, 'decimal')} h del día`}
            </Typography>
          )}
        </Stack>

        {isLoading && <Skeleton variant="rounded" height={240} />}

        {isError && (
          <Alert severity="error" sx={{ py: 0.5 }}>
            Error al cargar actividad por sala: {error instanceof Error ? error.message : 'desconocido'}
          </Alert>
        )}

        {!isLoading && !isError && data && data.salas.length === 0 && (
          <Alert severity="info" sx={{ py: 0.5 }}>
            Sin salas registradas.
          </Alert>
        )}

        {!isLoading && !isError && data && data.salas.length > 0 && (
          <TableContainer sx={{ maxHeight: 360, borderRadius: 1.5, border: '1px solid #e6ebf2' }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  <HeadCell label="Sala" align="left" />
                  <HeadCell label="Personas activas" unit="pelando hoy" />
                  <HeadCell label="Libras 30 min" unit="lbs · en vivo" />
                  <HeadCell label="Libras hoy" unit="lbs · acumulado" />
                  <HeadCell label="Libras / hora" unit="lbs · promedio" />
                  <HeadCell label="Empleados hoy" unit="con destajo" />
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
                      {formatValue(sala.empleadosRegistrandoHoy)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
              <TableFooter>
                <TableRow>
                  <TableCell sx={{ ...FOOT_CELL_SX, fontSize: 11, letterSpacing: 0.4, textTransform: 'uppercase', color: '#64748b' }}>
                    Total planta
                  </TableCell>
                  <TableCell align="right" sx={FOOT_CELL_SX}>{formatValue(totales.personasActivas)}</TableCell>
                  <TableCell align="right" sx={FOOT_CELL_SX}>{formatValue(totales.librasUltimos30Min)}</TableCell>
                  <TableCell align="right" sx={FOOT_CELL_SX}>{formatValue(totales.librasPeladasHoy)}</TableCell>
                  <TableCell align="right" sx={{ ...FOOT_CELL_SX, color: 'primary.main' }}>
                    {formatValue(totales.librasPorHora)}
                  </TableCell>
                  <TableCell align="right" sx={FOOT_CELL_SX}>{formatValue(totales.empleadosRegistrandoHoy)}</TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </TableContainer>
        )}
      </CardContent>
    </Card>
  );
}
