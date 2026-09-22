import { createContext, ReactNode, useContext, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { DashboardFilters } from '../types';
import type { DashboardView } from '../components/layout/DashboardLayout';

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

function readStoredShowChartValues(): boolean {
  try {
    const stored = window.localStorage.getItem(SHOW_CHART_VALUES_STORAGE_KEY);
    return stored === null ? false : stored === 'true';
  } catch {
    return false;
  }
}

export function FiltersProvider({ children, view }: { children: ReactNode; view: DashboardView | null }) {
  const [filtersByView, setFiltersByView] = useState<Partial<Record<DashboardView, DashboardFilters>>>({});
  const filters = view ? filtersByView[view] ?? buildDefaultFilters() : buildDefaultFilters();
  const [showChartValues, setShowChartValuesState] = useState(readStoredShowChartValues);

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
      window.localStorage.setItem(SHOW_CHART_VALUES_STORAGE_KEY, String(show));
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
