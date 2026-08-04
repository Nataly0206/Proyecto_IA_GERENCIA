import { useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchIqfLive, fetchPeladoLive, fetchWidgetData } from '../api/dashboard.api';
import { useFilters } from '../context/FiltersContext';
import { DashboardEndpoint, DataRow, IqfLiveResponse, PeladoLiveResponse } from '../types';
import { getDateFilterError } from '../utils/dateFilters';

/** Todo el dashboard se actualiza automáticamente cada 5 minutos */
export const REFRESH_INTERVAL_MS = 5 * 60 * 1000;
export const LIVE_REFRESH_INTERVAL_MS = REFRESH_INTERVAL_MS;

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
  const filtersAreValid = !getDateFilterError(filters);
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
    enabled: filtersAreValid,
    staleTime: REFRESH_INTERVAL_MS,
    refetchInterval: REFRESH_INTERVAL_MS,
    refetchIntervalInBackground: true,
  });
}

export function useIqfLive() {
  const queryClient = useQueryClient();
  const queryKey = ['dashboard', 'iqf-tiempo-real'] as const;
  const cacheKey = browserCacheKey(['live', 'current']);
  const cached = readBrowserCache<IqfLiveResponse>(cacheKey, LIVE_REFRESH_INTERVAL_MS);

  const query = useQuery<IqfLiveResponse>({
    queryKey,
    queryFn: async () => {
      const data = await fetchIqfLive();
      writeBrowserCache(cacheKey, data);
      return data;
    },
    initialData: cached?.data,
    initialDataUpdatedAt: cached?.updatedAt,
    staleTime: LIVE_REFRESH_INTERVAL_MS,
    refetchInterval: LIVE_REFRESH_INTERVAL_MS,
    refetchIntervalInBackground: true,
  });

  const refreshNow = async (): Promise<IqfLiveResponse> => {
    const data = await fetchIqfLive(true);
    writeBrowserCache(cacheKey, data);
    queryClient.setQueryData<IqfLiveResponse>(queryKey, data);
    return data;
  };

  return { ...query, refreshNow };
}

export function usePeladoLive() {
  const queryClient = useQueryClient();
  const queryKey = ['dashboard', 'pelado-tiempo-real'] as const;
  const cacheKey = browserCacheKey(['live', 'pelado']);
  const cached = readBrowserCache<PeladoLiveResponse>(cacheKey, LIVE_REFRESH_INTERVAL_MS);

  const query = useQuery<PeladoLiveResponse>({
    queryKey,
    queryFn: async () => {
      const data = await fetchPeladoLive();
      writeBrowserCache(cacheKey, data);
      return data;
    },
    initialData: cached?.data,
    initialDataUpdatedAt: cached?.updatedAt,
    staleTime: LIVE_REFRESH_INTERVAL_MS,
    refetchInterval: LIVE_REFRESH_INTERVAL_MS,
    refetchIntervalInBackground: true,
  });

  const refreshNow = async (): Promise<PeladoLiveResponse> => {
    const data = await fetchPeladoLive(true);
    writeBrowserCache(cacheKey, data);
    queryClient.setQueryData<PeladoLiveResponse>(queryKey, data);
    return data;
  };

  return { ...query, refreshNow };
}

/** Fuerza una lectura nueva de todos los widgets visibles y contadores. */
export function useRefreshDashboard() {
  const { filters } = useFilters();
  const queryClient = useQueryClient();

  return async (): Promise<void> => {
    const filterError = getDateFilterError(filters);
    if (filterError) throw new Error(filterError);

    const activeQueries = queryClient.getQueryCache().findAll({
      queryKey: ['dashboard'],
      type: 'active',
    });
    const liveEndpoints = new Set(['iqf-tiempo-real', 'pelado-tiempo-real']);
    const endpoints = Array.from(
      new Set(
        activeQueries
          .map((query) => query.queryKey[1])
          .filter(
            (endpoint): endpoint is DashboardEndpoint =>
              typeof endpoint === 'string' && !liveEndpoints.has(endpoint),
          ),
      ),
    );

    const liveKey = ['dashboard', 'iqf-tiempo-real'] as const;
    const liveCacheKey = browserCacheKey(['live', 'current']);
    const peladoLiveKey = ['dashboard', 'pelado-tiempo-real'] as const;
    const peladoLiveCacheKey = browserCacheKey(['live', 'pelado']);

    await Promise.all([
      fetchIqfLive(true).then((data) => {
        writeBrowserCache(liveCacheKey, data);
        queryClient.setQueryData<IqfLiveResponse>(liveKey, data);
      }),
      fetchPeladoLive(true).then((data) => {
        writeBrowserCache(peladoLiveCacheKey, data);
        queryClient.setQueryData<PeladoLiveResponse>(peladoLiveKey, data);
      }),
      ...endpoints.map(async (endpoint) => {
        const data = await fetchWidgetData(endpoint, filters, true);
        const queryKey = ['dashboard', endpoint, filters] as const;
        const cacheKey = browserCacheKey([
          'widget',
          endpoint,
          filters.fechaInicial,
          filters.fechaFinal,
          filters.turno,
        ]);
        writeBrowserCache(cacheKey, data);
        queryClient.setQueryData<DataRow[]>(queryKey, data);
      }),
    ]);
  };
}
