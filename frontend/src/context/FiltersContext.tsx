import { createContext, ReactNode, useContext, useMemo, useState } from 'react';
import dayjs from 'dayjs';
import { DashboardFilters } from '../types';

interface FiltersContextValue {
  filters: DashboardFilters;
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

export function FiltersProvider({ children }: { children: ReactNode }) {
  const [filters, setFilters] = useState<DashboardFilters>(buildDefaultFilters);

  const value = useMemo<FiltersContextValue>(
    () => ({
      filters,
      setFilters,
      updateFilter: (key, val) => setFilters((prev) => ({ ...prev, [key]: val })),
      resetFilters: () => setFilters(buildDefaultFilters()),
    }),
    [filters],
  );

  return <FiltersContext.Provider value={value}>{children}</FiltersContext.Provider>;
}

export function useFilters(): FiltersContextValue {
  const ctx = useContext(FiltersContext);
  if (!ctx) throw new Error('useFilters debe usarse dentro de <FiltersProvider>');
  return ctx;
}
