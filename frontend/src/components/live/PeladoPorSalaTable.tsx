import {
  Alert,
  Box,
  Chip,
  Skeleton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import MeetingRoomOutlinedIcon from '@mui/icons-material/MeetingRoomOutlined';
import { usePeladoPorSala } from '../../hooks/useDashboardData';
import { formatPeriodo, formatValue } from '../../utils/format';

const HEADER_SX = { fontWeight: 800, bgcolor: '#f1f5f9', color: '#172033' } as const;

export default function PeladoPorSalaTable() {
  const { data, isLoading, isError, error, dataUpdatedAt } = usePeladoPorSala();

  return (
    <Box>
      <Stack direction="row" alignItems="center" spacing={0.75} mb={0.9} flexWrap="wrap" useFlexGap>
        <MeetingRoomOutlinedIcon color="primary" sx={{ fontSize: 16 }} />
        <Typography variant="subtitle2" fontWeight={800} sx={{ fontSize: 13 }}>
          Actividad de Pelado por Sala
        </Typography>
        {data && data.dia !== '' && (
          <Typography variant="caption" color="text.secondary" sx={{ fontSize: 11, flexBasis: { xs: '100%', sm: 'auto' }, pl: { xs: 2.75, sm: 0 } }}>
            {formatPeriodo(data.dia)} · actualizado {new Date(dataUpdatedAt).toLocaleTimeString()}
          </Typography>
        )}
      </Stack>

      {isLoading && <Skeleton variant="rounded" height={220} />}

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
        <TableContainer sx={{ maxHeight: 340, borderRadius: 1, border: '1px solid rgba(148, 163, 184, 0.18)' }}>
          <Table size="small" stickyHeader>
            <TableHead>
              <TableRow>
                <TableCell sx={HEADER_SX}>Sala</TableCell>
                <TableCell align="right" sx={HEADER_SX}>Personas activas</TableCell>
                <TableCell align="right" sx={HEADER_SX}>Libras últimos 30 min</TableCell>
                <TableCell align="right" sx={HEADER_SX}>Libras hoy</TableCell>
                <TableCell align="right" sx={HEADER_SX}>Empleados hoy</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {data.salas.map((sala) => (
                <TableRow key={sala.sala} hover>
                  <TableCell sx={{ fontWeight: 600 }}>{sala.sala}</TableCell>
                  <TableCell align="right">
                    {sala.personasActivas > 0 ? (
                      <Chip
                        size="small"
                        label={formatValue(sala.personasActivas)}
                        sx={{
                          bgcolor: 'rgba(46,125,50,0.1)',
                          color: '#2e7d32',
                          fontWeight: 700,
                          height: 20,
                          '& .MuiChip-label': { px: 0.9 },
                        }}
                      />
                    ) : (
                      <Typography variant="body2" color="text.secondary">0</Typography>
                    )}
                  </TableCell>
                  <TableCell align="right">{formatValue(sala.librasUltimos30Min)}</TableCell>
                  <TableCell align="right">{formatValue(sala.librasPeladasHoy)}</TableCell>
                  <TableCell align="right">{formatValue(sala.empleadosRegistrandoHoy)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  );
}
