import { useQuery } from '@tanstack/react-query';
import { fetchIqfLive, fetchWidgetData } from '../api/dashboard.api';
import { useFilters } from '../context/FiltersContext';
import { DashboardEndpoint, DataRow, IqfLiveResponse } from '../types';

/** Actualización automática cada 5 minutos */
export const REFRESH_INTERVAL_MS = 5 * 60 * 1000;

/** Los contadores en vivo se refrescan cada 30 minutos */
export const LIVE_REFRESH_INTERVAL_MS = 30 * 60 * 1000;

interface BrowserCacheEntry<T> {
  updatedAt: number;
  data: T;
}

const CACHE_PREFIX = 'dashboard-cache:v1';

function browserCacheKey(parts: unknown[]): string {
  return `${CACHE_PREFIX}:${JSON.stringify(parts)}`;
}

function readBrowserCache<T>(key: string, maxAgeMs: number): BrowserCacheEntry<T> | undefined {
  if (typeof window === 'undefined') return undefined;

  try {
    const raw = window.localStorage.getItem(key);
    if (!raw) return undefined;

    const entry = JSON.parse(raw) as BrowserCacheEntry<T>;
    if (!entry.updatedAt || Date.now() - entry.updatedAt > maxAgeMs) {
      window.localStorage.removeItem(key);
      return undefined;
    }

    return entry;
  } catch {
    window.localStorage.removeItem(key);
    return undefined;
  }
}

function writeBrowserCache<T>(key: string, data: T): void {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(
      key,
      JSON.stringify({
        updatedAt: Date.now(),
        data,
      } satisfies BrowserCacheEntry<T>),
    );
  } catch {
    // Si el navegador no permite localStorage o está lleno, la app sigue consultando normal.
  }
}

export function useWidgetData(endpoint: DashboardEndpoint) {
  const { filters } = useFilters();
  const cacheKey = browserCacheKey([
    'widget',
    endpoint,
    filters.fechaInicial,
    filters.fechaFinal,
    filters.turno,
  ]);
  const cached = readBrowserCache<DataRow[]>(cacheKey, REFRESH_INTERVAL_MS);

  return useQuery<DataRow[]>({
    queryKey: ['dashboard', endpoint, filters],
    queryFn: async () => {
      const data = await fetchWidgetData(endpoint, filters);
      writeBrowserCache(cacheKey, data);
      return data;
    },
    initialData: cached?.data,
    initialDataUpdatedAt: cached?.updatedAt,
    staleTime: REFRESH_INTERVAL_MS,
    refetchInterval: REFRESH_INTERVAL_MS,
  });
}

export function useIqfLive() {
  const { filters } = useFilters();
  const cacheKey = browserCacheKey(['live', filters.turno]);
  const cached = readBrowserCache<IqfLiveResponse>(cacheKey, LIVE_REFRESH_INTERVAL_MS);

  return useQuery<IqfLiveResponse>({
    queryKey: ['dashboard', 'iqf-tiempo-real', filters.turno],
    queryFn: async () => {
      const data = await fetchIqfLive(filters.turno);
      writeBrowserCache(cacheKey, data);
      return data;
    },
    initialData: cached?.data,
    initialDataUpdatedAt: cached?.updatedAt,
    staleTime: LIVE_REFRESH_INTERVAL_MS,
    refetchInterval: LIVE_REFRESH_INTERVAL_MS,
    refetchIntervalInBackground: true,
  });
}
