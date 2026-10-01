import { createHash, randomUUID } from 'crypto';
import { env } from '../config/env';
import { getRedisClient } from '../config/redis';

interface CacheEntry<T> {
  expiresAt: number;
  value?: T;
  promise?: Promise<T>;
}

interface StoredValue<T> {
  value: T;
}

const cache = new Map<string, CacheEntry<unknown>>();
const MAX_LOCAL_ENTRIES = 500;

export const cacheMetrics = {
  localHits: 0,
  redisHits: 0,
  misses: 0,
  redisErrors: 0,
  backgroundRefreshes: 0,
  refreshErrors: 0,
  hotKeys: 0,
};

function redisKey(key: string): string {
  const digest = createHash('sha256').update(key).digest('hex');
  return `${env.REDIS_PREFIX}:data:${digest}`;
}

function findDateField(value: unknown, field: 'fechaInicial' | 'fechaFinal'): string | undefined {
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findDateField(item, field);
      if (found) return found;
    }
  } else if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    if (typeof record[field] === 'string') return record[field];
    for (const item of Object.values(record)) {
      const found = findDateField(item, field);
      if (found) return found;
    }
  }
  return undefined;
}

function effectiveTtl(key: string, requestedTtlMs: number): number {
  try {
    const parsed: unknown = JSON.parse(key);
    const fechaFinal = findDateField(parsed, 'fechaFinal');
    const fechaInicial = findDateField(parsed, 'fechaInicial');
    return fechaFinal ? reportCacheTtl(fechaFinal, fechaInicial) : requestedTtlMs;
  } catch {
    return requestedTtlMs;
  }
}

function pruneLocalCache(now: number): void {
  if (cache.size < MAX_LOCAL_ENTRIES) return;
  for (const [key, entry] of cache) {
    if (entry.expiresAt <= now) cache.delete(key);
  }
  while (cache.size >= MAX_LOCAL_ENTRIES) {
    const oldestKey = cache.keys().next().value as string | undefined;
    if (!oldestKey) break;
    cache.delete(oldestKey);
  }
}

async function readRedis<T>(key: string): Promise<T | undefined> {
  try {
    const redis = await getRedisClient();
    if (!redis) return undefined;
    const serialized = await redis.get(redisKey(key));
    if (serialized === null) return undefined;
    return (JSON.parse(serialized) as StoredValue<T>).value;
  } catch {
    cacheMetrics.redisErrors += 1;
    return undefined;
  }
}

async function writeRedis<T>(key: string, value: T, ttlMs: number): Promise<void> {
  try {
    const redis = await getRedisClient();
    if (!redis) return;
    await redis.set(redisKey(key), JSON.stringify({ value } satisfies StoredValue<T>), {
      PX: Math.max(1, Math.floor(ttlMs)),
    });
  } catch {
    cacheMetrics.redisErrors += 1;
  }
}

async function loadWithDistributedLock<T>(key: string, ttlMs: number, loader: () => Promise<T>): Promise<T> {
  const redis = await getRedisClient().catch(() => null);
  if (!redis) return loader();

  const dataKey = redisKey(key);
  const lockKey = `${dataKey}:lock`;
  const token = randomUUID();
  let ownsLock = false;

  try {
    ownsLock = (await redis.set(lockKey, token, { NX: true, PX: 60_000 })) === 'OK';
    if (!ownsLock) {
      for (let attempt = 0; attempt < 20; attempt += 1) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        const serialized = await redis.get(dataKey);
        if (serialized !== null) return (JSON.parse(serialized) as StoredValue<T>).value;
      }
    }

  } catch {
    cacheMetrics.redisErrors += 1;
    return loader();
  }

  try {
    const value = await loader();
    await writeRedis(key, value, ttlMs);
    return value;
  } finally {
    if (ownsLock) {
      await redis.sendCommand([
        'EVAL',
        'if redis.call("get", KEYS[1]) == ARGV[1] then return redis.call("del", KEYS[1]) else return 0 end',
        '1',
        lockKey,
        token,
      ]).catch(() => undefined);
    }
  }
}

