import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Box, Button, Dialog, DialogActions, DialogContent, DialogTitle, IconButton, LinearProgress, Stack, TextField, Tooltip, Typography } from '@mui/material';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import FlagOutlinedIcon from '@mui/icons-material/FlagOutlined';
import { apiClient } from '../../api/client';
import { REFRESH_INTERVAL_MS } from '../../hooks/useDashboardData';
import { formatValue } from '../../utils/format';

const queryKey = ['pelado', 'meta-diaria'];
type GoalResponse = { goal: number | null };

export default function PeladoMetaDiaria({ total, loading, unavailable, canEdit }: { total: number; loading: boolean; unavailable: boolean; canEdit: boolean }) {
  const client = useQueryClient();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState('');
  const { data, isLoading, isError } = useQuery({
    queryKey,
    queryFn: async () => (await apiClient.get<GoalResponse>('/dashboard/pelado-meta-diaria')).data,
    refetchInterval: REFRESH_INTERVAL_MS,
  });
  const save = useMutation({
    mutationFn: async (goal: number) => (await apiClient.put<GoalResponse>('/dashboard/pelado-meta-diaria', { goal })).data,
    onSuccess: (value) => { client.setQueryData(queryKey, value); setOpen(false); },
  });
  const goal = data?.goal;
  const percent = goal ? Math.max(0, total / goal * 100) : 0;
  const reached = percent >= 100;
  const valid = draft.trim() !== '' && Number.isFinite(Number(draft)) && Number(draft) > 0 && Number(draft) <= 1_000_000_000;
  const [whole, fraction] = draft.split('.');
  const formattedDraft = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (fraction !== undefined ? `.${fraction}` : '');
  const edit = () => { setDraft(goal?.toString() ?? ''); save.reset(); setOpen(true); };

  return <>
    <Box sx={{ mt: 1, px: 1.5, py: 1, border: 1, borderColor: reached && !unavailable ? 'success.light' : 'divider', borderRadius: 1.5, bgcolor: 'background.paper' }}>
      <Stack direction="row" alignItems="center" spacing={1}>
        <FlagOutlinedIcon sx={{ fontSize: 18, color: reached && !unavailable ? 'success.main' : 'primary.main' }} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Stack direction="row" justifyContent="space-between" alignItems="baseline" useFlexGap flexWrap="wrap" gap={0.5}>
            <Typography variant="caption" fontWeight={800}>Meta diaria{goal ? ` · ${formatValue(goal)} lbs` : ''}</Typography>
            <Typography variant="caption" color={reached && !unavailable ? 'success.main' : 'text.secondary'} fontWeight={700} aria-live="polite">
              {isLoading ? 'Cargando meta…' : isError ? 'No se pudo cargar la meta' : !goal ? (canEdit ? 'Define tu objetivo en libras' : 'Meta pendiente de definir') : loading ? 'Cargando producción…' : unavailable ? 'Producción no disponible' : `${percent.toLocaleString('es-HN', { maximumFractionDigits: 1 })}% · ${reached ? '¡Meta alcanzada!' : `Faltan ${formatValue(Math.max(0, goal - total))} lbs`}`}
            </Typography>
          </Stack>
          <LinearProgress variant="determinate" value={goal && !loading && !unavailable ? Math.min(percent, 100) : 0} color={reached && !unavailable ? 'success' : 'primary'} aria-label="Avance de la meta diaria de pelado" sx={{ mt: 0.5, height: 6, borderRadius: 4, bgcolor: 'action.hover', '& .MuiLinearProgress-bar': { borderRadius: 4 } }} />
        </Box>
        {canEdit && <Tooltip title={goal ? 'Editar meta diaria' : 'Definir meta diaria'}>
          <IconButton size="small" onClick={edit} disabled={isLoading || isError} aria-label="Configurar meta diaria"><EditOutlinedIcon sx={{ fontSize: 17 }} /></IconButton>
        </Tooltip>}
      </Stack>
    </Box>
    <Dialog open={open && canEdit} onClose={() => { if (!save.isPending) setOpen(false); }} maxWidth={false} sx={{
      // The theme makes dialogs full-height on mobile; this editor stays compact.
      '& .MuiDialog-paper': {
        width: 'calc(100% - 48px)',
        maxWidth: '320px !important',
        height: 'auto',
        maxHeight: 'calc(100dvh - 48px)',
        minHeight: 0,
        m: 3,
        borderRadius: 2.5,
      },
    }}>
      <Box component="form" onSubmit={(event) => { event.preventDefault(); if (canEdit && valid && !save.isPending) save.mutate(Number(draft)); }}>
        <DialogTitle sx={{ px: 2, pt: 2, pb: 1, fontSize: 17, fontWeight: 800 }}>Meta diaria de pelado</DialogTitle>
        <DialogContent sx={{ px: 2, pb: 1 }}>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5, fontSize: 12 }}>Meta compartida para cada día, hasta que la cambies.</Typography>
          <TextField autoFocus fullWidth size="small" label="Meta en libras" type="text" value={formattedDraft} onChange={(event) => {
            const value = event.target.value.replace(/,/g, '');
            if (/^\d*(\.\d*)?$/.test(value)) setDraft(value.replace(/^0+(?=\d)/, ''));
          }} inputProps={{ inputMode: 'decimal' }} disabled={save.isPending} helperText="Ingresa una cantidad mayor que cero." />
          {save.isError && <Alert severity="error" sx={{ mt: 1.5 }}>No se pudo guardar la meta. Intenta de nuevo.</Alert>}
        </DialogContent>
        <DialogActions sx={{ px: 2, pb: 2, pt: 1 }}><Button size="small" onClick={() => setOpen(false)} disabled={save.isPending}>Cancelar</Button><Button size="small" type="submit" variant="contained" disabled={!valid || save.isPending}>{save.isPending ? 'Guardando…' : 'Guardar meta'}</Button></DialogActions>
      </Box>
    </Dialog>
  </>;
}
