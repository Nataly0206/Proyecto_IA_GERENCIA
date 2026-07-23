import { useEffect, useRef, useState } from 'react';
import { Box, Stack } from '@mui/material';
import ChartWidget from '../components/charts/ChartWidget';
import NetProcessWidget from '../components/charts/NetProcessWidget';
import IqfLiveCounters from '../components/live/IqfLiveCounters';
import { dashboardWidgets } from '../config/dashboardConfig';

const [, iqfDiario, iqfMensual] = dashboardWidgets;

const APP_BAR = 46;
const CONTAINER_PY = 20;   // py: 1.25 top + bottom
const STACK_GAP = 12;       // spacing={1.5}
const GRID_ROW_GAP = 16;    // spacing={2}
const CARD_CHROME = 96;     // cardcontent padding + title block + margin

export default function DashboardPage() {
  const topRef = useRef<HTMLDivElement>(null);
  const netProcessRef = useRef<HTMLDivElement>(null);
  const [heights, setHeights] = useState({ netas: 320, iqf: 240 });

  useEffect(() => {
    const calc = () => {
      const topH = topRef.current?.offsetHeight ?? 0;
      const netProcessH = netProcessRef.current?.offsetHeight ?? 0;
      const availableForIqf =
        window.innerHeight -
        APP_BAR -
        CONTAINER_PY -
        topH -
        STACK_GAP -
        netProcessH -
        GRID_ROW_GAP;
      setHeights({
        netas: Math.max(220, Math.floor(window.innerHeight * 0.32)),
        iqf: Math.max(160, availableForIqf - CARD_CHROME),
      });
    };
    calc();
    window.addEventListener('resize', calc);
    const ro = new ResizeObserver(calc);
    if (topRef.current) ro.observe(topRef.current);
    if (netProcessRef.current) ro.observe(netProcessRef.current);
    return () => {
      window.removeEventListener('resize', calc);
      ro.disconnect();
    };
  }, []);

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
      <div ref={topRef}>
        <IqfLiveCounters />
      </div>

      <Box
        sx={{
          flex: 1,
          minHeight: 0,
          display: 'grid',
          gridTemplateColumns: { xs: 'minmax(0, 1fr)', md: 'repeat(2, minmax(0, 1fr))' },
          gridTemplateRows: { xs: 'auto auto auto', md: 'auto minmax(0, 1fr)' },
          gap: 2,
          overflow: { xs: 'visible', md: 'hidden' },
        }}
      >
        <Box
          ref={netProcessRef}
          sx={{ gridColumn: '1 / -1', minWidth: 0 }}
        >
          <NetProcessWidget height={heights.netas} />
        </Box>
        <Box sx={{ minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <ChartWidget config={{ ...iqfDiario, height: heights.iqf }} />
        </Box>
        <Box sx={{ minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <ChartWidget config={{ ...iqfMensual, height: heights.iqf }} />
        </Box>
      </Box>
    </Stack>
  );
}
