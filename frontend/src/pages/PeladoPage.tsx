import { useState } from 'react';
import { Box, Collapse, IconButton, Paper, Stack, Tooltip, Typography } from '@mui/material';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import TuneOutlinedIcon from '@mui/icons-material/TuneOutlined';
import GlobalFilters from '../components/filters/GlobalFilters';
import PeladoLibrasHoyCards from '../components/live/PeladoLibrasHoyCards';
import PeladoEstiloWidget from '../components/charts/PeladoEstiloWidget';

export default function PeladoPage() {
  const [filtersOpen, setFiltersOpen] = useState(true);

  return (
    <Stack
      spacing={1.5}
      sx={{
        height: '100%',
        minHeight: 0,
        overflowY: { xs: 'auto', md: 'hidden' },
        overflowX: 'hidden',
      }}
    >
      <Paper
        elevation={0}
        sx={{
          px: { xs: 1.5, sm: 1.75 },
          py: 1.25,
          border: 1,
          borderColor: 'divider',
          flexShrink: 0,
          overflow: 'hidden',
        }}
      >
        <Box sx={{ display: 'flex', alignItems: 'center', minHeight: 32, gap: 1 }}>
          <Box
            sx={{
              width: 30,
              height: 30,
              display: 'grid',
              placeItems: 'center',
              borderRadius: 1,
              bgcolor: 'rgba(22, 74, 139, 0.08)',
              color: 'primary.main',
            }}
          >
            <TuneOutlinedIcon sx={{ fontSize: 18 }} />
          </Box>
          <Box sx={{ flex: 1, minWidth: 0 }}>
            <Typography variant="subtitle2" color="text.primary" fontWeight={800}>
              Filtros de pelado
            </Typography>
            <Typography variant="caption" color="text.secondary" sx={{ display: { xs: 'none', sm: 'block' } }}>
              Ajusta el período y turno de los reportes
            </Typography>
          </Box>
          <Tooltip title={filtersOpen ? 'Ocultar filtros' : 'Mostrar filtros'}>
            <IconButton
              size="small"
              onClick={() => setFiltersOpen((open) => !open)}
              aria-label={filtersOpen ? 'Ocultar filtros' : 'Mostrar filtros'}
              aria-expanded={filtersOpen}
              sx={{ color: 'text.secondary' }}
            >
              {filtersOpen ? <ExpandLessIcon /> : <ExpandMoreIcon />}
            </IconButton>
          </Tooltip>
        </Box>
        <Collapse in={filtersOpen}>
          <Box sx={{ pt: 1.25 }}>
            <GlobalFilters />
          </Box>
        </Collapse>
      </Paper>

      <PeladoLibrasHoyCards />
      <PeladoEstiloWidget />
    </Stack>
  );
}
