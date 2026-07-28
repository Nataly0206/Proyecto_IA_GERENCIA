import { useEffect, useState } from 'react';
import { Box, CircularProgress } from '@mui/material';
import DashboardLayout from './components/layout/DashboardLayout';
import DashboardPage from './pages/DashboardPage';
import LoginPage from './pages/LoginPage';
import ChangePasswordPage from './pages/ChangePasswordPage';
import UsersPage from './pages/UsersPage';
import { FiltersProvider } from './context/FiltersContext';
import { apiClient } from './api/client';
import { AuthUser } from './types/auth';

export default function App() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [currentView, setCurrentView] = useState<'dashboard' | 'users'>('dashboard');

  useEffect(() => {
    apiClient.get<{ authenticated: boolean; user: AuthUser | null }>('/auth/status')
      .then(({ data }) => {
        setAuthenticated(data.authenticated);
        setUser(data.user);
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
    setUser(loggedUser);
    setAuthenticated(true);
  }} />;
  if (user.debeCambiarPassword) {
    return <ChangePasswordPage onLogout={logout} onChanged={() => setUser({ ...user, debeCambiarPassword: false })} />;
  }

  return (
    <FiltersProvider>
      <DashboardLayout onLogout={logout} user={user} currentView={currentView} onViewChange={setCurrentView}>
        {currentView === 'users' && user.esAdministrador ? <UsersPage /> : <DashboardPage />}
      </DashboardLayout>
    </FiltersProvider>
  );
}
