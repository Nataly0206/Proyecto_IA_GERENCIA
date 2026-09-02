import { ReactNode, useState } from 'react';
import {
  AppBar,
  Box,
  Button,
  Container,
  Divider,
  Drawer,
  IconButton,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Stack,
  Toolbar,
  Tooltip,
  Typography,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import RefreshOutlinedIcon from '@mui/icons-material/RefreshOutlined';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import LogoutOutlinedIcon from '@mui/icons-material/LogoutOutlined';
import PeopleOutlineIcon from '@mui/icons-material/PeopleOutline';
import ContentCutOutlinedIcon from '@mui/icons-material/ContentCutOutlined';
import PersonOutlineIcon from '@mui/icons-material/PersonOutline';
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import ShoppingCartOutlinedIcon from '@mui/icons-material/ShoppingCartOutlined';
import MoveToInboxOutlinedIcon from '@mui/icons-material/MoveToInboxOutlined';
import SetMealOutlinedIcon from '@mui/icons-material/SetMealOutlined';
import SortOutlinedIcon from '@mui/icons-material/SortOutlined';
import AcUnitOutlinedIcon from '@mui/icons-material/AcUnitOutlined';
import LocalShippingOutlinedIcon from '@mui/icons-material/LocalShippingOutlined';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import DataObjectIcon from '@mui/icons-material/DataObject';
import { AuthUser } from '../../types/auth';
import AiAssistantPanel from '../ai/AiAssistantPanel';
import { useRefreshDashboard } from '../../hooks/useDashboardData';
import { tienePermiso } from '../../config/permissions';
import PageHelpDialog from './PageHelpDialog';
import PageDevDetailsDialog from './PageDevDetailsDialog';

export type DashboardView =
  | 'compra-materia-prima'
  | 'recepcion'
  | 'descabezado'
  | 'clasificado'
  | 'pelado'
  | 'dashboard'
  | 'exportaciones'
  | 'inventory'
  | 'users';

interface DashboardLayoutProps {
  children: ReactNode;
  onLogout: () => void;
  user: AuthUser;
  currentView: DashboardView | null;
  onViewChange: (view: DashboardView) => void;
}

const SIDEBAR_OPEN = 196;
const SIDEBAR_CLOSED = 64;

export default function DashboardLayout({
  children,
  onLogout,
  user,
  currentView,
  onViewChange,
}: DashboardLayoutProps) {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [refreshFailed, setRefreshFailed] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [devDetailsOpen, setDevDetailsOpen] = useState(false);
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

  const navigate = (view: DashboardView) => {
    onViewChange(view);
    setMobileMenuOpen(false);
  };

  const navContent = (expanded: boolean) => (
    <Stack sx={{ height: '100%' }}>
      <Box sx={{ px: expanded ? 2 : 1, py: 1.5 }}>
        <Typography
          variant="overline"
          color="text.secondary"
          sx={{ display: expanded ? 'block' : 'none', fontSize: 10, fontWeight: 800 }}
        >
          Navegación
        </Typography>
      </Box>
      <List sx={{ px: 1, pt: 0 }}>
        {tienePermiso(user, 'compra_materia_prima') && (
          <Tooltip title={expanded ? '' : 'Compra de materia Prima'} placement="right">
          <ListItemButton
            selected={currentView === 'compra-materia-prima'}
            onClick={() => navigate('compra-materia-prima')}
            sx={{ minHeight: 42, px: 1.25, borderRadius: 1, mb: 0.5 }}
          >
            <ListItemIcon sx={{ minWidth: expanded ? 36 : 0, justifyContent: 'center' }}>
              <ShoppingCartOutlinedIcon fontSize="small" />
            </ListItemIcon>
            {expanded && <ListItemText primary="Compra de materia Prima" primaryTypographyProps={{ fontWeight: 700, fontSize: 13 }} />}
          </ListItemButton>
          </Tooltip>
        )}
        {tienePermiso(user, 'recepcion') && (
          <Tooltip title={expanded ? '' : 'Recepción'} placement="right">
          <ListItemButton
            selected={currentView === 'recepcion'}
            onClick={() => navigate('recepcion')}
            sx={{ minHeight: 42, px: 1.25, borderRadius: 1, mb: 0.5 }}
          >
            <ListItemIcon sx={{ minWidth: expanded ? 36 : 0, justifyContent: 'center' }}>
              <MoveToInboxOutlinedIcon fontSize="small" />
            </ListItemIcon>
            {expanded && <ListItemText primary="Recepción" primaryTypographyProps={{ fontWeight: 700, fontSize: 13 }} />}
          </ListItemButton>
          </Tooltip>
        )}
        {tienePermiso(user, 'descabezado') && (
          <Tooltip title={expanded ? '' : 'Descabezado'} placement="right">
          <ListItemButton
            selected={currentView === 'descabezado'}
            onClick={() => navigate('descabezado')}
            sx={{ minHeight: 42, px: 1.25, borderRadius: 1, mb: 0.5 }}
          >
            <ListItemIcon sx={{ minWidth: expanded ? 36 : 0, justifyContent: 'center' }}>
              <SetMealOutlinedIcon fontSize="small" />
            </ListItemIcon>
            {expanded && <ListItemText primary="Descabezado" primaryTypographyProps={{ fontWeight: 700, fontSize: 13 }} />}
          </ListItemButton>
          </Tooltip>
        )}
        {tienePermiso(user, 'clasificado') && (
          <Tooltip title={expanded ? '' : 'Clasificado'} placement="right">
          <ListItemButton
            selected={currentView === 'clasificado'}
            onClick={() => navigate('clasificado')}
            sx={{ minHeight: 42, px: 1.25, borderRadius: 1, mb: 0.5 }}
          >
            <ListItemIcon sx={{ minWidth: expanded ? 36 : 0, justifyContent: 'center' }}>
              <SortOutlinedIcon fontSize="small" />
            </ListItemIcon>
            {expanded && <ListItemText primary="Clasificado" primaryTypographyProps={{ fontWeight: 700, fontSize: 13 }} />}
          </ListItemButton>
          </Tooltip>
        )}
        {tienePermiso(user, 'pelado') && (
          <Tooltip title={expanded ? '' : 'Pelado'} placement="right">
            <ListItemButton
              selected={currentView === 'pelado'}
              onClick={() => navigate('pelado')}
              sx={{ minHeight: 42, px: 1.25, borderRadius: 1, mb: 0.5 }}
            >
              <ListItemIcon sx={{ minWidth: expanded ? 36 : 0, justifyContent: 'center' }}>
                <ContentCutOutlinedIcon fontSize="small" />
              </ListItemIcon>
              {expanded && <ListItemText primary="Pelado" primaryTypographyProps={{ fontWeight: 700, fontSize: 13 }} />}
            </ListItemButton>
          </Tooltip>
        )}
        {tienePermiso(user, 'iqf') && (
          <Tooltip title={expanded ? '' : 'IQF'} placement="right">
            <ListItemButton
              selected={currentView === 'dashboard'}
              onClick={() => navigate('dashboard')}
              sx={{ minHeight: 42, px: 1.25, borderRadius: 1, mb: 0.5 }}
            >
              <ListItemIcon sx={{ minWidth: expanded ? 36 : 0, justifyContent: 'center' }}>
                <AcUnitOutlinedIcon fontSize="small" />
              </ListItemIcon>
              {expanded && <ListItemText primary="IQF" primaryTypographyProps={{ fontWeight: 700, fontSize: 13 }} />}
            </ListItemButton>
          </Tooltip>
        )}
        {tienePermiso(user, 'exportaciones') && (
          <Tooltip title={expanded ? '' : 'Exportaciones'} placement="right">
          <ListItemButton
            selected={currentView === 'exportaciones'}
            onClick={() => navigate('exportaciones')}
            sx={{ minHeight: 42, px: 1.25, borderRadius: 1, mb: 0.5 }}
          >
            <ListItemIcon sx={{ minWidth: expanded ? 36 : 0, justifyContent: 'center' }}>
              <LocalShippingOutlinedIcon fontSize="small" />
            </ListItemIcon>
            {expanded && <ListItemText primary="Exportaciones" primaryTypographyProps={{ fontWeight: 700, fontSize: 13 }} />}
          </ListItemButton>
          </Tooltip>
        )}
        {tienePermiso(user, 'inventario') && (
          <Tooltip title={expanded ? '' : 'Inventario'} placement="right">
            <ListItemButton
              selected={currentView === 'inventory'}
              onClick={() => navigate('inventory')}
              sx={{ minHeight: 42, px: 1.25, borderRadius: 1, mb: 0.5 }}
            >
              <ListItemIcon sx={{ minWidth: expanded ? 36 : 0, justifyContent: 'center' }}>
                <Inventory2OutlinedIcon fontSize="small" />
              </ListItemIcon>
              {expanded && <ListItemText primary="Inventario" primaryTypographyProps={{ fontWeight: 700, fontSize: 13 }} />}
            </ListItemButton>
          </Tooltip>
        )}
        {tienePermiso(user, 'usuarios') && (
          <Tooltip title={expanded ? '' : 'Usuarios'} placement="right">
            <ListItemButton
              selected={currentView === 'users'}
              onClick={() => navigate('users')}
              sx={{ minHeight: 42, px: 1.25, borderRadius: 1 }}
            >
              <ListItemIcon sx={{ minWidth: expanded ? 36 : 0, justifyContent: 'center' }}>
                <PeopleOutlineIcon fontSize="small" />
              </ListItemIcon>
              {expanded && <ListItemText primary="Usuarios" primaryTypographyProps={{ fontWeight: 700, fontSize: 13 }} />}
            </ListItemButton>
          </Tooltip>
        )}
      </List>
      <Box sx={{ flex: 1 }} />
      <Divider />
      <Stack spacing={0.25} sx={{ p: 1 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25, px: 1.25, py: 1 }}>
          <PersonOutlineIcon color="action" fontSize="small" />
          {expanded && (
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="body2" fontWeight={700} noWrap>{user.nombre}</Typography>
              <Typography variant="caption" color="text.secondary" noWrap>{user.usuario}</Typography>
            </Box>
          )}
        </Box>
        <Tooltip title={expanded ? '' : 'Cerrar sesión'} placement="right">
          <ListItemButton onClick={onLogout} sx={{ minHeight: 40, px: 1.25, borderRadius: 1 }}>
            <ListItemIcon sx={{ minWidth: expanded ? 36 : 0, justifyContent: 'center' }}>
              <LogoutOutlinedIcon fontSize="small" />
            </ListItemIcon>
            {expanded && <ListItemText primary="Cerrar sesión" primaryTypographyProps={{ fontWeight: 700, fontSize: 13 }} />}
          </ListItemButton>
        </Tooltip>
      </Stack>
    </Stack>
  );

  const desktopWidth = sidebarOpen ? SIDEBAR_OPEN : SIDEBAR_CLOSED;

  return (
    <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column', bgcolor: 'background.default' }}>
      <AppBar position="static" elevation={0}>
        <Toolbar variant="dense" sx={{ px: { xs: 1.25, md: 2 }, minHeight: 46, gap: 1 }}>
          <IconButton
            size="small"
            onClick={() => isMobile ? setMobileMenuOpen(true) : setSidebarOpen((open) => !open)}
            aria-label="Alternar navegación"
          >
            {sidebarOpen && !isMobile ? <ChevronLeftIcon /> : <MenuIcon />}
          </IconButton>
          <Stack direction="row" alignItems="center" spacing={1} sx={{ flex: 1, minWidth: 0 }}>
            <Box sx={{ width: 6, height: 22, borderRadius: 1, bgcolor: 'primary.main' }} />
            <Typography variant="subtitle1" fontWeight={800} noWrap>
              Dashboard Gerencial
            </Typography>
            <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ display: { xs: 'none', sm: 'block' } }}>
              ESF Seafood
            </Typography>
          </Stack>
          {currentView !== null && currentView !== 'users' && currentView !== 'inventory' && (
            <Button
              size="small"
              variant="outlined"
              color={refreshFailed ? 'error' : 'primary'}
              startIcon={<RefreshOutlinedIcon sx={{ animation: isRefreshing ? 'spin .8s linear infinite' : 'none', '@keyframes spin': { to: { transform: 'rotate(360deg)' } } }} />}
              disabled={isRefreshing}
              onClick={handleRefresh}
              sx={{ borderColor: 'divider', color: refreshFailed ? undefined : 'text.secondary', display: { xs: 'none', sm: 'inline-flex' } }}
            >
              {isRefreshing ? 'Actualizando…' : 'Actualizar'}
            </Button>
          )}
          {currentView !== null && (
            <Tooltip title="¿Qué muestra esta página?">
              <IconButton
                size="small"
                onClick={() => setHelpOpen(true)}
                aria-label="Abrir ayuda de esta página"
                sx={{ color: 'text.secondary' }}
              >
                <HelpOutlineIcon />
              </IconButton>
            </Tooltip>
          )}
          {currentView !== null && tienePermiso(user, 'detalles_desarrollador') && (
            <Tooltip title="Detalles de desarrollador (tablas, vistas, fórmulas)">
              <IconButton
                size="small"
                onClick={() => setDevDetailsOpen(true)}
                aria-label="Abrir detalles de desarrollador de esta página"
                sx={{ color: 'text.secondary' }}
              >
                <DataObjectIcon />
              </IconButton>
            </Tooltip>
          )}
          {tienePermiso(user, 'asistente_ia') && (
            <Button
              size="small"
              variant="contained"
              startIcon={<SmartToyOutlinedIcon />}
              onClick={() => setAiPanelOpen(true)}
              sx={{ boxShadow: 'none' }}
            >
              <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>Asistente IA</Box>
              <Box component="span" sx={{ display: { xs: 'inline', sm: 'none' } }}>IA</Box>
            </Button>
          )}
        </Toolbar>
      </AppBar>

      <Box sx={{ flex: 1, minHeight: 0, display: 'flex' }}>
        {!isMobile && (
          <Box
            component="aside"
            sx={{
              width: desktopWidth,
              flexShrink: 0,
              borderRight: 1,
              borderColor: 'divider',
              bgcolor: 'background.paper',
              transition: theme.transitions.create('width', { duration: theme.transitions.duration.shorter }),
              overflow: 'hidden',
            }}
          >
            {navContent(sidebarOpen)}
          </Box>
        )}
        <Box component="main" sx={{ flex: 1, minWidth: 0, minHeight: 0 }}>
          <Container
            maxWidth={false}
            sx={{ height: '100%', px: { xs: 1.25, sm: 1.5, md: 2 }, py: 1.25 }}
          >
            {children}
          </Container>
        </Box>
      </Box>

      <Drawer
        anchor="left"
        open={isMobile && mobileMenuOpen}
        onClose={() => setMobileMenuOpen(false)}
        PaperProps={{ sx: { width: 248 } }}
      >
        {navContent(true)}
      </Drawer>

      <AiAssistantPanel open={aiPanelOpen} onClose={() => setAiPanelOpen(false)} />
      {currentView !== null && (
        <PageHelpDialog view={currentView} open={helpOpen} onClose={() => setHelpOpen(false)} />
      )}
      {currentView !== null && tienePermiso(user, 'detalles_desarrollador') && (
        <PageDevDetailsDialog view={currentView} open={devDetailsOpen} onClose={() => setDevDetailsOpen(false)} />
      )}
    </Box>
  );
}
