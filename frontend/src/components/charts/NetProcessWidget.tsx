import { useEffect, useMemo, useState } from 'react';
import {
  Box, Button, Checkbox, Divider, FormControlLabel, Popover, Stack, ToggleButton,
  ToggleButtonGroup, Typography,
} from '@mui/material';
import FilterAltOutlinedIcon from '@mui/icons-material/FilterAltOutlined';
import { ChartConfig, DataRow } from '../../types';
import { useFilters } from '../../context/FiltersContext';
import { useWidgetData } from '../../hooks/useDashboardData';
import { apiClient } from '../../api/client';
import ChartWidget from './ChartWidget';

interface NetProcessWidgetProps {
  height?: number;
  userId: string;
}

type Granularidad = 'dia' | 'semana' | 'mes';

const BASE_TITLE = 'Libras Congeladas Netas por Tipo de Proceso';
const BASE_SUBTITLE = 'Incluye fresco y reempaque como tipos seleccionables';
const STORAGE_KEY = 'iqf-procesos-ocultos:v1';

function readHiddenProcesses(userId: string): Set<string> {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(`${STORAGE_KEY}:${userId}`) ?? '[]');
    return new Set(Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : []);
  } catch {
    return new Set();
  }
}

/** Tabla por proceso con selector Día / Semana / Mes y preferencias de procesos. */
export default function NetProcessWidget({ height, userId }: NetProcessWidgetProps) {
  const [granularidad, setGranularidad] = useState<Granularidad>('dia');
  const [hiddenProcesses, setHiddenProcesses] = useState<Set<string>>(() => readHiddenProcesses(userId));
  const [processAnchor, setProcessAnchor] = useState<HTMLElement | null>(null);
  const [preferencesReady, setPreferencesReady] = useState(false);
  const { filters } = useFilters();
  const reportYear = filters.fechaFinal.slice(0, 4);
  const queryParams = {
    periodo: granularidad,
    ...(granularidad === 'mes' ? { fechaInicial: `${reportYear}-01-01`, fechaFinal: `${reportYear}-12-31` } : {}),
  };

  const config: ChartConfig = useMemo(() => ({
    id: 'libras-netas-proceso-dia',
    type: 'table',
    title: BASE_TITLE,
    subtitle: `${BASE_SUBTITLE} · día y semana: rango seleccionado · mes: año seleccionado`,
    endpoint: 'libras-netas-proceso-dia',
    xField: 'periodo',
    xLabel: granularidad === 'dia' ? 'Fecha' : granularidad === 'semana' ? 'Semana' : 'Mes',
    yField: 'libras',
    seriesField: 'proceso',
    totalAggregation: 'sum',
    valueFormat: 'number',
    height,
  }), [granularidad, height]);

  const { data: processRows } = useWidgetData(config.endpoint, queryParams);
  const processes = useMemo(() => Array.from(new Set([
    ...(processRows ?? []).map((row) => String(row.proceso ?? '')).filter(Boolean),
    ...hiddenProcesses,
  ])).sort((a, b) => a.localeCompare(b)), [hiddenProcesses, processRows]);
  const visibleProcesses = processes.filter((process) => !hiddenProcesses.has(process)).length;

  useEffect(() => {
    let active = true;
    setPreferencesReady(false);
    apiClient.get<{ hiddenProcesses: string[] | null }>('/dashboard/iqf-preferencias-procesos')
      .then(({ data }) => {
        if (!active) return;
        setHiddenProcesses(Array.isArray(data.hiddenProcesses)
          ? new Set(data.hiddenProcesses)
          : readHiddenProcesses(userId));
      })
      .catch(() => {
        if (active) setHiddenProcesses(readHiddenProcesses(userId));
      })
      .finally(() => { if (active) setPreferencesReady(true); });
    return () => { active = false; };
  }, [userId]);

  useEffect(() => {
    try {
      localStorage.setItem(`${STORAGE_KEY}:${userId}`, JSON.stringify(Array.from(hiddenProcesses)));
    } catch {
      // La selección sigue funcionando durante la sesión.
    }
  }, [hiddenProcesses, userId]);

  useEffect(() => {
    if (!preferencesReady) return;
    const timeout = window.setTimeout(() => {
      void apiClient.put('/dashboard/iqf-preferencias-procesos', {
        hiddenProcesses: Array.from(hiddenProcesses),
      }).catch(() => undefined);
    }, 300);
    return () => window.clearTimeout(timeout);
  }, [hiddenProcesses, preferencesReady]);

  const toggleProcess = (process: string) => setHiddenProcesses((current) => {
    const next = new Set(current);
    if (next.has(process)) next.delete(process); else next.add(process);
    return next;
  });

  const visibleRows = (rows: DataRow[]): DataRow[] => {
    const visible = rows.filter((row) => !hiddenProcesses.has(String(row.proceso ?? '')));
    if (granularidad !== 'mes' || visible.length === 0) return visible;
    const processes = Array.from(new Set(visible.map((row) => String(row.proceso))));
    const present = new Set(visible.map((row) => `${row.periodo}|${row.proceso}`));
    const empty: DataRow[] = [];
    for (let month = 1; month <= 12; month += 1) {
      const periodo = `${reportYear}-${String(month).padStart(2, '0')}`;
      for (const proceso of processes) {
        if (!present.has(`${periodo}|${proceso}`)) empty.push({ periodo, proceso, libras: 0 });
      }
    }
    return [...visible, ...empty];
  };

  return (
    <ChartWidget
      config={config}
      queryParams={queryParams}
      transform={visibleRows}
      actions={
        <>
          <Button
            size="small"
            variant="outlined"
            startIcon={<FilterAltOutlinedIcon sx={{ fontSize: 16 }} />}
            onClick={(event) => setProcessAnchor(event.currentTarget)}
            sx={{ fontSize: 11, fontWeight: 700, py: .4, whiteSpace: 'nowrap' }}
          >
            Procesos ({visibleProcesses}/{processes.length})
          </Button>
          <Popover
            open={Boolean(processAnchor)}
            anchorEl={processAnchor}
            onClose={() => setProcessAnchor(null)}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}
          >
            <Box sx={{ p: 1.5, minWidth: 260, maxHeight: 360, overflowY: 'auto' }}>
              <Stack direction="row" justifyContent="space-between" alignItems="center" mb={.5}>
                <Typography variant="caption" fontWeight={800} color="text.secondary">TIPOS DE PROCESO</Typography>
                <Stack direction="row" spacing={1}>
                  <Button size="small" sx={{ fontSize: 11, minWidth: 0, p: 0 }} onClick={() => setHiddenProcesses(new Set())}>Todos</Button>
                  <Button size="small" sx={{ fontSize: 11, minWidth: 0, p: 0 }} onClick={() => setHiddenProcesses(new Set(processes))}>Ninguno</Button>
                </Stack>
              </Stack>
              <Divider sx={{ mb: .5 }} />
              <Stack spacing={0}>
                {processes.map((process) => (
                  <FormControlLabel
                    key={process}
                    sx={{ '& .MuiFormControlLabel-label': { fontSize: 13 }, ml: 0 }}
                    control={<Checkbox size="small" checked={!hiddenProcesses.has(process)} onChange={() => toggleProcess(process)} />}
                    label={process}
                  />
                ))}
              </Stack>
            </Box>
          </Popover>
          <ToggleButtonGroup
            size="small"
            exclusive
            value={granularidad}
            onChange={(_e, next: Granularidad | null) => next && setGranularidad(next)}
            sx={{ '& .MuiToggleButton-root': { px: 1.25, py: 0.5, fontSize: 11, fontWeight: 700, lineHeight: 1 } }}
          >
            <ToggleButton value="dia" aria-label="Vista por día">Día</ToggleButton>
            <ToggleButton value="semana" aria-label="Vista por semana">Semana</ToggleButton>
            <ToggleButton value="mes" aria-label="Vista por mes">Mes</ToggleButton>
          </ToggleButtonGroup>
        </>
      }
    />
  );
}
