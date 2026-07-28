import { ReactNode, useState } from 'react';
import {
  AppBar,
  Box,
  Button,
  Container,
  Divider,
  Drawer,
  IconButton,
  Stack,
  Toolbar,
  Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import RefreshOutlinedIcon from '@mui/icons-material/RefreshOutlined';
import TuneOutlinedIcon from '@mui/icons-material/TuneOutlined';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import LogoutOutlinedIcon from '@mui/icons-material/LogoutOutlined';
import PeopleOutlineIcon from '@mui/icons-material/PeopleOutline';
import DashboardOutlinedIcon from '@mui/icons-material/DashboardOutlined';
import { AuthUser } from '../../types/auth';
import AiAssistantPanel from '../ai/AiAssistantPanel';
import GlobalFilters from '../filters/GlobalFilters';
import { useRefreshDashboard } from '../../hooks/useDashboardData';

interface DashboardLayoutProps {
  children: ReactNode;
  onLogout: () => void;
  user: AuthUser;
  currentView: 'dashboard' | 'users';
  onViewChange: (view: 'dashboard' | 'users') => void;
}

export default function DashboardLayout({ children, onLogout, user, currentView, onViewChange }: DashboardLayoutProps) {
  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshFailed, setRefreshFailed] = useState(false);
  const refreshDashboard = useRefreshDashboard();

  const handleRefresh = async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    setRefreshFailed(false);
    try {
      await refreshDashboard();
    } catch {
      setRefreshFailed(true);
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column', bgcolor: 'background.default' }}>
      <AppBar position="static" elevation={0}>
        <Toolbar
          variant="dense"
          disableGutters
          sx={{
            px: { xs: 1.5, sm: 2, md: 3 },
            py: { xs: 1, sm: 0 },
            minHeight: 46,
            gap: { xs: 0.75, sm: 1.5 },
            flexWrap: { xs: 'wrap', sm: 'nowrap' },
          }}
        >
          <Stack direction="row" alignItems="center" spacing={1} sx={{ flexGrow: 1, minWidth: { xs: 'calc(100% - 38px)', sm: 180 } }}>
            <Box
              sx={{
                width: 6,
                height: 22,
                borderRadius: 1,
                bgcolor: 'primary.main',
                flexShrink: 0,
              }}
            />
            <Typography
              variant="subtitle1"
              fontWeight={800}
              sx={{ letterSpacing: 0, color: 'text.primary', fontSize: { xs: 17, sm: 16 }, whiteSpace: 'nowrap' }}
            >
              Dashboard Gerencial
            </Typography>
            <Typography
              variant="caption"
              sx={{
                color: 'text.secondary',
                fontWeight: 600,
                display: { xs: 'none', sm: 'block' },
              }}
            >
              ESF Seafood
            </Typography>
          </Stack>
          <Button
            size="small"
            color="inherit"
            startIcon={currentView === 'dashboard' ? <PeopleOutlineIcon /> : <DashboardOutlinedIcon />}
            onClick={() => onViewChange(currentView === 'dashboard' ? 'users' : 'dashboard')}
            sx={{ display: user.esAdministrador ? 'inline-flex' : 'none', fontWeight: 700 }}
          >
            {currentView === 'dashboard' ? 'Usuarios' : 'Dashboard'}
          </Button>

          <Button
            size="small"
            variant="outlined"
            color={refreshFailed ? 'error' : 'primary'}
            startIcon={
              <RefreshOutlinedIcon
                sx={{
                  fontSize: '15px !important',
                  animation: isRefreshing ? 'refresh-spin 0.8s linear infinite' : 'none',
                  '@keyframes refresh-spin': {
                    from: { transform: 'rotate(0deg)' },
                    to: { transform: 'rotate(360deg)' },
                  },
                }}
              />
            }
            disabled={isRefreshing}
            onClick={handleRefresh}
            sx={{
              order: { xs: 2, sm: 'initial' },
              flex: { xs: 1, sm: 'initial' },
              minWidth: 0,
              px: { xs: 1, sm: 1.25 },
              fontSize: 12,
              fontWeight: 700,
              whiteSpace: 'nowrap',
              borderColor: refreshFailed ? undefined : 'divider',
              color: refreshFailed ? undefined : 'text.secondary',
              '&:hover': refreshFailed
                ? undefined
                : { borderColor: 'primary.main', color: 'primary.main' },
            }}
          >
            {isRefreshing
              ? 'Actualizando…'
              : refreshFailed
                ? 'Error al actualizar'
                : 'Actualizar ahora'}
          </Button>
          <Button
            size="small"
            variant="outlined"
            startIcon={<TuneOutlinedIcon sx={{ fontSize: '15px !important' }} />}
            onClick={() => setFiltersOpen(true)}
            sx={{
              order: { xs: 2, sm: 'initial' },
              flex: { xs: 1, sm: 'initial' },
              minWidth: 0,
              px: { xs: 1, sm: 1.25 },
              fontSize: 12,
              fontWeight: 700,
              borderColor: 'divider',
              color: 'text.secondary',
              '&:hover': { borderColor: 'primary.main', color: 'primary.main' },
            }}
          >
            Filtros
          </Button>
          <Button
            size="small"
            variant="contained"
            startIcon={<SmartToyOutlinedIcon sx={{ fontSize: '15px !important' }} />}
            onClick={() => setAiPanelOpen(true)}
            sx={{ order: { xs: 2, sm: 'initial' }, flex: { xs: 1, sm: 'initial' }, minWidth: 0, px: { xs: 1, sm: 1.25 }, fontSize: 12, fontWeight: 700, boxShadow: 'none' }}
          >
            Asistente IA
          </Button>
          <IconButton size="small" onClick={onLogout} aria-label="Cerrar sesión" title="Cerrar sesión" sx={{ order: { xs: 1, sm: 'initial' } }}>
            <LogoutOutlinedIcon fontSize="small" />
          </IconButton>
        </Toolbar>
      </AppBar>

      <Box sx={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <Container
          maxWidth={false}
          sx={{ height: '100%', px: { xs: 1.25, sm: 1.5, md: 2.5 }, py: { xs: 1.25, md: 1.25 } }}
        >
          {children}
        </Container>
      </Box>

      <Drawer
        anchor="right"
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        PaperProps={{
          sx: {
            width: { xs: '100%', sm: 360 },
            p: 2.5,
            bgcolor: 'background.paper',
          },
        }}
      >
        <Stack direction="row" alignItems="center" justifyContent="space-between" mb={2.5}>
          <Stack direction="row" alignItems="center" spacing={1}>
            <TuneOutlinedIcon color="primary" fontSize="small" />
            <Typography variant="subtitle1" fontWeight={700}>Filtros del dashboard</Typography>
          </Stack>
          <IconButton size="small" onClick={() => setFiltersOpen(false)} aria-label="Cerrar filtros">
            <CloseIcon fontSize="small" />
          </IconButton>
        </Stack>
        <Divider sx={{ mb: 2.5 }} />
        <GlobalFilters />
      </Drawer>

      <AiAssistantPanel open={aiPanelOpen} onClose={() => setAiPanelOpen(false)} />
    </Box>
  );
}
