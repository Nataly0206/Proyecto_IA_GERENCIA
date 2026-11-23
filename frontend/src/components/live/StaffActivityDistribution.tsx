import { useState } from 'react';
import { Alert, Box, Button, Checkbox, FormControlLabel, Paper, Stack, Table, TableBody, TableCell, TableContainer, TableFooter, TableHead, TableRow, ToggleButton, ToggleButtonGroup, Typography } from '@mui/material';
import type { StaffEmployee } from '../../types/productionStaff';
import { groupStaffActivities, type ActivityMode } from '../../utils/staffActivities';

export default function StaffActivityDistribution({ people, available, onSelect }: {
  people: StaffEmployee[]; available: boolean; onSelect: (label: string, rows: StaffEmployee[]) => void;
}) {
  const [mode, setMode] = useState<ActivityMode>('latest');
  const [onlyAttendance, setOnlyAttendance] = useState(true);
  const selected = people.filter(person => !onlyAttendance || person.biometricMarked || person.hasAttendance);
  const groups = groupStaffActivities(selected, mode);
  const count = (rows: StaffEmployee[], kind: string) => rows.filter(person => person.kind === kind).length;
  const checked = selected.filter(person => person.activityAssignment?.source === 'check').length;
  const weighed = selected.filter(person => person.activityAssignment?.source === 'weighing').length;
  const unknown = selected.filter(person => !person.activityAssignment || person.activityAssignment.source === 'unknown').length;
  const conflict = selected.filter(person => person.activityAssignment?.source === 'conflict').length;
  const values = (rows: StaffEmployee[]) => <>
    <TableCell align="right" sx={{ fontWeight: 800 }}>{rows.length}</TableCell>
    <TableCell align="right">{rows.filter(person => person.biometricMarked).length}</TableCell>
    <TableCell align="right">{rows.filter(person => person.biometricEntry).length}</TableCell>
    <TableCell align="right">{count(rows, 'production')}</TableCell>
    <TableCell align="right">{count(rows, 'auxiliary')}</TableCell>
    <TableCell align="right">{count(rows, 'machine')}</TableCell>
    <TableCell align="right">{count(rows, 'supervisor')}</TableCell>
  </>;
  return <Paper variant="outlined" sx={{ borderRadius: 3, borderColor: '#e2e8f0', overflow: 'hidden' }}>
    <Stack spacing={1} sx={{ p: 1.5 }}>
      <Typography fontWeight={800}>Distribución del personal por actividad</Typography>
      <Stack direction="row" gap={1} useFlexGap flexWrap="wrap" alignItems="center">
        <ToggleButtonGroup size="small" exclusive value={mode} onChange={(_, value) => value && setMode(value)} aria-label="Conteo de personas por actividad" sx={{ '& button': { textTransform: 'none' } }}>
          <ToggleButton value="latest">Última registrada</ToggleButton><ToggleButton value="visited">Participaron durante el día</ToggleButton>
        </ToggleButtonGroup>
        <FormControlLabel control={<Checkbox size="small" checked={onlyAttendance} onChange={(_, checked) => setOnlyAttendance(checked)} />} label={<Typography variant="caption">Solo con marca, pesa o chequeo</Typography>} />
      </Stack>
      <Typography variant="caption" color="text.secondary">
        {mode === 'latest' ? 'Cada persona cuenta en una sola actividad: su último chequeo del día. Una pesa sin chequeo identifica el proceso. La última actividad registrada no implica permanencia actual.' : 'Cada persona cuenta una vez en cada actividad y proceso en los que fue chequeada. Puede aparecer en varias filas; el total inferior cuenta personas únicas.'}
      </Typography>
      {available && <Typography variant="caption">{selected.length} personas · {checked} con actividad de chequeo · {weighed} solo con proceso de pesa · {unknown} sin actividad · {conflict} por confirmar</Typography>}
    </Stack>
    {!available ? <Alert severity="warning" sx={{ m: 1.5 }}>No se pudieron cargar las actividades. Actualiza para consultar su distribución.</Alert> : <>
      <TableContainer sx={{ maxHeight: 480 }}><Table size="small" stickyHeader aria-label="Personas por actividad y proceso" sx={{ minWidth: 840, '& th': { bgcolor: '#f1f5f9', fontWeight: 800 }, '& td, & th': { fontSize: 12 } }}>
        <TableHead><TableRow><TableCell>Proceso / actividad</TableCell><TableCell align="right">Personas</TableCell><TableCell align="right">Con marca</TableCell><TableCell align="right">Con entrada</TableCell><TableCell align="right">Obra</TableCell><TableCell align="right">Auxiliares</TableCell><TableCell align="right">Máquinas</TableCell><TableCell align="right">Supervisores</TableCell></TableRow></TableHead>
        <TableBody>{groups.map(group => <TableRow key={group.key} hover>
          <TableCell><Button size="small" onClick={() => onSelect([group.process, group.activity].filter(Boolean).join(' · '), group.people)} sx={{ p: 0, textAlign: 'left', justifyContent: 'flex-start', textTransform: 'none' }}>{group.activity}</Button>{group.process && <Typography variant="caption" sx={{ display: 'block' }}>{group.process}</Typography>}{!!group.lines.length && <Typography variant="caption" color="text.secondary" sx={{ display: 'block', maxWidth: 340 }}>{group.lines.join(' · ')}</Typography>}</TableCell>
          {values(group.people)}
        </TableRow>)}</TableBody>
        <TableFooter><TableRow sx={{ '& td': { bgcolor: '#f1f5f9', fontWeight: 800 } }}><TableCell>Total de personas únicas</TableCell>{values(selected)}</TableRow></TableFooter>
      </Table></TableContainer>
      {!selected.length && <Box sx={{ p: 1.5 }}><Typography variant="body2">Sin personas para la fecha, turno y filtros seleccionados.</Typography></Box>}
    </>}
  </Paper>;
}
