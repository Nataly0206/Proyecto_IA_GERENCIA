import { ReactNode, useEffect, useState } from 'react';
import {
  AppBar,
  Box,
  Button,
  Container,
  Collapse,
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
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import MenuIcon from '@mui/icons-material/Menu';
import ChevronLeftIcon from '@mui/icons-material/ChevronLeft';
import RefreshOutlinedIcon from '@mui/icons-material/RefreshOutlined';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import LogoutOutlinedIcon from '@mui/icons-material/LogoutOutlined';
import PeopleOutlineIcon from '@mui/icons-material/PeopleOutline';
import ContentCutOutlinedIcon from '@mui/icons-material/ContentCutOutlined';
import PersonOutlineIcon from '@mui/icons-material/PersonOutline';
import AssignmentOutlinedIcon from '@mui/icons-material/AssignmentOutlined';
import Inventory2OutlinedIcon from '@mui/icons-material/Inventory2Outlined';
import KitchenOutlinedIcon from '@mui/icons-material/KitchenOutlined';
import ShoppingCartOutlinedIcon from '@mui/icons-material/ShoppingCartOutlined';
import MoveToInboxOutlinedIcon from '@mui/icons-material/MoveToInboxOutlined';
import SetMealOutlinedIcon from '@mui/icons-material/SetMealOutlined';
import SortOutlinedIcon from '@mui/icons-material/SortOutlined';
import AcUnitOutlinedIcon from '@mui/icons-material/AcUnitOutlined';
import LocalShippingOutlinedIcon from '@mui/icons-material/LocalShippingOutlined';
import HelpOutlineIcon from '@mui/icons-material/HelpOutline';
import DataObjectIcon from '@mui/icons-material/DataObject';
import BarChartOutlinedIcon from '@mui/icons-material/BarChartOutlined';
import AccountBalanceOutlinedIcon from '@mui/icons-material/AccountBalanceOutlined';
import TrendingUpOutlinedIcon from '@mui/icons-material/TrendingUpOutlined';
import EmojiEventsOutlinedIcon from '@mui/icons-material/EmojiEventsOutlined';
import SpeedOutlinedIcon from '@mui/icons-material/SpeedOutlined';
import MoreVertIcon from '@mui/icons-material/MoreVert';
import { Menu, MenuItem } from '@mui/material';
import { AuthUser } from '../../types/auth';
import AiAssistantPanel from '../ai/AiAssistantPanel';
import { useRefreshDashboard } from '../../hooks/useDashboardData';
import { Permiso, tienePermiso } from '../../config/permissions';
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
  | 'carga'
  | 'inventario-fresco'
  | 'prestamos'
  | 'rendimientos'
  | 'resumen-procesos'
  | 'rankings'
  | 'power-bi'
  | 'users';

interface DashboardLayoutProps {
  children: ReactNode;
  onLogout: () => void;
  user: AuthUser;
  currentView: DashboardView | null;
  onViewChange: (view: DashboardView) => void;
}

interface NavigationGroup {
  id: string;
  label: string;
  icon: ReactNode;
  items: { view: DashboardView; label: string; permission: Permiso; icon: ReactNode }[];
}

const NAVIGATION_GROUPS: NavigationGroup[] = [
  { id: 'resumen', label: 'Resumen gerencial', icon: <BarChartOutlinedIcon fontSize="small" />, items: [
    { view: 'resumen-procesos', label: 'Productividad', permission: 'resumen_procesos', icon: <TrendingUpOutlinedIcon fontSize="small" /> },
    { view: 'rankings', label: 'Rankings', permission: 'rankings', icon: <EmojiEventsOutlinedIcon fontSize="small" /> },
    { view: 'rendimientos', label: 'Rendimientos', permission: 'rendimientos', icon: <SpeedOutlinedIcon fontSize="small" /> },
    { view: 'power-bi', label: 'Power BI', permission: 'power_bi', icon: <BarChartOutlinedIcon fontSize="small" /> },
  ] },
  { id: 'produccion', label: 'Producción', icon: <SetMealOutlinedIcon fontSize="small" />, items: [
    { view: 'compra-materia-prima', label: 'Compra de materia prima', permission: 'compra_materia_prima', icon: <ShoppingCartOutlinedIcon fontSize="small" /> },
    { view: 'recepcion', label: 'Recepción', permission: 'recepcion', icon: <MoveToInboxOutlinedIcon fontSize="small" /> },
    { view: 'inventario-fresco', label: 'Inventario fresco', permission: 'inventario_fresco', icon: <KitchenOutlinedIcon fontSize="small" /> },
    { view: 'descabezado', label: 'Descabezado', permission: 'descabezado', icon: <SetMealOutlinedIcon fontSize="small" /> },
    { view: 'clasificado', label: 'Clasificado', permission: 'clasificado', icon: <SortOutlinedIcon fontSize="small" /> },
    { view: 'pelado', label: 'Pelado', permission: 'pelado', icon: <ContentCutOutlinedIcon fontSize="small" /> },
    { view: 'dashboard', label: 'IQF', permission: 'iqf', icon: <AcUnitOutlinedIcon fontSize="small" /> },
  ] },
  { id: 'inventario', label: 'Exportaciones', icon: <LocalShippingOutlinedIcon fontSize="small" />, items: [
    { view: 'inventory', label: 'Inventario PT', permission: 'inventario', icon: <Inventory2OutlinedIcon fontSize="small" /> },
    { view: 'carga', label: 'Carga', permission: 'cargas', icon: <AssignmentOutlinedIcon fontSize="small" /> },
    { view: 'exportaciones', label: 'Exportaciones', permission: 'exportaciones', icon: <LocalShippingOutlinedIcon fontSize="small" /> },
  ] },
  { id: 'administracion', label: 'Administración', icon: <PeopleOutlineIcon fontSize="small" />, items: [
    { view: 'prestamos', label: 'Préstamos', permission: 'prestamos', icon: <AccountBalanceOutlinedIcon fontSize="small" /> },
    { view: 'users', label: 'Usuarios', permission: 'usuarios', icon: <PeopleOutlineIcon fontSize="small" /> },
  ] },
];

const SIDEBAR_OPEN = 248;
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
  const [mobileActionsAnchor, setMobileActionsAnchor] = useState<HTMLElement | null>(null);
  const refreshDashboard = useRefreshDashboard();
  const visibleGroups = NAVIGATION_GROUPS.map(group => ({
    ...group, items: group.items.filter(item => tienePermiso(user, item.permission)),
  })).filter(group => group.items.length > 0);
  const activeGroupId = visibleGroups.find(group => group.items.some(item => item.view === currentView))?.id;
  const navigationStorageKey = `dashboard-navigation-group:${user.id}`;
  const [openGroup, setOpenGroup] = useState<string | null>(activeGroupId ?? null);

  useEffect(() => {
    let remembered: string | null = null;
    try { remembered = localStorage.getItem(navigationStorageKey); } catch { /* Storage may be unavailable. */ }
    setOpenGroup(activeGroupId ?? remembered);
  }, [activeGroupId, navigationStorageKey]);

  const toggleGroup = (groupId: string, expanded: boolean) => {
    const next = expanded && openGroup === groupId ? null : groupId;
    setOpenGroup(next);
    if (!isMobile) setSidebarOpen(true);
    try {
      if (next) localStorage.setItem(navigationStorageKey, next);
      else localStorage.removeItem(navigationStorageKey);
    } catch { /* Navigation works without storage. */ }
  };


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
      <List component="nav" aria-label="Menú principal" sx={{ px: 1, pt: 0, flex: 1, minHeight: 0, overflowY: 'auto' }}>
        {visibleGroups.map(group => {
          const active = group.id === activeGroupId;
          const open = expanded && openGroup === group.id;
          return <Box key={group.id} sx={{ mb: 0.5 }}>
            <Tooltip title={expanded ? '' : group.label} placement="right">
              <ListItemButton selected={active} onClick={() => toggleGroup(group.id, expanded)}
                aria-label={group.label} aria-expanded={open} aria-controls={`navigation-${group.id}`}
                sx={{ minHeight: 44, px: 1.25, borderRadius: 1.5, color: active ? 'primary.main' : 'text.primary' }}>
                <ListItemIcon sx={{ minWidth: expanded ? 34 : 0, justifyContent: 'center', color: 'inherit' }}>{group.icon}</ListItemIcon>
                {expanded && <>
                  <ListItemText primary={group.label} primaryTypographyProps={{ fontWeight: 800, fontSize: 13 }} />
                  {open ? <ExpandLessIcon fontSize="small" /> : <ExpandMoreIcon fontSize="small" />}
                </>}
              </ListItemButton>
            </Tooltip>
            <Collapse in={open} timeout="auto" unmountOnExit>
              <List id={`navigation-${group.id}`} disablePadding aria-label={group.label}
                sx={{ ml: 2.75, pl: 0.75, mt: 0.5, borderLeft: 1, borderColor: 'divider' }}>
                {group.items.map(item => <ListItemButton key={item.view} selected={currentView === item.view}
                  aria-current={currentView === item.view ? 'page' : undefined}
                  onClick={() => navigate(item.view)} sx={{ minHeight: 40, px: 1, borderRadius: 1, mb: 0.25 }}>
                  <ListItemIcon sx={{ minWidth: 28, color: currentView === item.view ? 'primary.main' : 'text.secondary' }}>{item.icon}</ListItemIcon>
                  <ListItemText primary={item.label} primaryTypographyProps={{ fontSize: 12, fontWeight: currentView === item.view ? 800 : 600 }} />
                </ListItemButton>)}
              </List>
            </Collapse>
          </Box>;
        })}
      </List>
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
    <Box sx={{ height: '100dvh', display: 'flex', flexDirection: 'column', bgcolor: 'background.default', overflow: 'hidden' }}>
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
              <Box component="span" sx={{ display: { xs: 'none', sm: 'inline' } }}>Dashboard Gerencial</Box>
              <Box component="span" sx={{ display: { xs: 'inline', sm: 'none' } }}>ESF</Box>
            </Typography>
            <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ display: { xs: 'none', sm: 'block' } }}>
              ESF Seafood
            </Typography>
          </Stack>
          {currentView !== null && currentView !== 'users' && currentView !== 'inventory' && currentView !== 'carga' && currentView !== 'inventario-fresco' && currentView !== 'prestamos' && currentView !== 'rankings' && currentView !== 'resumen-procesos' && currentView !== 'rendimientos' && currentView !== 'power-bi' && (
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
          {currentView !== null && !isMobile && (
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
          {currentView !== null && !isMobile && tienePermiso(user, 'detalles_desarrollador') && (
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
          {isMobile && currentView !== null && (
            <IconButton
              size="small"
              onClick={(event) => setMobileActionsAnchor(event.currentTarget)}
              aria-label="Más acciones"
              aria-haspopup="menu"
            >
              <MoreVertIcon />
            </IconButton>
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
        PaperProps={{ sx: { width: 'min(86vw, 320px)', pt: 'env(safe-area-inset-top)', pb: 'env(safe-area-inset-bottom)' } }}
      >
        {navContent(true)}
      </Drawer>

      <Menu
        anchorEl={mobileActionsAnchor}
        open={Boolean(mobileActionsAnchor)}
        onClose={() => setMobileActionsAnchor(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
        transformOrigin={{ vertical: 'top', horizontal: 'right' }}
      >
        {currentView !== 'users' && currentView !== 'inventory' && currentView !== 'carga' && currentView !== 'inventario-fresco' && currentView !== 'prestamos' && currentView !== 'rankings' && currentView !== 'resumen-procesos' && currentView !== 'rendimientos' && currentView !== 'power-bi' && (
          <MenuItem onClick={() => { setMobileActionsAnchor(null); void handleRefresh(); }} disabled={isRefreshing}>
            <RefreshOutlinedIcon fontSize="small" sx={{ mr: 1.25 }} />
            {isRefreshing ? 'Actualizando…' : 'Actualizar datos'}
          </MenuItem>
        )}
        <MenuItem onClick={() => { setMobileActionsAnchor(null); setHelpOpen(true); }}>
          <HelpOutlineIcon fontSize="small" sx={{ mr: 1.25 }} /> Ayuda de esta página
        </MenuItem>
        {tienePermiso(user, 'detalles_desarrollador') && (
          <MenuItem onClick={() => { setMobileActionsAnchor(null); setDevDetailsOpen(true); }}>
            <DataObjectIcon fontSize="small" sx={{ mr: 1.25 }} /> Detalles técnicos
          </MenuItem>
        )}
      </Menu>

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
