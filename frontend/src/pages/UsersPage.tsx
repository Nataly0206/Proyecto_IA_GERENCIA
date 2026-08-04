import { FormEvent, useEffect, useState } from 'react';
import PersonAddOutlinedIcon from '@mui/icons-material/PersonAddOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import {
  Alert, Box, Button, Checkbox, Chip, CircularProgress, Dialog, DialogActions, DialogContent,
  DialogTitle, FormControlLabel, FormGroup, IconButton, Paper, Stack, Switch, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, TextField, Tooltip, Typography,
} from '@mui/material';
import axios from 'axios';
import { apiClient } from '../api/client';
import { AuthUser, normalizeAuthUser } from '../types/auth';
import { Permiso, PERMISOS, PERMISO_LABELS } from '../config/permissions';

function PermisosCheckboxes({ value, onChange }: { value: Permiso[]; onChange: (permisos: Permiso[]) => void }) {
  const toggle = (permiso: Permiso) => {
    onChange(value.includes(permiso) ? value.filter((p) => p !== permiso) : [...value, permiso]);
  };
  return (
    <Box>
      <Typography variant="body2" fontWeight={700} mb={0.5}>Permisos</Typography>
      <FormGroup>
        {PERMISOS.map((permiso) => (
          <FormControlLabel
            key={permiso}
            control={<Checkbox size="small" checked={value.includes(permiso)} onChange={() => toggle(permiso)} />}
            label={PERMISO_LABELS[permiso]}
          />
        ))}
      </FormGroup>
      {value.length === 0 && (
        <Typography variant="caption" color="text.secondary">
          Sin permisos, el usuario no verá ninguna sección al ingresar.
        </Typography>
      )}
    </Box>
  );
}

