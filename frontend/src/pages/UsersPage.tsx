import { FormEvent, useEffect, useState } from 'react';
import PersonAddOutlinedIcon from '@mui/icons-material/PersonAddOutlined';
import EditOutlinedIcon from '@mui/icons-material/EditOutlined';
import SearchOutlinedIcon from '@mui/icons-material/SearchOutlined';
import DeleteOutlineIcon from '@mui/icons-material/DeleteOutline';
import {
  Alert, Box, Button, Checkbox, Chip, CircularProgress, Dialog, DialogActions, DialogContent,
  DialogTitle, FormControlLabel, FormGroup, IconButton, InputAdornment, Paper, Stack, Switch, Table, TableBody,
  TableCell, TableContainer, TableHead, TableRow, TextField, Tooltip, Typography, useMediaQuery, useTheme,
} from '@mui/material';
import axios from 'axios';
import { apiClient } from '../api/client';
import { AuthUser, normalizeAuthUser } from '../types/auth';
import { Permiso, PERMISOS, PERMISO_LABELS } from '../config/permissions';

const normalizeSearch = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();

function PermisosCheckboxes({ value, onChange, disabled = false }: { value: Permiso[]; onChange: (permisos: Permiso[]) => void; disabled?: boolean }) {
  const [search, setSearch] = useState('');
  const needle = normalizeSearch(search);
  const visiblePermissions = PERMISOS.filter(permission => !needle || normalizeSearch(PERMISO_LABELS[permission]).includes(needle));
  const select = (permissions: Permiso[], checked: boolean) => {
    const next = new Set(value);
    permissions.forEach(permission => checked ? next.add(permission) : next.delete(permission));
    onChange(PERMISOS.filter(permission => next.has(permission)));
  };
  return <Stack spacing={1.5}>
    <Stack direction="row" alignItems="center" justifyContent="space-between" gap={1} flexWrap="wrap">
      <Box><Typography fontWeight={800}>Accesos del usuario</Typography><Typography variant="caption" color="text.secondary">Selecciona los módulos a los que tendrá acceso.</Typography></Box>
      <Chip size="small" color="primary" variant="outlined" label={`${value.length} de ${PERMISOS.length} asignados`} />
    </Stack>
    <TextField size="small" fullWidth label="Buscar permiso" placeholder="Ej. Cargas, Pelado, Productividad…" value={search} disabled={disabled} onChange={event => setSearch(event.target.value)} InputProps={{ startAdornment: <InputAdornment position="start"><SearchOutlinedIcon fontSize="small" /></InputAdornment> }} />
    <Stack direction="row" alignItems="center" spacing={1} flexWrap="wrap" useFlexGap>
      <Button size="small" disabled={disabled || !visiblePermissions.some(permission => !value.includes(permission))} onClick={() => select(visiblePermissions, true)}>{needle ? 'Seleccionar resultados' : 'Seleccionar todos'}</Button>
      <Button size="small" color="inherit" disabled={disabled || !visiblePermissions.some(permission => value.includes(permission))} onClick={() => select(visiblePermissions, false)}>{needle ? 'Quitar resultados' : 'Quitar todos'}</Button>
      {needle && <Typography variant="caption" color="text.secondary">{visiblePermissions.length} resultados</Typography>}
    </Stack>
    <FormGroup sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: '1fr 1fr 1fr' }, gap: 0.75 }}>
      {visiblePermissions.map(permission => <FormControlLabel key={permission} sx={{ m: 0, px: 0.5, py: 0.5, minHeight: 44, borderRadius: 1, bgcolor: value.includes(permission) ? 'rgba(25,118,210,.045)' : undefined, '&:hover': { bgcolor: 'action.hover' }, '& .MuiFormControlLabel-label': { fontSize: 13 } }} control={<Checkbox size="small" disabled={disabled} checked={value.includes(permission)} onChange={(_, checked) => select([permission], checked)} />} label={PERMISO_LABELS[permission]} />)}
    </FormGroup>
    {!visiblePermissions.length && <Typography color="text.secondary" sx={{ py: 2, textAlign: 'center' }}>No se encontraron permisos. <Button size="small" onClick={() => setSearch('')}>Limpiar búsqueda</Button></Typography>}
    {value.length === 0 && <Typography variant="caption" color="text.secondary">Sin permisos, el usuario no verá ninguna sección al ingresar.</Typography>}
  </Stack>;
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
    <Dialog open={open} onClose={() => { if (!loading) { reset(); onClose(); } }} fullWidth maxWidth="md">
      <DialogTitle>Nuevo usuario</DialogTitle>
      <Box component="form" onSubmit={submit} sx={{ display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
        <DialogContent dividers>
          <Stack spacing={2}>
            {error && <Alert severity="error">{error}</Alert>}
            <TextField label="Usuario" value={form.usuario} required autoFocus
              onChange={(e) => setForm({ ...form, usuario: e.target.value })}
              helperText="Letras, números, punto, guion o guion bajo" />
            <TextField label="Nombre completo" value={form.nombre} required
              onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
            <TextField label="Correo electrónico" type="email" value={form.correo} required
              onChange={(e) => setForm({ ...form, correo: e.target.value })} />
            <PermisosCheckboxes disabled={loading} value={form.permisos} onChange={(permisos) => setForm({ ...form, permisos })} />
            <Typography variant="caption" color="text.secondary">
              Recibirá por correo una contraseña temporal que deberá cambiar al ingresar.
            </Typography>
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button disabled={loading} onClick={() => { reset(); onClose(); }}>Cancelar</Button>
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
    <Dialog open={Boolean(user)} onClose={() => { if (!loading) onClose(); }} fullWidth maxWidth="md">
      <DialogTitle>Editar permisos{user ? ` — ${user.nombre}` : ''}</DialogTitle>
      <Box component="form" onSubmit={submit} sx={{ display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
        <DialogContent dividers>
          <Stack spacing={2}>
            {error && <Alert severity="error">{error}</Alert>}
            <PermisosCheckboxes key={user?.id} disabled={loading} value={permisos} onChange={setPermisos} />
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button disabled={loading} onClick={onClose}>Cancelar</Button>
          <Button type="submit" variant="contained" disabled={loading}>
            {loading ? <CircularProgress size={22} color="inherit" /> : 'Guardar cambios'}
          </Button>
        </DialogActions>
      </Box>
    </Dialog>
  );
}

interface UsersPageProps {
  currentUserId: string;
  onCurrentUserUpdated: (user: AuthUser) => void;
}

export default function UsersPage({ currentUserId, onCurrentUserUpdated }: UsersPageProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const [users, setUsers] = useState<AuthUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [listError, setListError] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<AuthUser | null>(null);
  const [togglingId, setTogglingId] = useState('');
  const [toggleError, setToggleError] = useState('');
  const [deletingUser, setDeletingUser] = useState<AuthUser | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [success, setSuccess] = useState('');

  const confirmDelete = async () => {
    if (!deletingUser || deleting) return;
    setDeleting(true);
    setDeleteError('');
    try {
      await apiClient.delete(`/users/${deletingUser.id}`);
      if (deletingUser.id === currentUserId) {
        window.location.reload();
        return;
      }
      setUsers((current) => current.filter((user) => user.id !== deletingUser.id));
      setSuccess(`El usuario ${deletingUser.usuario} fue eliminado.`);
      setDeletingUser(null);
    } catch (requestError) {
      setDeleteError(axios.isAxiosError(requestError)
        ? requestError.response?.data?.error ?? 'No se pudo eliminar el usuario.'
        : 'No se pudo eliminar el usuario.');
    } finally {
      setDeleting(false);
    }
  };

  const openDelete = (user: AuthUser) => {
    setDeleteError('');
    setSuccess('');
    setDeletingUser(user);
  };

  useEffect(() => {
    apiClient.get<{ users: AuthUser[] }>('/users')
      .then(({ data }) => setUsers(data.users.map(normalizeAuthUser)))
      .catch(() => setListError('No se pudo cargar la lista de usuarios.'))
      .finally(() => setLoadingUsers(false));
  }, []);

  const upsertUser = (updated: AuthUser) => {
    if (updated.id === currentUserId) onCurrentUserUpdated(updated);
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
    <Box sx={{ height: '100%', overflow: 'auto', py: { xs: 1, sm: 2 }, pb: { xs: 3, sm: 2 } }}>
      <Stack direction="row" alignItems="flex-start" justifyContent="space-between" mb={2.5} flexWrap="wrap" rowGap={1.5}>
        <Stack spacing={0.5}>
          <Typography variant="h5" fontWeight={800} sx={{ fontSize: { xs: 22, sm: 24 } }}>Usuarios</Typography>
          <Typography color="text.secondary" sx={{ fontSize: { xs: 14, sm: 16 } }}>Crea accesos y consulta quién puede ingresar al dashboard.</Typography>
        </Stack>
        <Button variant="contained" startIcon={<PersonAddOutlinedIcon />} onClick={() => setCreateOpen(true)}>
          Nuevo usuario
        </Button>
      </Stack>

      {toggleError && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setToggleError('')}>{toggleError}</Alert>}
      {listError && <Alert severity="error" sx={{ mb: 2 }}>{listError}</Alert>}
      {success && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setSuccess('')}>{success}</Alert>}

      {loadingUsers ? <Paper elevation={0} sx={{ p: 5, textAlign: 'center', border: 1, borderColor: 'divider' }}><CircularProgress /></Paper> : isMobile ? (
        <Stack spacing={1.25}>
          {users.map((user) => (
            <Paper key={user.id} elevation={0} sx={{ p: 1.5, border: 1, borderColor: 'divider', opacity: user.activo ? 1 : 0.65 }}>
              <Stack direction="row" alignItems="flex-start" justifyContent="space-between" spacing={1}>
                <Box sx={{ minWidth: 0 }}>
                  <Typography fontWeight={800} noWrap>{user.nombre}</Typography>
                  <Typography variant="body2" color="text.secondary" noWrap>@{user.usuario}</Typography>
                </Box>
                <Chip
                  size="small"
                  color={user.activo ? (user.debeCambiarPassword ? 'warning' : 'success') : 'default'}
                  label={!user.activo ? 'Inactivo' : user.debeCambiarPassword ? 'Clave temporal' : 'Activo'}
                  variant="outlined"
                />
              </Stack>
              <Typography variant="body2" sx={{ mt: 1, overflowWrap: 'anywhere' }}>{user.correo}</Typography>
              <Stack direction="row" spacing={0.5} flexWrap="wrap" useFlexGap sx={{ mt: 1.25 }}>
                <Chip size="small" label={`${user.esAdministrador ? PERMISOS.length : user.permisos.length} ${(user.esAdministrador ? PERMISOS.length : user.permisos.length) === 1 ? 'Permiso' : 'Permisos'}`} />
              </Stack>
              {!user.esAdministrador && (
                <Stack direction="row" alignItems="center" justifyContent="space-between" sx={{ mt: 1.25, pt: 1, borderTop: 1, borderColor: 'divider' }}>
                  <Button size="small" startIcon={<EditOutlinedIcon />} onClick={() => setEditingUser(user)}>Editar permisos</Button>
                  <Stack direction="row" alignItems="center" spacing={0.5}>
                    <Typography variant="caption" color="text.secondary">{user.activo ? 'Activo' : 'Inactivo'}</Typography>
                    <Switch size="small" checked={user.activo} disabled={togglingId === user.id} onChange={() => toggleActivo(user)} />
                  </Stack>
                </Stack>
              )}
                <Button size="small" color="error" startIcon={<DeleteOutlineIcon />}
                  sx={{ mt: 1 }} disabled={togglingId === user.id} onClick={() => openDelete(user)}>
                  Eliminar usuario
                </Button>
            </Paper>
          ))}
        </Stack>
      ) : (
        <TableContainer component={Paper} elevation={0} sx={{ border: 1, borderColor: 'divider', overflowX: 'auto' }}>
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
                    <Chip size="small" label={`${user.esAdministrador ? PERMISOS.length : user.permisos.length} ${(user.esAdministrador ? PERMISOS.length : user.permisos.length) === 1 ? 'Permiso' : 'Permisos'}`} />
                  </TableCell>
                  <TableCell>
                    {!user.activo ? 'Inactivo' : user.debeCambiarPassword ? 'Contraseña temporal' : 'Activo'}
                  </TableCell>
                  <TableCell align="right">
                      <Stack direction="row" spacing={0.5} justifyContent="flex-end" alignItems="center">
                        {!user.esAdministrador && (<>
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
                        </>)}
                          <Tooltip title="Eliminar usuario">
                            <span>
                              <IconButton size="small" color="error" aria-label={`Eliminar usuario ${user.usuario}`}
                                disabled={togglingId === user.id} onClick={() => openDelete(user)}>
                                <DeleteOutlineIcon fontSize="small" />
                              </IconButton>
                            </span>
                          </Tooltip>
                      </Stack>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      <CreateUserDialog open={createOpen} onClose={() => setCreateOpen(false)} onCreated={upsertUser} />
      <EditPermisosDialog user={editingUser} onClose={() => setEditingUser(null)} onSaved={upsertUser} />
      <Dialog open={Boolean(deletingUser)} onClose={() => { if (!deleting) setDeletingUser(null); }}
        fullWidth maxWidth="xs" aria-labelledby="delete-user-title">
        <DialogTitle id="delete-user-title">Eliminar usuario</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2}>
            {deleteError && <Alert severity="error">{deleteError}</Alert>}
            <Typography>¿Deseas eliminar a {deletingUser?.nombre} (@{deletingUser?.usuario})?</Typography>
            <Typography variant="body2" color="text.secondary">
              Se eliminarán su cuenta y sus accesos. Esta acción no se puede deshacer.
            </Typography>
            {deletingUser?.id === currentUserId && (
              <Alert severity="warning">Estás eliminando tu propia cuenta. Tu sesión se cerrará.</Alert>
            )}
          </Stack>
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2.5 }}>
          <Button disabled={deleting} onClick={() => setDeletingUser(null)}>Cancelar</Button>
          <Button variant="contained" color="error" disabled={deleting} onClick={confirmDelete}
            startIcon={deleting ? <CircularProgress size={18} color="inherit" /> : <DeleteOutlineIcon />}>
            {deleting ? 'Eliminando…' : 'Eliminar usuario'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
