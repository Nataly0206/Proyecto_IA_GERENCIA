import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { DashboardFilters } from '../types';
import type { DashboardView } from '../components/layout/DashboardLayout';
import { apiClient } from '../api/client';

interface FiltersContextValue {
  filters: DashboardFilters;
  showChartValues: boolean;
  setShowChartValues: (show: boolean) => void;
  setFilters: (filters: DashboardFilters) => void;
  updateFilter: <K extends keyof DashboardFilters>(key: K, value: DashboardFilters[K]) => void;
  resetFilters: () => void;
}

const buildDefaultFilters = (): DashboardFilters => ({
  fechaInicial: dayjs().startOf('month').format('YYYY-MM-DD'),
  fechaFinal: dayjs().format('YYYY-MM-DD'),
  turno: '',
});

const FiltersContext = createContext<FiltersContextValue | null>(null);
const SHOW_CHART_VALUES_STORAGE_KEY = 'dashboard.showChartValues';

function readStoredShowChartValues(userId: string): boolean {
  try {
    const stored = window.localStorage.getItem(`${SHOW_CHART_VALUES_STORAGE_KEY}:${userId}`)
      ?? window.localStorage.getItem(SHOW_CHART_VALUES_STORAGE_KEY);
    return stored === null ? false : stored === 'true';
  } catch {
    return false;
  }
}

export function FiltersProvider({ children, view, userId }: { children: ReactNode; view: DashboardView | null; userId: string }) {
  const [filtersByView, setFiltersByView] = useState<Partial<Record<DashboardView, DashboardFilters>>>({});
  const filters = view ? filtersByView[view] ?? buildDefaultFilters() : buildDefaultFilters();
  const [showChartValues, setShowChartValuesState] = useState(() => readStoredShowChartValues(userId));
  const [chartPreferenceReady, setChartPreferenceReady] = useState(false);

  useEffect(() => {
    let active = true;
    setChartPreferenceReady(false);
    apiClient.get<{ showChartValues: boolean | null }>('/dashboard/preferencia-valores-graficas')
      .then(({ data }) => {
        if (!active) return;
        setShowChartValuesState(typeof data.showChartValues === 'boolean'
          ? data.showChartValues
          : readStoredShowChartValues(userId));
      })
      .catch(() => {
        if (active) setShowChartValuesState(readStoredShowChartValues(userId));
      })
      .finally(() => { if (active) setChartPreferenceReady(true); });
    return () => { active = false; };
  }, [userId]);

  useEffect(() => {
    if (!chartPreferenceReady) return;
    const timeout = window.setTimeout(() => {
      void apiClient.put('/dashboard/preferencia-valores-graficas', { showChartValues }).catch(() => undefined);
    }, 300);
    return () => window.clearTimeout(timeout);
  }, [chartPreferenceReady, showChartValues]);

  const setFilters = (nextFilters: DashboardFilters) => {
    if (!view) return;
    setFiltersByView((previous) => ({ ...previous, [view]: nextFilters }));
  };

  const updateFilter: FiltersContextValue['updateFilter'] = (key, val) => {
    if (!view) return;
    setFiltersByView((previous) => ({
      ...previous,
      [view]: { ...(previous[view] ?? buildDefaultFilters()), [key]: val },
    }));
  };

  const resetFilters = () => {
    if (!view) return;
    setFiltersByView((previous) => ({ ...previous, [view]: buildDefaultFilters() }));
  };

  const setShowChartValues = (show: boolean) => {
    setShowChartValuesState(show);
    try {
      window.localStorage.setItem(`${SHOW_CHART_VALUES_STORAGE_KEY}:${userId}`, String(show));
    } catch {
      // La preferencia sigue funcionando durante la sesión si el navegador
      // bloquea el almacenamiento local.
    }
  };

  const value = useMemo<FiltersContextValue>(
    () => ({
      filters,
      showChartValues,
      setShowChartValues,
      setFilters,
      updateFilter,
      resetFilters,
    }),
    [filters, showChartValues],
  );

  return <FiltersContext.Provider value={value}>{children}</FiltersContext.Provider>;
}

export function useFilters(): FiltersContextValue {
  const ctx = useContext(FiltersContext);
  if (!ctx) throw new Error('useFilters debe usarse dentro de <FiltersProvider>');
  return ctx;
}
