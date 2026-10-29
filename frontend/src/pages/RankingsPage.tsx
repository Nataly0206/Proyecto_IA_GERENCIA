import { Alert, Avatar, Box, Button, Chip, LinearProgress, Paper, Skeleton, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Tooltip, Typography } from '@mui/material';
import WorkspacePremiumOutlinedIcon from '@mui/icons-material/WorkspacePremiumOutlined';
import SetMealOutlinedIcon from '@mui/icons-material/SetMealOutlined';
import ContentCutOutlinedIcon from '@mui/icons-material/ContentCutOutlined';
import { useQueries } from '@tanstack/react-query';
import { apiClient } from '../api/client';

interface Ranking { updatedAt: string; totalEmployees: number; employees: { position: number; employeeId: number; name: string; pounds: number }[] }
const processes = [{ key: 'pelado', title: 'Pelado', icon: <SetMealOutlinedIcon />, color: '#008b83' }, { key: 'descabezado', title: 'Descabezado', icon: <ContentCutOutlinedIcon />, color: '#bd7923' }];
const medals = [
  { color: '#a47c25', background: '#faf5e8', label: 'Oro · Primer lugar' },
  { color: '#74808e', background: '#f0f3f6', label: 'Plata · Segundo lugar' },
  { color: '#a56f4b', background: '#f7eee8', label: 'Bronce · Tercer lugar' },
];
const number = (value: number) => value.toLocaleString('en-US', { maximumFractionDigits: 2 });
export default function RankingsPage({ userId }: { userId: string }) {
  const mode = 20;
  const compact = true;
  const key = (process: string) => ['rankings', userId, process, 'today-v2'];
  const queries = useQueries({ queries: processes.map(process => ({ queryKey: key(process.key),
    queryFn: async () => (await apiClient.get<Ranking>(`/dashboard/rankings/${process.key}`)).data,
    staleTime: 5 * 60_000, refetchInterval: 5 * 60_000, refetchOnWindowFocus: false,
  })) });
  return <Stack spacing={2.5} sx={{ height: '100%', overflow: 'auto' }}>
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', lg: '1fr 1fr' }, gap: 2.5, alignItems: 'start' }}>
      {processes.map((process, index) => {
        const query = queries[index]; const ranking = query.data;
        const max = ranking?.employees[0]?.pounds ?? 0;
        return <Paper key={process.key} variant="outlined" sx={{ minWidth: 0, borderRadius: 2, overflow: 'hidden' }}>
          <Stack direction="row" justifyContent="space-between" alignItems="center" sx={{ p: 2.5, bgcolor: `${process.color}08` }}>
            <Stack direction="row" spacing={1.5} alignItems="center"><Avatar variant="rounded" sx={{ bgcolor: `${process.color}16`, color: process.color }}>{process.icon}</Avatar><Box><Typography fontWeight={800}>{process.title}</Typography><Typography variant="caption" color="text.secondary">{ranking ? `${Math.min(mode, ranking.employees.length)} de ${ranking.totalEmployees.toLocaleString()} empleados con libras` : 'Los mayores volúmenes de hoy'}</Typography></Box></Stack><Chip size="small" label={`TOP ${mode}`} variant="outlined" sx={{ color: process.color, fontWeight: 800 }} />
          </Stack>
          {query.isFetching && <LinearProgress sx={{ height: 2 }} />}
          {query.isError && <Alert severity="error" sx={{ m: 2 }}>No se pudo cargar este ranking. <Button color="inherit" size="small" onClick={() => void query.refetch()}>Reintentar</Button></Alert>}
          <Box sx={{ display: 'grid', gridTemplateColumns: compact ? { xs: '1fr', sm: 'minmax(0, 1fr) minmax(0, 1fr)' } : 'minmax(0, 1fr)' }}>
          {(compact ? [0, 10] : [0]).map(offset => <TableContainer key={offset} sx={{ minWidth: 0 }}>
          <Table size="small" aria-label={`${process.title}, puestos ${offset + 1} a ${offset + 10}`} sx={{ tableLayout: compact ? 'fixed' : 'auto' }}>
            <TableHead><TableRow sx={{ bgcolor: '#f8fafc' }}><TableCell sx={{ pl: compact ? 1 : 2.5, width: compact ? 44 : 48 }}>#</TableCell><TableCell>Empleado</TableCell><TableCell align="right" sx={{ pr: compact ? 1 : 2.5, width: compact ? 82 : undefined }}>Libras</TableCell></TableRow></TableHead>
            <TableBody>{query.isLoading ? [0, 1, 2, 3, 4].map(i => <TableRow key={i}><TableCell colSpan={3} sx={{ py: 2 }}><Skeleton /></TableCell></TableRow>) : ranking?.employees.slice(offset, offset + 10).map(employee => <TableRow key={employee.employeeId} hover sx={{ '&:last-child td': { borderBottom: 0 } }}>
              <TableCell sx={{ pl: compact ? 1 : 2.5 }}>
                {employee.position <= 3 ? <Tooltip title={medals[employee.position - 1].label}>
                  <Avatar sx={{ width: 32, height: 32, bgcolor: medals[employee.position - 1].background, color: medals[employee.position - 1].color, border: '1px solid', borderColor: `${medals[employee.position - 1].color}40` }}>
                    <WorkspacePremiumOutlinedIcon sx={{ fontSize: 24 }} titleAccess={medals[employee.position - 1].label} />
                  </Avatar>
                </Tooltip> : <Avatar sx={{ width: 29, height: 29, fontSize: 13, fontWeight: 800, bgcolor: '#f1f5f9', color: '#64748b' }}>{employee.position}</Avatar>}
              </TableCell>
              <TableCell sx={{ py: 1.5, px: compact ? 0.75 : 2, height: 62 }}><Tooltip title={employee.name}><Typography variant="body2" noWrap={compact} sx={{ fontSize: compact ? 12 : undefined }} fontWeight={employee.position <= 3 ? 800 : 600}>{employee.name}</Typography></Tooltip></TableCell>
              <TableCell align="right" sx={{ pr: compact ? 1 : 2.5, pl: compact ? 0.5 : 2, minWidth: compact ? undefined : 115 }}><Typography fontWeight={800} variant="body2" sx={{ fontSize: compact ? 12 : undefined, fontVariantNumeric: 'tabular-nums', color: process.color }}>{number(employee.pounds)}</Typography><Box sx={{ height: 3, bgcolor: `${process.color}15`, borderRadius: 2, mt: 0.5 }}><Box sx={{ width: `${max ? employee.pounds / max * 100 : 0}%`, height: '100%', bgcolor: process.color, borderRadius: 2 }} /></Box></TableCell>
            </TableRow>)}</TableBody>
          </Table></TableContainer>)}
          </Box>
          {ranking && !ranking.employees.length && <Typography color="text.secondary" sx={{ p: 3, textAlign: 'center' }}>Sin libras registradas hoy.</Typography>}
          {ranking && <Typography component="div" variant="caption" color="text.secondary" sx={{ p: 2, borderTop: 1, borderColor: 'divider' }}>Actualizado {new Date(ranking.updatedAt).toLocaleString('es-HN', { timeZone: 'America/Tegucigalpa' })}</Typography>}
        </Paper>;
      })}
    </Box>
  </Stack>;
}
