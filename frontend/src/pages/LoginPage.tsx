import { FormEvent, useState } from 'react';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import {
  Alert,
  Box,
  Button,
  CircularProgress,
  Paper,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import axios from 'axios';
import { apiClient } from '../api/client';
import { AuthUser } from '../types/auth';

interface LoginPageProps {
  onLogin: (user: AuthUser) => void;
}

export default function LoginPage({ onLogin }: LoginPageProps) {
  const [password, setPassword] = useState('');
  const [usuario, setUsuario] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!usuario || !password || loading) return;
    setLoading(true);
    setError('');
    try {
      const { data } = await apiClient.post<{ user: AuthUser }>('/auth/login', { usuario, password });
      onLogin(data.user);
    } catch (requestError) {
      if (axios.isAxiosError(requestError) && requestError.response?.status === 401) {
        setError('Usuario o contraseña incorrectos. Verifica e intenta de nuevo.');
      } else if (axios.isAxiosError(requestError) && requestError.response?.status === 429) {
        setError('Demasiados intentos. Espera unos minutos antes de volver a intentar.');
      } else {
        setError('No se pudo conectar con el servidor. Verifica que el backend esté encendido.');
      }
      setPassword('');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        bgcolor: 'background.default',
        px: 2,
      }}
    >
      <Paper elevation={0} sx={{ width: '100%', maxWidth: 420, p: { xs: 3, sm: 5 }, border: 1, borderColor: 'divider' }}>
        <Stack component="form" spacing={3} onSubmit={handleSubmit}>
          <Box
            sx={{
              width: 48,
              height: 48,
              display: 'grid',
              placeItems: 'center',
              borderRadius: 2,
              bgcolor: 'primary.main',
              color: 'primary.contrastText',
            }}
          >
            <LockOutlinedIcon />
          </Box>
          <Box>
            <Typography variant="h5" fontWeight={800}>Dashboard Gerencial</Typography>
            <Typography color="text.secondary" sx={{ mt: 0.75 }}>
              Ingresa tus credenciales para continuar.
            </Typography>
          </Box>
          {error && <Alert severity="error">{error}</Alert>}
          <TextField
            autoFocus
            fullWidth
            label="Usuario o correo"
            value={usuario}
            onChange={(event) => setUsuario(event.target.value)}
            autoComplete="username"
            disabled={loading}
          />
          <TextField
            fullWidth
            label="Contraseña"
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            autoComplete="current-password"
            disabled={loading}
          />
          <Button type="submit" size="large" variant="contained" disabled={!usuario || !password || loading}>
            {loading ? <CircularProgress size={24} color="inherit" /> : 'Entrar'}
          </Button>
        </Stack>
      </Paper>
    </Box>
  );
}
