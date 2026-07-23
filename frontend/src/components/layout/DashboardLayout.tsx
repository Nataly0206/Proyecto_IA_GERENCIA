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
import AiAssistantPanel from '../ai/AiAssistantPanel';
import GlobalFilters from '../filters/GlobalFilters';
import { useIqfLive } from '../../hooks/useDashboardData';

interface DashboardLayoutProps {
  children: ReactNode;
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshFailed, setRefreshFailed] = useState(false);
  const { refreshNow } = useIqfLive();

  const handleRefresh = async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    setRefreshFailed(false);
    try {
      await refreshNow();
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
          sx={{ px: { xs: 2, md: 3 }, minHeight: 46, gap: 1.5 }}
        >
          <Stack direction="row" alignItems="center" spacing={1} sx={{ flexGrow: 1 }}>
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
              sx={{ letterSpacing: 0, color: 'text.primary' }}
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
            sx={{ fontSize: 12, fontWeight: 700, boxShadow: 'none' }}
          >
            Asistente IA
          </Button>
        </Toolbar>
      </AppBar>

      <Box sx={{ flex: 1, overflow: 'hidden' }}>
        <Container
          maxWidth={false}
          sx={{ height: '100%', px: { xs: 1.5, md: 2.5 }, py: { xs: 1, md: 1.25 } }}
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
