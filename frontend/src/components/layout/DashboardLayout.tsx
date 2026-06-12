import { ReactNode, useState } from 'react';
import {
  AppBar,
  Box,
  Button,
  Container,
  Drawer,
  IconButton,
  Stack,
  Toolbar,
  Typography,
} from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import TuneOutlinedIcon from '@mui/icons-material/TuneOutlined';
import SmartToyOutlinedIcon from '@mui/icons-material/SmartToyOutlined';
import AiAssistantPanel from '../ai/AiAssistantPanel';
import GlobalFilters from '../filters/GlobalFilters';

interface DashboardLayoutProps {
  children: ReactNode;
}

export default function DashboardLayout({ children }: DashboardLayoutProps) {
  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);

  return (
    <Box sx={{ height: '100vh', display: 'flex', flexDirection: 'column', bgcolor: 'background.default' }}>
      <AppBar position="static">
        <Toolbar variant="dense" disableGutters sx={{ px: { xs: 1.5, md: 2.5 }, minHeight: 46, gap: 1 }}>
          <Typography variant="subtitle1" fontWeight={700} sx={{ flexGrow: 1, letterSpacing: 0 }}>
            Dashboard Gerencial
          </Typography>
          <Button
            size="small"
            variant="contained"
            startIcon={<TuneOutlinedIcon />}
            onClick={() => setFiltersOpen(true)}
            sx={{ fontSize: 12, boxShadow: 'none' }}
          >
            Filtros
          </Button>
          <Button
            size="small"
            variant="outlined"
            startIcon={<SmartToyOutlinedIcon />}
            onClick={() => setAiPanelOpen(true)}
            sx={{ fontSize: 12 }}
          >
            Asistente IA
          </Button>
        </Toolbar>
      </AppBar>

      <Box sx={{ flex: 1, overflow: 'hidden' }}>
        <Container maxWidth={false} sx={{ height: '100%', px: { xs: 1.25, md: 2.5 }, py: { xs: 1, md: 1.5 } }}>
          {children}
        </Container>
      </Box>

      <Drawer
        anchor="right"
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        PaperProps={{
          sx: {
            width: { xs: '100%', sm: 380 },
            p: 2.5,
            bgcolor: 'background.paper',
          },
        }}
      >
        <Stack direction="row" alignItems="center" justifyContent="space-between" mb={2}>
          <Stack direction="row" alignItems="center" spacing={1}>
            <TuneOutlinedIcon color="primary" />
            <Typography variant="h6">Filtros</Typography>
          </Stack>
          <IconButton onClick={() => setFiltersOpen(false)} aria-label="Cerrar filtros">
            <CloseIcon />
          </IconButton>
        </Stack>
        <GlobalFilters />
      </Drawer>

      <AiAssistantPanel open={aiPanelOpen} onClose={() => setAiPanelOpen(false)} />
    </Box>
  );
}
