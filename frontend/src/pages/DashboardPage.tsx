import { useEffect, useRef, useState } from 'react';
import { Grid, Stack } from '@mui/material';
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
  const [heights, setHeights] = useState({ netas: 320, iqf: 240 });

  useEffect(() => {
    const calc = () => {
      const topH = topRef.current?.offsetHeight ?? 0;
      const available =
        window.innerHeight - APP_BAR - CONTAINER_PY - topH - STACK_GAP - GRID_ROW_GAP;
      setHeights({
        netas: Math.max(240, Math.floor(available * 0.54) - CARD_CHROME),
        iqf: Math.max(160, Math.floor(available * 0.46) - CARD_CHROME),
      });
    };
    calc();
    window.addEventListener('resize', calc);
    const ro = new ResizeObserver(calc);
    if (topRef.current) ro.observe(topRef.current);
    return () => {
      window.removeEventListener('resize', calc);
      ro.disconnect();
    };
  }, []);

  return (
    <Stack spacing={1.5} sx={{ height: '100%', overflow: 'hidden' }}>
      <div ref={topRef}>
        <IqfLiveCounters />
      </div>

      <Grid container spacing={2} sx={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <Grid item xs={12} sx={{ display: 'flex', flexDirection: 'column' }}>
          <NetProcessWidget height={heights.netas} />
        </Grid>
        <Grid item xs={12} md={6} sx={{ display: 'flex', flexDirection: 'column' }}>
          <ChartWidget config={{ ...iqfDiario, height: heights.iqf }} />
        </Grid>
        <Grid item xs={12} md={6} sx={{ display: 'flex', flexDirection: 'column' }}>
          <ChartWidget config={{ ...iqfMensual, height: heights.iqf }} />
        </Grid>
      </Grid>
    </Stack>
  );
}
