import { useEffect, useMemo, useState } from 'react';
import { Box, Button, Checkbox, Divider, FormControlLabel, Popover, Stack, Typography } from '@mui/material';
import LocalShippingOutlinedIcon from '@mui/icons-material/LocalShippingOutlined';
import PeopleAltOutlinedIcon from '@mui/icons-material/PeopleAltOutlined';
import ProcessFilters from '../components/filters/ProcessFilters';
import ResumenCards from '../components/live/ResumenCards';
import ChartWidget from '../components/charts/ChartWidget';
import ExportContainersTable from '../components/charts/ExportContainersTable';
import { useProcesoResumen, useWidgetData } from '../hooks/useDashboardData';
import { ExportacionesResumen } from '../types';
import { formatPeriodo } from '../utils/format';
import { exportacionesWidgets } from '../config/dashboardConfig';
import { apiClient } from '../api/client';

const [porEstilo, porClienteMes] = exportacionesWidgets;
const TABLE_H = 440;
const CLIENTS_STORAGE_KEY = 'exportaciones-clientes-mensual-ocultos:v1';

function readHiddenClients(userId: string): Set<string> {
  try {
    const raw = localStorage.getItem(`${CLIENTS_STORAGE_KEY}:${userId}`);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : []);
  } catch {
    return new Set();
  }
}

export default function ExportacionesPage({ userId }: { userId: string }) {
  const { data, isLoading, isError, error, dataUpdatedAt } =
    useProcesoResumen<ExportacionesResumen>('exportaciones-resumen');
  const { data: clientRows } = useWidgetData('exportaciones-por-cliente-mes');
  const [hiddenClients, setHiddenClients] = useState<Set<string>>(() => readHiddenClients(userId));
  const [clientsAnchor, setClientsAnchor] = useState<HTMLElement | null>(null);
  const [preferencesUserId, setPreferencesUserId] = useState<string | null>(null);
  const clients = useMemo(() => Array.from(new Set(
    (clientRows ?? []).map((row) => String(row.cliente ?? 'Sin cliente')),
  )).sort(), [clientRows]);

  useEffect(() => {
    let active = true;
    setPreferencesUserId(null);
    apiClient.get<{ hiddenClients: string[] | null }>('/dashboard/exportaciones-preferencias-clientes')
      .then(({ data }) => {
        if (!active) return;
        const hidden = Array.isArray(data.hiddenClients)
          ? new Set(data.hiddenClients)
          : readHiddenClients(userId);
        setHiddenClients(hidden);
        setPreferencesUserId(userId);
      })
      .catch(() => {
        if (active) setHiddenClients(readHiddenClients(userId));
      });
    return () => { active = false; };
  }, [userId]);

  useEffect(() => {
    try {
      localStorage.setItem(`${CLIENTS_STORAGE_KEY}:${userId}`, JSON.stringify(Array.from(hiddenClients)));
    } catch {
      // La selección sigue funcionando durante la sesión si el almacenamiento está bloqueado.
    }
  }, [hiddenClients, userId]);

  useEffect(() => {
    if (preferencesUserId !== userId) return;
    const timeout = window.setTimeout(() => {
      void apiClient.put('/dashboard/exportaciones-preferencias-clientes', {
        hiddenClients: Array.from(hiddenClients),
      }).catch(() => undefined);
    }, 300);
    return () => window.clearTimeout(timeout);
  }, [hiddenClients, preferencesUserId, userId]);

  const toggleClient = (client: string) => {
    setHiddenClients((current) => {
      const next = new Set(current);
      if (next.has(client)) next.delete(client); else next.add(client);
      return next;
    });
  };
  const visibleClients = clients.length - clients.filter((client) => hiddenClients.has(client)).length;

  const semana =
    data && data.semanaInicio
      ? `Semana ${formatPeriodo(data.semanaInicio)} → ${formatPeriodo(data.semanaFin)}`
      : undefined;

  return (
    <Stack
      spacing={1.5}
      sx={{ height: '100%', minHeight: 0, overflowY: 'auto', overflowX: 'hidden', pb: 1.5 }}
    >
      <ProcessFilters
        title="Filtros de exportaciones"
        hint="Los contadores muestran la semana en curso (lunes a domingo); las tarjetas y tablas responden al rango de fechas."
        hideTurno
      />

      <ResumenCards
        title="Exportaciones — Semana en curso"
        icon={<LocalShippingOutlinedIcon color="primary" sx={{ fontSize: 16 }} />}
        isLoading={isLoading}
        isError={isError}
        errorText={error instanceof Error ? error.message : undefined}
        periodoLabel={semana}
        updatedAt={dataUpdatedAt}
        emptyText="Sin contenedores exportados esta semana."
        metrics={[
          { label: 'Libras a Francia', value: data?.librasFrancia ?? 0, unit: 'lbs' },
          { label: 'Libras a UK', value: data?.librasUK ?? 0, unit: 'lbs' },
          { label: 'Libras a AC Holding', value: data?.librasACHolding ?? 0, unit: 'lbs' },
          { label: 'Libras a terceros', value: data?.librasTerceros ?? 0, unit: 'lbs' },
          { label: 'Total exportado', value: data?.librasTotal ?? 0, unit: 'lbs', tone: 'good' },
        ]}
      />

      <ChartWidget config={porEstilo} />

      <ExportContainersTable />

      <Box sx={{ height: TABLE_H, flexShrink: 0 }}>
        <ChartWidget
          config={porClienteMes}
          transform={(rows) => rows.filter((row) => !hiddenClients.has(String(row.cliente ?? 'Sin cliente')))}
          actions={
            <>
              <Button size="small" variant="outlined" startIcon={<PeopleAltOutlinedIcon sx={{ fontSize: 16 }} />}
                onClick={(event) => setClientsAnchor(event.currentTarget)} sx={{ fontSize: 11, fontWeight: 700, py: 0.4 }}>
                Clientes ({visibleClients}/{clients.length})
              </Button>
              <Popover open={Boolean(clientsAnchor)} anchorEl={clientsAnchor} onClose={() => setClientsAnchor(null)}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'left' }}>
                <Box sx={{ p: 1.5, minWidth: 250, maxHeight: 340, overflowY: 'auto' }}>
                  <Stack direction="row" justifyContent="space-between" alignItems="center" mb={0.5}>
                    <Typography variant="caption" fontWeight={800} color="text.secondary">CLIENTES</Typography>
                    <Stack direction="row" spacing={1}>
                      <Button size="small" sx={{ fontSize: 11, minWidth: 0, p: 0 }} onClick={() => setHiddenClients(new Set())}>Todos</Button>
                      <Button size="small" sx={{ fontSize: 11, minWidth: 0, p: 0 }} onClick={() => setHiddenClients(new Set(clients))}>Ninguno</Button>
                    </Stack>
                  </Stack>
                  <Divider sx={{ mb: 0.5 }} />
                  <Stack spacing={0}>
                    {clients.map((client) => <FormControlLabel key={client}
                      sx={{ '& .MuiFormControlLabel-label': { fontSize: 13 }, ml: 0 }}
                      control={<Checkbox size="small" checked={!hiddenClients.has(client)} onChange={() => toggleClient(client)} />}
                      label={client} />)}
                    {clients.length === 0 && <Typography variant="caption" color="text.secondary">Sin clientes en el período.</Typography>}
                  </Stack>
                </Box>
              </Popover>
            </>
          }
        />
      </Box>
    </Stack>
  );
}
