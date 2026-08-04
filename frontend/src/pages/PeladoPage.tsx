import { useEffect, useRef, useState } from 'react';
import { Box, Collapse, IconButton, Paper, Stack, Tooltip, Typography, useMediaQuery, useTheme } from '@mui/material';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import TuneOutlinedIcon from '@mui/icons-material/TuneOutlined';
import ChartWidget from '../components/charts/ChartWidget';
import PeladoStyleWidget from '../components/charts/PeladoStyleWidget';
import PeladoLiveCounters from '../components/live/PeladoLiveCounters';
import { peladoWidgets } from '../config/dashboardConfig';
import GlobalFilters from '../components/filters/GlobalFilters';

const [peladoDiario, peladoMensual] = peladoWidgets;

const APP_BAR = 46;
const CONTAINER_PY = 20;   // py: 1.25 top + bottom
const STACK_GAPS = 24;      // dos espacios de spacing={1.5}
const GRID_ROW_GAP = 16;    // spacing={2}
const CARD_CHROME = 96;     // cardcontent padding + title block + margin

export default function PeladoPage() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const filtersRef = useRef<HTMLDivElement>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const styleRef = useRef<HTMLDivElement>(null);
  const [heights, setHeights] = useState({ estilo: 320, tendencia: 240 });
  const [filtersOpen, setFiltersOpen] = useState(true);

  useEffect(() => {
    const calc = () => {
      const topH = topRef.current?.offsetHeight ?? 0;
      const filtersH = filtersRef.current?.offsetHeight ?? 0;
      const styleH = styleRef.current?.offsetHeight ?? 0;
      const availableForTendencia =
        window.innerHeight -
        APP_BAR -
        CONTAINER_PY -
        filtersH -
        topH -
        STACK_GAPS -
        styleH -
        GRID_ROW_GAP;
      setHeights({
        estilo: isMobile ? 340 : Math.max(220, Math.floor(window.innerHeight * 0.32)),
        tendencia: isMobile ? 320 : Math.max(160, availableForTendencia - CARD_CHROME),
      });
    };
    calc();
    window.addEventListener('resize', calc);
    const ro = new ResizeObserver(calc);
    if (filtersRef.current) ro.observe(filtersRef.current);
    if (topRef.current) ro.observe(topRef.current);
    if (styleRef.current) ro.observe(styleRef.current);
    return () => {
      window.removeEventListener('resize', calc);
      ro.disconnect();
    };
  }, [isMobile]);

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
        ref={filtersRef}
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

      <div ref={topRef}>
        <PeladoLiveCounters />
      </div>

      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          display: 'grid',
          gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'repeat(2, minmax(0, 1fr))' },
          gridTemplateRows: { xs: 'auto auto auto', md: 'auto minmax(0, 1fr)' },
          gap: { xs: 1.5, md: 2 },
          pb: { xs: 1.5, md: 0 },
          overflow: { xs: 'visible', md: 'hidden' },
        }}
      >
        <Box
          ref={styleRef}
          sx={{ gridColumn: '1 / -1', minWidth: 0 }}
        >
          <PeladoStyleWidget height={heights.estilo} />
        </Box>
        <Box
          sx={{
            minWidth: 0,
            minHeight: { xs: 'auto', md: 0 },
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <ChartWidget config={{ ...peladoDiario, height: heights.tendencia }} />
        </Box>
        <Box
          sx={{
            minWidth: 0,
            minHeight: { xs: 'auto', md: 0 },
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <ChartWidget config={{ ...peladoMensual, height: heights.tendencia }} />
        </Box>
      </Box>
    </Stack>
  );
}
