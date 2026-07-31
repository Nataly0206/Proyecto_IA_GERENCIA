import { createContext, ReactNode, useContext, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { DashboardFilters } from '../types';

interface FiltersContextValue {
  filters: DashboardFilters;
  showChartValues: boolean;
  setShowChartValues: (show: boolean) => void;
  setFilters: (filters: DashboardFilters) => void;
  updateFilter: <K extends keyof DashboardFilters>(key: K, value: DashboardFilters[K]) => void;
  resetFilters: () => void;
}

const buildDefaultFilters = (): DashboardFilters => ({
  fechaInicial: dayjs().subtract(30, 'day').format('YYYY-MM-DD'),
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

export function FiltersProvider({ children }: { children: ReactNode }) {
  const [filters, setFilters] = useState<DashboardFilters>(buildDefaultFilters);
  const [showChartValues, setShowChartValuesState] = useState(readStoredShowChartValues);

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
      updateFilter: (key, val) => setFilters((prev) => ({ ...prev, [key]: val })),
      resetFilters: () => setFilters(buildDefaultFilters()),
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
