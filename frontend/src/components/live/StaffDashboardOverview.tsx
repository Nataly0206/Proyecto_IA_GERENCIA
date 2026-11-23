import { Box, Button, ButtonBase, Chip, Paper, Stack, Typography } from '@mui/material';
import GroupsOutlinedIcon from '@mui/icons-material/GroupsOutlined';
import HowToRegOutlinedIcon from '@mui/icons-material/HowToRegOutlined';
import FingerprintOutlinedIcon from '@mui/icons-material/FingerprintOutlined';
import PendingActionsOutlinedIcon from '@mui/icons-material/PendingActionsOutlined';
import ArrowForwardOutlinedIcon from '@mui/icons-material/ArrowForwardOutlined';
import type { StaffEmployee } from '../../types/productionStaff';
import { staffDashboardGroups } from '../../utils/staffDashboard';

type Counts = {
  present: number; biometricMarked: number; biometricEntry: number; biometricReview: number;
  biometricWithoutPayment: number; checkedPeople: number; total: number; absent: number; absenceRate: number | null;
};
const number = (value: number) => value.toLocaleString('es-HN');
const panelSx = { borderRadius: 3, borderColor: '#e2e8f0', boxShadow: '0 3px 16px #0f172a04', minWidth: 0 };

export default function StaffDashboardOverview({ counts, people, groupOf, groupLabel, locationAvailable, absenceAvailable, dateLabel, currentDay, onEvidence, onGroup }: {
  counts: Counts; people: StaffEmployee[]; groupOf: (person: StaffEmployee) => string; groupLabel: string;
  locationAvailable: boolean; absenceAvailable: boolean; dateLabel: string; currentDay: boolean;
  onEvidence: (key: string) => void; onGroup: (label: string, rows: StaffEmployee[]) => void;
}) {
  const chartGroups = staffDashboardGroups(people, groupOf);
  const shownGroups = chartGroups.slice(0, 6);
  const maxGroup = Math.max(1, ...shownGroups.map(group => group.total));
  const ratio = counts.biometricMarked ? counts.biometricEntry / counts.biometricMarked : 0;
  const circumference = 2 * Math.PI * 59;
  const shifts = [
    { key: 'A', label: 'Turno A · Día', color: '#0d9488' },
    { key: 'B', label: 'Turno B · Noche', color: '#6366f1' },
    { key: 'Sin turno registrado', label: 'Sin turno confirmado', color: '#94a3b8' },
  ].map(shift => { const rows = people.filter(person => person.shift === shift.key); return { ...shift, rows, present: rows.filter(person => person.biometricEntry).length }; });
  const metrics = [
    { label: 'Asistieron · A', value: counts.present, detail: 'Según Chequeo · entrada confirmada', color: '#0f766e', background: '#eaf8f4', icon: HowToRegOutlinedIcon, key: 'entry' },
    { label: 'Según biométrico', value: counts.biometricMarked, detail: 'Personas con alguna marca del día', color: '#2563eb', background: '#eff6ff', icon: FingerprintOutlinedIcon, key: 'marked' },
    { label: 'Marca sin entrada', value: counts.biometricReview, detail: 'Revisar posible salida nocturna', color: '#b45309', background: '#fff7e8', icon: PendingActionsOutlinedIcon, key: 'review' },
    { label: 'Personal total', value: counts.total, detail: 'Padrón temporal · personas únicas', color: '#475569', background: '#f1f5f9', icon: GroupsOutlinedIcon, key: '' },
  ];
  return <Stack spacing={1.5}>
    <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1} useFlexGap flexWrap="wrap" sx={{ px: 0.25, pt: 0.5 }}>
      <Box><Typography variant="overline" sx={{ color: '#64748b', fontSize: 10, fontWeight: 800, letterSpacing: 1.5 }}>CONTROL DE PERSONAL</Typography><Typography fontSize={{ xs: 20, md: 24 }} fontWeight={800} color="#0f172a" lineHeight={1.2}>Resumen de asistencia</Typography></Box>
      <Stack direction="row" gap={1} alignItems="center"><Chip size="small" label={currentDay ? 'Jornada en curso' : 'Fecha consultada'} sx={{ bgcolor: currentDay ? '#eaf8f4' : '#f1f5f9', color: currentDay ? '#0f766e' : '#475569', fontWeight: 700, fontSize: 11 }} /><Typography variant="caption" color="text.secondary">{dateLabel}</Typography></Stack>
    </Stack>
    <Box aria-label="Resumen de asistencia" sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', lg: 'repeat(4, minmax(0, 1fr))' }, gap: 1.5 }}>
      {metrics.map(metric => <Paper key={metric.label} variant="outlined" sx={{ ...panelSx, overflow: 'hidden', borderTop: `3px solid ${metric.color}` }}>
        <ButtonBase onClick={() => onEvidence(metric.key)} aria-label={`${metric.label}: ${metric.value}, ver personas`} sx={{ width: '100%', display: 'block', textAlign: 'left', p: { xs: 1.5, md: 2 }, '&:hover': { bgcolor: metric.background }, '&.Mui-focusVisible': { outline: `2px solid ${metric.color}`, outlineOffset: -3 } }}>
          <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1}><Typography variant="body2" fontWeight={700} color="#475569">{metric.label}</Typography><Box sx={{ p: 0.75, borderRadius: 2, bgcolor: metric.background, color: metric.color, display: 'flex' }}><metric.icon fontSize="small" /></Box></Stack>
          <Typography sx={{ fontSize: { xs: 32, md: 42 }, lineHeight: 1.25, fontWeight: 800, letterSpacing: -1.5, color: metric.color, fontVariantNumeric: 'tabular-nums', mt: 0.5 }}>{number(metric.value)}</Typography>
          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 0.25, minHeight: 16 }}>{metric.detail}</Typography>
        </ButtonBase>
      </Paper>)}
    </Box>
    <Paper variant="outlined" sx={{ ...panelSx, p: 0.5 }}>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: 'repeat(2, minmax(0, 1fr))', md: 'repeat(4, minmax(0, 1fr))' } }}>
        {[
          { label: 'Chequeos de actividad', value: number(counts.checkedPeople), key: 'checks', color: '#6366f1' },
          { label: 'Con marca, sin pesado positivo', value: number(counts.biometricWithoutPayment), key: 'unpaid', color: '#0284c7' },
          { label: 'Faltaron · X', value: absenceAvailable ? number(counts.absent) : '—', key: 'absent', color: '#dc2626' },
          { label: 'Inasistencia', value: counts.absenceRate === null ? '—' : `${counts.absenceRate.toLocaleString('es-HN', { maximumFractionDigits: 2 })}%`, key: 'rate', color: '#64748b' },
        ].map(metric => <ButtonBase key={metric.key} onClick={() => metric.key === 'absent' ? onGroup('Faltas registradas', people.filter(person => person.status === 'absent')) : metric.key === 'rate' ? onGroup('Personal · estado de asistencia', people) : onEvidence(metric.key)} sx={{ textAlign: 'left', p: 1.25, justifyContent: 'space-between', gap: 1, borderRadius: 2, '&:hover': { bgcolor: '#f8fafc' } }}><Typography variant="caption" color="text.secondary">{metric.label}</Typography><Typography fontSize={20} fontWeight={800} color={metric.color} sx={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{metric.value}</Typography></ButtonBase>)}
      </Box>
    </Paper>
    <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: 'minmax(0, 0.9fr) minmax(0, 1.25fr)', lg: 'minmax(0, 0.85fr) minmax(0, 1.35fr) minmax(0, 1fr)' }, gap: 1.5 }}>
      <Paper variant="outlined" sx={{ ...panelSx, p: 2 }}>
        <Typography fontWeight={800} fontSize={14}>Confirmación de marcaciones</Typography><Typography variant="caption" color="text.secondary">Entradas confirmadas sobre personas con marca</Typography>
        <Box sx={{ position: 'relative', width: 166, height: 166, mx: 'auto', my: 1.5 }}>
          <svg viewBox="0 0 150 150" width="100%" height="100%" role="img" aria-label={`${counts.biometricEntry} con entrada y ${counts.biometricReview} con marca sin entrada de ${counts.biometricMarked} personas con marca`}>
            <circle cx="75" cy="75" r="59" fill="none" stroke={counts.biometricMarked ? '#fbbf24' : '#e2e8f0'} strokeWidth="13" />
            <circle cx="75" cy="75" r="59" fill="none" stroke="#0d9488" strokeWidth="13" strokeDasharray={`${ratio * circumference} ${circumference}`} transform="rotate(-90 75 75)" />
          </svg>
          <Stack sx={{ position: 'absolute', inset: 0, alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}><Typography fontSize={30} fontWeight={800} color="#0f172a">{counts.biometricMarked ? `${(ratio * 100).toFixed(1)}%` : '—'}</Typography><Typography variant="caption" color="text.secondary">con entrada</Typography></Stack>
        </Box>
        <Stack spacing={0.5}>{[{ key: 'entry', label: 'Según Chequeo', value: counts.biometricEntry, color: '#0d9488' }, { key: 'review', label: 'Sin entrada · revisar', value: counts.biometricReview, color: '#f59e0b' }].map(item => <ButtonBase key={item.key} onClick={() => onEvidence(item.key)} sx={{ width: '100%', justifyContent: 'space-between', p: 0.75, borderRadius: 1.5, '&:hover': { bgcolor: '#f8fafc' } }}><Stack direction="row" gap={0.75} alignItems="center"><Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: item.color }} /><Typography variant="caption">{item.label}</Typography></Stack><Typography fontWeight={800} fontSize={13}>{number(item.value)}</Typography></ButtonBase>)}</Stack>
      </Paper>
      <Paper variant="outlined" sx={{ ...panelSx, p: 2 }}>
        <Stack direction="row" justifyContent="space-between" alignItems="center"><Box><Typography fontWeight={800} fontSize={14}>Asistieron por {groupLabel}</Typography><Typography variant="caption" color="text.secondary">Hasta 6 grupos con más entradas confirmadas</Typography></Box><Chip size="small" label={`${chartGroups.length} grupos`} sx={{ fontSize: 10, bgcolor: '#f1f5f9' }} /></Stack>
        {!locationAvailable ? <Typography variant="body2" color="text.secondary" sx={{ py: 4 }}>Distribución no disponible. Actualiza para consultar las ubicaciones.</Typography> : !shownGroups.length ? <Typography variant="body2" color="text.secondary" sx={{ py: 4 }}>Sin personas para los filtros seleccionados.</Typography> : <Stack spacing={1.2} sx={{ mt: 2 }}>{shownGroups.map(group => <ButtonBase key={group.label} onClick={() => onGroup(group.label, group.rows)} sx={{ display: 'block', textAlign: 'left', borderRadius: 1, '&:hover': { bgcolor: '#f8fafc' }, p: 0.25 }}>
          <Stack direction="row" justifyContent="space-between" gap={1}><Typography fontSize={11.5} sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={group.label}>{group.label}</Typography><Typography fontSize={11.5} fontWeight={800} sx={{ whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>{number(group.present)} <Box component="span" sx={{ color: '#94a3b8', fontWeight: 500 }}>/ {number(group.total)}</Box></Typography></Stack>
          <Box sx={{ height: 7, mt: 0.6, borderRadius: 2, width: `${group.total / maxGroup * 100}%`, bgcolor: '#e2e8f0', minWidth: 2 }}><Box sx={{ height: '100%', width: `${group.total ? group.present / group.total * 100 : 0}%`, borderRadius: 2, bgcolor: '#0d9488' }} /></Box>
        </ButtonBase>)}</Stack>}
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.5 }}>Verde: asistieron · Gris: padrón del grupo. Pulsa para ver personas.</Typography>
      </Paper>
      <Paper variant="outlined" sx={{ ...panelSx, p: 2, gridColumn: { md: '1 / -1', lg: 'auto' } }}>
        <Typography fontWeight={800} fontSize={14}>Asistencia por turno</Typography><Typography variant="caption" color="text.secondary">Entradas confirmadas / personal del turno</Typography>
        <Stack spacing={2.5} sx={{ mt: 2.5 }}>{shifts.map(shift => <ButtonBase key={shift.key} onClick={() => onGroup(shift.label, shift.rows)} sx={{ display: 'block', width: '100%', textAlign: 'left', borderRadius: 1, p: 0.25, '&:hover': { bgcolor: '#f8fafc' } }}>
          <Stack direction="row" justifyContent="space-between" gap={1}><Typography fontSize={12} fontWeight={700}>{shift.label}</Typography><Typography fontSize={12} fontWeight={800}>{number(shift.present)} <Box component="span" sx={{ color: '#94a3b8' }}>/ {number(shift.rows.length)}</Box></Typography></Stack>
          <Box sx={{ height: 9, borderRadius: 2, bgcolor: '#edf2f7', mt: 0.75, overflow: 'hidden' }}><Box sx={{ width: `${shift.rows.length ? shift.present / shift.rows.length * 100 : 0}%`, height: '100%', bgcolor: shift.color, borderRadius: 2 }} /></Box>
        </ButtonBase>)}</Stack>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 2.5 }}>El resto del padrón incluye pendientes y novedades; no equivale a faltas.</Typography>
      </Paper>
    </Box>
    <Stack direction="row" justifyContent="space-between" alignItems="center" gap={1} useFlexGap flexWrap="wrap" sx={{ px: 0.5 }}><Typography variant="caption" color="text.secondary">Los contadores y gráficas respetan todos los filtros seleccionados.</Typography><Button size="small" endIcon={<ArrowForwardOutlinedIcon />} onClick={() => onEvidence('')} sx={{ textTransform: 'none', fontWeight: 700, fontSize: 12 }}>Buscar persona / recorrido</Button></Stack>
  </Stack>;
}