/**
 * Renovación anticipada ("refresh-ahead"). Las claves consultadas recientemente
 * se vuelven a cargar en segundo plano poco antes de vencer, de modo que el
 * usuario reciba la respuesta desde caché en lugar de esperar a SQL.
 */
interface HotKey {
  loader: () => Promise<unknown>;
  requestedTtlMs: number;
  lastRequestedAt: number;
  lastDurationMs: number;
  nextRefreshAt: number;
  refreshing: boolean;
}

const hotKeys = new Map<string, HotKey>();
const MAX_HOT_KEYS = 200;
const REFRESH_TICK_MS = 5_000;
let refreshTimer: NodeJS.Timeout | null = null;
let activeRefreshes = 0;
let lastRefreshErrorLogAt = 0;

/** Nunca se renueva más seguido de lo que SQL puede sostener (10x la duración de la consulta). */
function refreshIntervalMs(ttlMs: number, durationMs: number): number {
  return Math.max(ttlMs * 0.8, durationMs * 10);
}

function storeTtlMs(ttlMs: number, intervalMs: number): number {
  return Math.max(ttlMs, intervalMs * 1.25);
}

function touchHotKey(key: string, requestedTtlMs: number, loader: () => Promise<unknown>): HotKey | undefined {
  if (env.CACHE_REFRESH_AHEAD_MINUTES <= 0) return undefined;
  const now = Date.now();
  let entry = hotKeys.get(key);
  if (entry) {
    entry.loader = loader;
    entry.requestedTtlMs = requestedTtlMs;
    entry.lastRequestedAt = now;
  } else {
    if (hotKeys.size >= MAX_HOT_KEYS) {
      let oldestKey: string | undefined;
      let oldestAt = Infinity;
      for (const [candidate, value] of hotKeys) {
        if (!value.refreshing && value.lastRequestedAt < oldestAt) {
          oldestAt = value.lastRequestedAt;
          oldestKey = candidate;
        }
      }
      if (oldestKey) hotKeys.delete(oldestKey);
    }
    entry = {
      loader, requestedTtlMs, lastRequestedAt: now, lastDurationMs: 0, nextRefreshAt: 0, refreshing: false,
    };
    hotKeys.set(key, entry);
  }
  if (!refreshTimer) {
    refreshTimer = setInterval(refreshTick, REFRESH_TICK_MS);
    refreshTimer.unref();
  }
  cacheMetrics.hotKeys = hotKeys.size;
  return entry;
}

async function refreshHotKey(key: string, entry: HotKey): Promise<void> {
  entry.refreshing = true;
  activeRefreshes += 1;
  const startedAt = Date.now();
  const ttlMs = effectiveTtl(key, entry.requestedTtlMs);
  try {
    const value = await entry.loader();
    const durationMs = Date.now() - startedAt;
    const intervalMs = refreshIntervalMs(ttlMs, durationMs);
    const storeMs = storeTtlMs(ttlMs, intervalMs);
    await writeRedis(key, value, storeMs);
    cache.set(key, { expiresAt: Date.now() + Math.min(storeMs, intervalMs + 2 * REFRESH_TICK_MS), value });
    entry.lastDurationMs = durationMs;
    entry.nextRefreshAt = Date.now() + intervalMs;
    cacheMetrics.backgroundRefreshes += 1;
  } catch (error) {
    cacheMetrics.refreshErrors += 1;
    entry.nextRefreshAt = Date.now() + refreshIntervalMs(ttlMs, entry.lastDurationMs);
    if (Date.now() - lastRefreshErrorLogAt > 30_000) {
      lastRefreshErrorLogAt = Date.now();
      console.error('[cache] Falló la renovación en segundo plano:', error);
    }
  } finally {
    entry.refreshing = false;
    activeRefreshes -= 1;
  }
}

