import { useEffect, useState } from 'react';
import { Box, CircularProgress, Stack, Typography } from '@mui/material';
import LockOutlinedIcon from '@mui/icons-material/LockOutlined';
import DashboardLayout, { DashboardView } from './components/layout/DashboardLayout';
import DashboardPage from './pages/DashboardPage';
import PeladoPage from './pages/PeladoPage';
import LoginPage from './pages/LoginPage';
import ChangePasswordPage from './pages/ChangePasswordPage';
import UsersPage from './pages/UsersPage';
import { FiltersProvider } from './context/FiltersContext';
import { apiClient } from './api/client';
import { AuthUser, normalizeAuthUser } from './types/auth';
import { Permiso, tienePermiso } from './config/permissions';

const PERMISO_POR_VISTA: Record<DashboardView, Permiso> = {
  dashboard: 'iqf',
  pelado: 'pelado',
  users: 'usuarios',
};

/** Primera vista a la que el usuario tiene acceso, en orden de prioridad. */
function defaultView(user: AuthUser): DashboardView | null {
  return (Object.keys(PERMISO_POR_VISTA) as DashboardView[])
    .find((view) => tienePermiso(user, PERMISO_POR_VISTA[view])) ?? null;
}

function SinAcceso() {
  return (
    <Stack sx={{ height: '100%' }} alignItems="center" justifyContent="center" spacing={1.5}>
      <LockOutlinedIcon sx={{ fontSize: 40, color: 'text.disabled' }} />
      <Typography variant="h6" fontWeight={800}>Sin acceso</Typography>
      <Typography color="text.secondary" sx={{ maxWidth: 360, textAlign: 'center' }}>
        Tu usuario no tiene permisos asignados a ninguna sección. Contacta a un administrador.
      </Typography>
    </Stack>
  );
}

export default function App() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [currentView, setCurrentView] = useState<DashboardView | null>(null);

  useEffect(() => {
    apiClient.get<{ authenticated: boolean; user: AuthUser | null }>('/auth/status')
      .then(({ data }) => {
        const user = data.user ? normalizeAuthUser(data.user) : null;
        setAuthenticated(data.authenticated);
        setUser(user);
        if (user) setCurrentView(defaultView(user));
      })
      .catch(() => setAuthenticated(false));
  }, []);

  const logout = async () => {
    try {
      await apiClient.post('/auth/logout');
    } finally {
      setAuthenticated(false);
      setUser(null);
    }
  };

  if (authenticated === null) {
    return <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}><CircularProgress /></Box>;
  }
  if (!authenticated || !user) return <LoginPage onLogin={(loggedUser) => {
    const normalized = normalizeAuthUser(loggedUser);
    setUser(normalized);
    setAuthenticated(true);
    setCurrentView(defaultView(normalized));
  }} />;
  if (user.debeCambiarPassword) {
    return <ChangePasswordPage onLogout={logout} onChanged={() => setUser({ ...user, debeCambiarPassword: false })} />;
  }

  const view = currentView && tienePermiso(user, PERMISO_POR_VISTA[currentView]) ? currentView : defaultView(user);

  return (
    <FiltersProvider>
      <DashboardLayout
        onLogout={logout}
        user={user}
        currentView={view}
        onViewChange={setCurrentView}
      >
        {view === 'users' ? (
          <UsersPage />
        ) : view === 'pelado' ? (
          <PeladoPage />
        ) : view === 'dashboard' ? (
          <DashboardPage />
        ) : (
          <SinAcceso />
        )}
      </DashboardLayout>
    </FiltersProvider>
  );
}
