import { useEffect, useState } from 'react';
import { Box, CircularProgress } from '@mui/material';
import DashboardLayout from './components/layout/DashboardLayout';
import DashboardPage from './pages/DashboardPage';
import LoginPage from './pages/LoginPage';
import { FiltersProvider } from './context/FiltersContext';
import { apiClient } from './api/client';

export default function App() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);

  useEffect(() => {
    apiClient.get<{ authenticated: boolean }>('/auth/status')
      .then(({ data }) => setAuthenticated(data.authenticated))
      .catch(() => setAuthenticated(false));
  }, []);

  const logout = async () => {
    try {
      await apiClient.post('/auth/logout');
    } finally {
      setAuthenticated(false);
    }
  };

  if (authenticated === null) {
    return <Box sx={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}><CircularProgress /></Box>;
  }
  if (!authenticated) return <LoginPage onLogin={() => setAuthenticated(true)} />;

  return (
    <FiltersProvider>
      <DashboardLayout onLogout={logout}>
        <DashboardPage />
      </DashboardLayout>
    </FiltersProvider>
  );
}