function refreshTick(): void {
  const now = Date.now();
  const hotWindowMs = env.CACHE_REFRESH_AHEAD_MINUTES * 60_000;
  const due: Array<[string, HotKey]> = [];
  for (const [key, entry] of hotKeys) {
    if (entry.refreshing) continue;
    if (now - entry.lastRequestedAt > hotWindowMs) {
      hotKeys.delete(key);
    } else if (entry.nextRefreshAt > 0 && entry.nextRefreshAt <= now) {
      due.push([key, entry]);
    }
  }
  cacheMetrics.hotKeys = hotKeys.size;
  due.sort((a, b) => a[1].nextRefreshAt - b[1].nextRefreshAt);
  for (const [key, entry] of due) {
    if (activeRefreshes >= env.CACHE_REFRESH_CONCURRENCY) break;
    void refreshHotKey(key, entry);
  }
}

/** Caché híbrido L1 local + Redis compartido. Si Redis falla, usa SQL. */
export async function withTtlCache<T>(
  key: string,
  ttlMs: number,
  loader: () => Promise<T>,
  forceRefresh = false,
): Promise<T> {
  if (!env.CACHE_ENABLED) return loader();

  const now = Date.now();
  const hotKey = touchHotKey(key, ttlMs, loader);
  ttlMs = effectiveTtl(key, ttlMs);
  const existing = cache.get(key) as CacheEntry<T> | undefined;
  if (!forceRefresh && existing && existing.expiresAt > now) {
    cacheMetrics.localHits += 1;
    if (existing.value !== undefined) return existing.value;
    if (existing.promise) return existing.promise;
  }

  pruneLocalCache(now);
  const localTtlMs = Math.min(ttlMs, env.CACHE_LOCAL_TTL_SECONDS * 1_000);
  const promise = (async () => {
    if (!forceRefresh) {
      const redisValue = await readRedis<T>(key);
      if (redisValue !== undefined) {
        cacheMetrics.redisHits += 1;
        cache.set(key, { expiresAt: Date.now() + localTtlMs, value: redisValue });
        // Valor de edad desconocida (otro proceso o reinicio): se renueva pronto.
        if (hotKey && hotKey.nextRefreshAt === 0) hotKey.nextRefreshAt = Date.now() + ttlMs * 0.5;
        return redisValue;
      }
    }

    cacheMetrics.misses += 1;
    const startedAt = Date.now();
    const value = forceRefresh
      ? await loader().then(async (loaded) => {
        await writeRedis(key, loaded, ttlMs);
        return loaded;
      })
      : await loadWithDistributedLock(key, ttlMs, loader);
    cache.set(key, { expiresAt: Date.now() + localTtlMs, value });
    if (hotKey) {
      const durationMs = Date.now() - startedAt;
      const intervalMs = refreshIntervalMs(ttlMs, durationMs);
      hotKey.lastDurationMs = durationMs;
      hotKey.nextRefreshAt = Date.now() + intervalMs;
      // Consultas lentas se renuevan menos seguido: el valor debe vivir hasta entonces.
      const storeMs = storeTtlMs(ttlMs, intervalMs);
      if (storeMs > ttlMs) await writeRedis(key, value, storeMs);
    }
    return value;
  })().catch((error) => {
    cache.delete(key);
    throw error;
  });

  cache.set(key, { expiresAt: now + localTtlMs, promise });
  return promise;
}

/** TTL largo si el rango terminó antes de hoy; corto si aún puede cambiar. */
export function reportCacheTtl(fechaFinal?: string, fechaInicial?: string): number {
  const today = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Tegucigalpa',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
  const seconds = fechaInicial === today && fechaFinal === today
    ? env.CACHE_LIVE_TTL_SECONDS
    : fechaFinal && fechaFinal < today
      ? env.CACHE_HISTORICAL_TTL_SECONDS
      : env.CACHE_CURRENT_TTL_SECONDS;
  return seconds * 1_000;
}
