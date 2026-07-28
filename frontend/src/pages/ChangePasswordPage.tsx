import { FormEvent, useState } from 'react';
import { Alert, Box, Button, CircularProgress, Paper, Stack, TextField, Typography } from '@mui/material';
import axios from 'axios';
import { apiClient } from '../api/client';

interface Props {
  onChanged: () => void;
  onLogout: () => void;
}

export default function ChangePasswordPage({ onChanged, onLogout }: Props) {
  const [password, setPassword] = useState('');
  const [confirmacion, setConfirmacion] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    if (password !== confirmacion) {
      setError('Las contraseñas no coinciden.');
      return;
    }
    setLoading(true);
    try {
      await apiClient.post('/auth/change-password', { password, confirmacion });
      onChanged();
    } catch (requestError) {
      setError(axios.isAxiosError(requestError)
        ? requestError.response?.data?.error ?? 'No se pudo cambiar la contraseña.'
        : 'No se pudo cambiar la contraseña.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center', bgcolor: 'background.default', px: 2 }}>
      <Paper elevation={0} sx={{ width: '100%', maxWidth: 460, p: { xs: 3, sm: 5 }, border: 1, borderColor: 'divider' }}>
        <Stack component="form" spacing={2.5} onSubmit={submit}>
          <Box>
            <Typography variant="h5" fontWeight={800}>Crea una contraseña nueva</Typography>
            <Typography color="text.secondary" sx={{ mt: 0.75 }}>
              Esta contraseña temporal solo funciona para tu primer ingreso.
            </Typography>
          </Box>
          {error && <Alert severity="error">{error}</Alert>}
          <TextField label="Nueva contraseña" type="password" value={password}
            onChange={(event) => setPassword(event.target.value)} helperText="Mínimo 10 caracteres"
            autoComplete="new-password" autoFocus />
          <TextField label="Confirmar contraseña" type="password" value={confirmacion}
            onChange={(event) => setConfirmacion(event.target.value)} autoComplete="new-password" />
          <Button type="submit" variant="contained" size="large"
            disabled={loading || password.length < 10 || !confirmacion}>
            {loading ? <CircularProgress size={24} color="inherit" /> : 'Guardar y continuar'}
          </Button>
          <Button onClick={onLogout} color="inherit">Cerrar sesión</Button>
        </Stack>
      </Paper>
    </Box>
  );
}
