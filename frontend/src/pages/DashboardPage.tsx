import { useEffect, useRef, useState } from 'react';
import { Grid, Stack } from '@mui/material';
import ChartWidget from '../components/charts/ChartWidget';
import ExecutiveSummary from '../components/insights/ExecutiveSummary';
import IqfLiveCounters from '../components/live/IqfLiveCounters';
import { dashboardWidgets } from '../config/dashboardConfig';

const [librasNetas, iqfDiario, iqfMensual] = dashboardWidgets;
const APP_BAR = 46;
const CONTAINER_PY = 24;
const STACK_GAP = 12;
const GRID_ROW_GAP = 16;
const CARD_CHROME = 92;

export default function DashboardPage() {
  const topRef = useRef<HTMLDivElement>(null);
  const [chartHeight, setChartHeight] = useState(260);

  useEffect(() => {
    const calc = () => {
      const topH = topRef.current?.offsetHeight ?? 0;
      const available =
        window.innerHeight - APP_BAR - CONTAINER_PY - topH - STACK_GAP - GRID_ROW_GAP;
      setChartHeight(Math.max(150, Math.floor(available / 2) - CARD_CHROME));
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
        <Grid item xs={12} md={7} sx={{ display: 'flex', flexDirection: 'column' }}>
          <ChartWidget config={{ ...librasNetas, height: chartHeight }} />
        </Grid>
        <Grid item xs={12} md={5} sx={{ display: 'flex', flexDirection: 'column' }}>
          <ExecutiveSummary />
        </Grid>
        <Grid item xs={12} md={6} sx={{ display: 'flex', flexDirection: 'column' }}>
          <ChartWidget config={{ ...iqfDiario, height: chartHeight }} />
        </Grid>
        <Grid item xs={12} md={6} sx={{ display: 'flex', flexDirection: 'column' }}>
          <ChartWidget config={{ ...iqfMensual, height: chartHeight }} />
        </Grid>
      </Grid>
    </Stack>
  );
}
