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
  const [mode, setMode] = useState<'login' | 'request' | 'reset'>('login');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [code, setCode] = useState('');
  const [usuario, setUsuario] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
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

  const requestCode = async (event: FormEvent) => {
    event.preventDefault();
    if (!usuario.trim() || loading) return;
    setLoading(true);
    setError('');
    setMessage('');
    try {
      const { data } = await apiClient.post<{ message: string }>('/auth/forgot-password', {
        identifier: usuario,
      });
      setMessage(data.message);
      setMode('reset');
    } catch (requestError) {
      setError(axios.isAxiosError(requestError)
        ? requestError.response?.data?.error ?? 'No se pudo solicitar el código.'
        : 'No se pudo solicitar el código.');
    } finally {
      setLoading(false);
    }
  };

  const resetPassword = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    if (password !== confirmation) {
      setError('Las contraseñas no coinciden.');
      return;
    }
    setLoading(true);
    try {
      const { data } = await apiClient.post<{ message: string }>('/auth/reset-password', {
        identifier: usuario,
        code,
        password,
        confirmation,
      });
      setMode('login');
      setCode('');
      setPassword('');
      setConfirmation('');
      setMessage(data.message);
    } catch (requestError) {
      setError(axios.isAxiosError(requestError)
        ? requestError.response?.data?.error ?? 'No se pudo restablecer la contraseña.'
        : 'No se pudo restablecer la contraseña.');
    } finally {
      setLoading(false);
    }
  };

  const showLogin = () => {
    setMode('login');
    setError('');
    setMessage('');
    setCode('');
    setPassword('');
    setConfirmation('');
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
        <Stack component="form" spacing={3} onSubmit={mode === 'login' ? handleSubmit : mode === 'request' ? requestCode : resetPassword}>
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
            <Typography variant="h5" fontWeight={800}>
              {mode === 'login' ? 'Dashboard Gerencial' : mode === 'request' ? 'Recupera tu contraseña' : 'Ingresa el código'}
            </Typography>
            <Typography color="text.secondary" sx={{ mt: 0.75 }}>
              {mode === 'login' && 'Ingresa tus credenciales para continuar.'}
              {mode === 'request' && 'Escribe tu usuario y enviaremos un código al correo registrado en tu cuenta.'}
              {mode === 'reset' && 'Escribe el código recibido y crea una contraseña nueva.'}
            </Typography>
          </Box>
          {error && <Alert severity="error">{error}</Alert>}
          {message && <Alert severity="success">{message}</Alert>}
          <TextField
            autoFocus
            fullWidth
            label={mode === 'login' ? 'Usuario o correo' : 'Usuario'}
            value={usuario}
            onChange={(event) => setUsuario(event.target.value)}
            autoComplete="username"
            disabled={loading || mode === 'reset'}
          />
          {mode === 'login' && <>
            <TextField fullWidth label="Contraseña" type="password" value={password}
              onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" disabled={loading} />
            <Button type="submit" size="large" variant="contained" disabled={!usuario || !password || loading}>
              {loading ? <CircularProgress size={24} color="inherit" /> : 'Entrar'}
            </Button>
            <Button type="button" variant="text" onClick={() => { setMode('request'); setError(''); setMessage(''); setPassword(''); }}>
              ¿Olvidaste tu contraseña?
            </Button>
          </>}
          {mode === 'request' && <>
            <Button type="submit" size="large" variant="contained" disabled={!usuario.trim() || loading}>
              {loading ? <CircularProgress size={24} color="inherit" /> : 'Enviar código'}
            </Button>
            <Button type="button" color="inherit" onClick={showLogin}>Volver al inicio de sesión</Button>
          </>}
          {mode === 'reset' && <>
            <TextField fullWidth label="Código de 6 dígitos" value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
              inputProps={{ inputMode: 'numeric', maxLength: 6 }} autoComplete="one-time-code" autoFocus disabled={loading} />
            <TextField fullWidth label="Nueva contraseña" type="password" value={password}
              onChange={(event) => setPassword(event.target.value)} helperText="Mínimo 10 caracteres"
              autoComplete="new-password" disabled={loading} />
            <TextField fullWidth label="Confirmar contraseña" type="password" value={confirmation}
              onChange={(event) => setConfirmation(event.target.value)} autoComplete="new-password" disabled={loading} />
            <Button type="submit" size="large" variant="contained"
              disabled={code.length !== 6 || password.length < 10 || !confirmation || loading}>
              {loading ? <CircularProgress size={24} color="inherit" /> : 'Guardar nueva contraseña'}
            </Button>
            <Button type="button" color="inherit" onClick={() => { setMode('request'); setError(''); setMessage(''); }}>
              Solicitar otro código
            </Button>
            <Button type="button" color="inherit" onClick={showLogin}>Volver al inicio de sesión</Button>
          </>}
        </Stack>
      </Paper>
    </Box>
  );
}
