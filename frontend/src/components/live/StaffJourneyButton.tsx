import { useState } from 'react';
import { Alert, Box, Button, Dialog, DialogContent, DialogTitle, Stack, Typography } from '@mui/material';
import type { StaffEmployee } from '../../types/productionStaff';

/** Cada tramo conserva las horas registradas; no se inventa el fin del anterior. */
export default function StaffJourneyButton({ person }: { person: StaffEmployee }) {
  const [open, setOpen] = useState(false);
  const checks = person.dailyActivities ?? [];
  const hour = (value: string | null) => value?.slice(0, 5) ?? 'Sin registrar';
  return <>
    <Button size="small" onClick={() => setOpen(true)} sx={{ display: 'block', textTransform: 'none', p: 0, mt: 0.5 }}>Ver recorrido · {checks.length} chequeos</Button>
    <Dialog open={open} onClose={() => setOpen(false)} fullWidth maxWidth="sm">
      <DialogTitle>Recorrido de {person.name}<Typography variant="caption" sx={{ display: 'block' }}>{person.code} · ID {person.id}</Typography></DialogTitle>
      <DialogContent>
        <Typography fontWeight={700}>Biométrico</Typography>
        <Typography variant="body2">Primera marca: {hour(person.firstPunch)} · Última marca: {hour(person.lastPunch)} · {person.punchCount} marcas</Typography>
        <Typography variant="body2">{person.biometricEntry ? 'Tiene entrada biométrica registrada.' : person.biometricMarked ? 'Tiene marcas, pero ninguna entrada registrada hoy.' : 'Sin marcas biométricas en esta fecha.'}</Typography>
        <Typography variant="body2">Pesado positivo: {person.hasPositivePayment ? 'Sí' : 'No'}</Typography>
        {person.biometricReview && <Alert severity="warning" sx={{ mt: 1 }}>Revisar posible salida del turno nocturno anterior. Una salida no confirma entrada hoy.</Alert>}
        <Typography fontWeight={700} sx={{ mt: 2 }}>Chequeos del día, en orden de inicio</Typography>
        <Typography variant="caption" color="text.secondary">Cada paso corresponde a una línea y actividad registradas. El último chequeo indica la última ubicación registrada.</Typography>
        {!checks.length && <Alert severity="info" sx={{ mt: 1 }}>Sin chequeos de actividad para esta fecha. La sala asignada o histórica no equivale a un recorrido comprobado.</Alert>}
        <Stack component="ol" spacing={1.5} sx={{ pl: 3, mt: 1.5 }}>
          {checks.map((check, index) => <Box component="li" key={`${index}:${check.start}:${check.line}`} sx={{ pl: 0.5 }}>
            <Typography fontWeight={700}>{hour(check.start)} → {hour(check.end)}</Typography>
            <Typography variant="body2">{check.line || 'Sin línea registrada'}</Typography>
            <Typography variant="body2">{check.area} · {check.process || 'Sin proceso registrado'}</Typography>
            <Typography variant="body2" color="text.secondary">{check.activity}{check.hours !== null ? ` · ${check.hours.toFixed(2)} h registradas` : ''}</Typography>
          </Box>)}
        </Stack>
        <Button onClick={() => setOpen(false)} sx={{ mt: 1 }}>Cerrar</Button>
      </DialogContent>
    </Dialog>
  </>;
}
