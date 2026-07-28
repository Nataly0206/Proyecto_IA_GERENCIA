import { FormEvent, useEffect, useState } from 'react';
import PersonAddOutlinedIcon from '@mui/icons-material/PersonAddOutlined';
import {
  Alert, Box, Button, CircularProgress, Paper, Stack, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow, TextField, Typography,
} from '@mui/material';
import axios from 'axios';
import { apiClient } from '../api/client';
import { AuthUser } from '../types/auth';

export default function UsersPage() {
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [form, setForm] = useState({ usuario: '', nombre: '', correo: '' });
  const [loading, setLoading] = useState(false);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const loadUsers = async () => {
    try {
      const { data } = await apiClient.get<{ users: AuthUser[] }>('/users');
      setUsers(data.users);
    } catch {
      setError('No se pudo cargar la lista de usuarios.');
    } finally {
      setLoadingUsers(false);
    }
  };
  useEffect(() => { void loadUsers(); }, []);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    setMessage('');
    try {
      const { data } = await apiClient.post<{ message: string; user: AuthUser }>('/users', form);
      setUsers((current) => [...current, data.user].sort((a, b) => a.nombre.localeCompare(b.nombre)));
      setForm({ usuario: '', nombre: '', correo: '' });
      setMessage(data.message);
    } catch (requestError) {
      setError(axios.isAxiosError(requestError)
        ? requestError.response?.data?.error ?? 'No se pudo crear el usuario.'
        : 'No se pudo crear el usuario.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box sx={{ height: '100%', overflow: 'auto', py: 2 }}>
      <Stack spacing={0.5} mb={2.5}>
        <Typography variant="h5" fontWeight={800}>Usuarios</Typography>
        <Typography color="text.secondary">Crea accesos y consulta quién puede ingresar al dashboard.</Typography>
      </Stack>
      <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', md: '360px 1fr' }, gap: 2 }}>
        <Paper component="form" onSubmit={submit} elevation={0}
          sx={{ p: 2.5, border: 1, borderColor: 'divider', alignSelf: 'start' }}>
          <Stack spacing={2}>
            <Stack direction="row" spacing={1} alignItems="center">
              <PersonAddOutlinedIcon color="primary" />
              <Typography variant="subtitle1" fontWeight={800}>Nuevo usuario</Typography>
            </Stack>
            {error && <Alert severity="error">{error}</Alert>}
            {message && <Alert severity="success">{message}</Alert>}
            <TextField label="Usuario" value={form.usuario} required
              onChange={(e) => setForm({ ...form, usuario: e.target.value })}
              helperText="Letras, números, punto, guion o guion bajo" />
            <TextField label="Nombre completo" value={form.nombre} required
              onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
            <TextField label="Correo electrónico" type="email" value={form.correo} required
              onChange={(e) => setForm({ ...form, correo: e.target.value })} />
            <Typography variant="caption" color="text.secondary">
              Recibirá por correo una contraseña temporal que deberá cambiar al ingresar.
            </Typography>
            <Button type="submit" variant="contained" startIcon={<PersonAddOutlinedIcon />}
              disabled={loading || !form.usuario || !form.nombre || !form.correo}>
              {loading ? <CircularProgress size={22} color="inherit" /> : 'Crear y enviar acceso'}
            </Button>
          </Stack>
        </Paper>
        <TableContainer component={Paper} elevation={0} sx={{ border: 1, borderColor: 'divider' }}>
          {loadingUsers ? <Box sx={{ p: 5, textAlign: 'center' }}><CircularProgress /></Box> : (
            <Table size="small">
              <TableHead><TableRow>
                <TableCell>Nombre</TableCell><TableCell>Usuario</TableCell>
                <TableCell>Correo</TableCell><TableCell>Estado</TableCell>
              </TableRow></TableHead>
              <TableBody>
                {users.map((user) => <TableRow key={user.id}>
                  <TableCell sx={{ fontWeight: 700 }}>{user.nombre}</TableCell>
                  <TableCell>{user.usuario}</TableCell><TableCell>{user.correo}</TableCell>
                  <TableCell>{user.debeCambiarPassword ? 'Contraseña temporal' : 'Activo'}</TableCell>
                </TableRow>)}
              </TableBody>
            </Table>
          )}
        </TableContainer>
      </Box>
    </Box>
  );
}