function CreateUserDialog({ open, onClose, onCreated }: {
  open: boolean;
  onClose: () => void;
  onCreated: (user: AuthUser) => void;
}) {
  const [form, setForm] = useState<{ usuario: string; nombre: string; correo: string; permisos: Permiso[] }>({
    usuario: '', nombre: '', correo: '', permisos: [],
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const reset = () => {
    setForm({ usuario: '', nombre: '', correo: '', permisos: [] });
    setError('');
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setLoading(true);
    setError('');
    try {
      const { data } = await apiClient.post<{ message: string; user: AuthUser }>('/users', form);
      onCreated(normalizeAuthUser(data.user));
      reset();
      onClose();
    } catch (requestError) {
      setError(axios.isAxiosError(requestError)
        ? requestError.response?.data?.error ?? 'No se pudo crear el usuario.'
        : 'No se pudo crear el usuario.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onClose={() => { reset(); onClose(); }} fullWidth maxWidth="xs">
      <DialogTitle>Nuevo usuario</DialogTitle>
      <Box component="form" onSubmit={submit}>
        <DialogContent>
          <Stack spacing={2}>
            {error && <Alert severity="error">{error}</Alert>}
            <TextField label="Usuario" value={form.usuario} required autoFocus
              onChange={(e) => setForm({ ...form, usuario: e.target.value })}
              helperText="Letras, números, punto, guion o guion bajo" />
            <TextField label="Nombre completo" value={form.nombre} required
              onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
            <TextField label="Correo electrónico" type="email" value={form.correo} required
              onChange={(e) => setForm({ ...form, correo: e.target.value })} />
            <PermisosCheckboxes value={form.permisos} onChange={(permisos) => setForm({ ...form, permisos })} />
            <Typography variant="caption" color="text.secondary">
              Recibirá por correo una contraseña temporal que deberá cambiar al ingresar.
            </Typography>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={() => { reset(); onClose(); }}>Cancelar</Button>
          <Button type="submit" variant="contained" startIcon={<PersonAddOutlinedIcon />}
            disabled={loading || !form.usuario || !form.nombre || !form.correo}>
            {loading ? <CircularProgress size={22} color="inherit" /> : 'Crear y enviar acceso'}
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}

function EditPermisosDialog({ user, onClose, onSaved }: {
  user: AuthUser | null;
  onClose: () => void;
  onSaved: (user: AuthUser) => void;
}) {
  const [permisos, setPermisos] = useState<Permiso[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (user) {
      setPermisos(user.permisos);
      setError('');
    }
  }, [user]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!user) return;
    setLoading(true);
    setError('');
    try {
      const { data } = await apiClient.patch<{ user: AuthUser }>(`/users/${user.id}/permisos`, { permisos });
      onSaved(normalizeAuthUser(data.user));
      onClose();
    } catch (requestError) {
      setError(axios.isAxiosError(requestError)
        ? requestError.response?.data?.error ?? 'No se pudieron guardar los permisos.'
        : 'No se pudieron guardar los permisos.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={Boolean(user)} onClose={onClose} fullWidth maxWidth="xs">
      <DialogTitle>Editar permisos{user ? ` — ${user.nombre}` : ''}</DialogTitle>
      <Box component="form" onSubmit={submit}>
        <DialogContent>
          <Stack spacing={2}>
            {error && <Alert severity="error">{error}</Alert>}
            <PermisosCheckboxes value={permisos} onChange={setPermisos} />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button onClick={onClose}>Cancelar</Button>
          <Button type="submit" variant="contained" disabled={loading}>
            {loading ? <CircularProgress size={22} color="inherit" /> : 'Guardar cambios'}
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}

export default function UsersPage() {
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [listError, setListError] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<AuthUser | null>(null);
  const [togglingId, setTogglingId] = useState('');
  const [toggleError, setToggleError] = useState('');

  useEffect(() => {
    apiClient.get<{ users: AuthUser[] }>('/users')
      .then(({ data }) => setUsers(data.users.map(normalizeAuthUser)))
      .catch(() => setListError('No se pudo cargar la lista de usuarios.'))
      .finally(() => setLoadingUsers(false));
  }, []);

  const upsertUser = (updated: AuthUser) => {
    setUsers((current) => {
      const exists = current.some((u) => u.id === updated.id);
      const next = exists ? current.map((u) => (u.id === updated.id ? updated : u)) : [...current, updated];
      return next.sort((a, b) => a.nombre.localeCompare(b.nombre));
    });
  };

  const toggleActivo = async (user: AuthUser) => {
    setTogglingId(user.id);
    setToggleError('');
    try {
      const { data } = await apiClient.patch<{ user: AuthUser }>(`/users/${user.id}/activo`, { activo: !user.activo });
      upsertUser(normalizeAuthUser(data.user));
    } catch (requestError) {
      setToggleError(axios.isAxiosError(requestError)
        ? requestError.response?.data?.error ?? 'No se pudo cambiar el estado del usuario.'
        : 'No se pudo cambiar el estado del usuario.');
    } finally {
      setTogglingId('');
    }
  };

  return (
    <Box sx={{ height: '100%', overflow: 'auto', py: 2 }}>
      <Stack direction="row" alignItems="flex-start" justifyContent="space-between" mb={2.5} flexWrap="wrap" rowGap={1.5}>
        <Stack spacing={0.5}>
          <Typography variant="h5" fontWeight={800}>Usuarios</Typography>
          <Typography color="text.secondary">Crea accesos y consulta quién puede ingresar al dashboard.</Typography>
        </Stack>
        <Button variant="contained" startIcon={<PersonAddOutlinedIcon />} onClick={() => setCreateOpen(true)}>
          Nuevo usuario
        </Button>
      </Stack>

      {toggleError && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setToggleError('')}>{toggleError}</Alert>}
      {listError && <Alert severity="error" sx={{ mb: 2 }}>{listError}</Alert>}

      <TableContainer component={Paper} elevation={0} sx={{ border: 1, borderColor: 'divider' }}>
        {loadingUsers ? <Box sx={{ p: 5, textAlign: 'center' }}><CircularProgress /></Box> : (
          <Table size="small">
            <TableHead><TableRow>
              <TableCell>Nombre</TableCell><TableCell>Usuario</TableCell>
              <TableCell>Correo</TableCell><TableCell>Permisos</TableCell>
              <TableCell>Estado</TableCell><TableCell align="right">Acciones</TableCell>
            </TableRow></TableHead>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.id} sx={{ opacity: user.activo ? 1 : 0.6 }}>
                  <TableCell sx={{ fontWeight: 700 }}>{user.nombre}</TableCell>
                  <TableCell>{user.usuario}</TableCell>
                  <TableCell>{user.correo}</TableCell>
                  <TableCell>
                    {user.esAdministrador ? (
                      <Chip size="small" label="Administrador (acceso total)" color="primary" variant="outlined" />
                    ) : user.permisos.length === 0 ? (
                      <Typography variant="caption" color="text.secondary">Sin permisos</Typography>
                    ) : (
                      <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap>
                        {user.permisos.map((permiso) => (
                          <Chip key={permiso} size="small" label={PERMISO_LABELS[permiso]} />
                        ))}
                      </Stack>
                    )}
                  </TableCell>
                  <TableCell>
                    {!user.activo ? 'Inactivo' : user.debeCambiarPassword ? 'Contraseña temporal' : 'Activo'}
                  </TableCell>
                  <TableCell align="right">
                    {!user.esAdministrador && (
                      <Stack direction="row" spacing={0.5} justifyContent="flex-end" alignItems="center">
                        <Tooltip title="Editar permisos">
                          <IconButton size="small" onClick={() => setEditingUser(user)}>
                            <EditOutlinedIcon fontSize="small" />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title={user.activo ? 'Inactivar' : 'Reactivar'}>
                          <span>
                            <Switch
                              size="small"
                              checked={user.activo}
                              disabled={togglingId === user.id}
                              onChange={() => toggleActivo(user)}
                            />
                          </span>
                        </Tooltip>
                      </Stack>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </TableContainer>

      <CreateUserDialog open={createOpen} onClose={() => setCreateOpen(false)} onCreated={upsertUser} />
      <EditPermisosDialog user={editingUser} onClose={() => setEditingUser(null)} onSaved={upsertUser} />
    </Box>
  );
}
