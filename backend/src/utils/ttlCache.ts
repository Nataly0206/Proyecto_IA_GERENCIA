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

/** Caché híbrido L1 local + Redis compartido. Si Redis falla, usa SQL. */
export async function withTtlCache<T>(
  key: string,
  ttlMs: number,
  loader: () => Promise<T>,
  forceRefresh = false,
): Promise<T> {
  if (!env.CACHE_ENABLED) return loader();

  const now = Date.now();
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
        return redisValue;
      }
    }

    cacheMetrics.misses += 1;
    const value = forceRefresh
      ? await loader().then(async (loaded) => {
        await writeRedis(key, loaded, ttlMs);
        return loaded;
      })
      : await loadWithDistributedLock(key, ttlMs, loader);
    cache.set(key, { expiresAt: Date.now() + localTtlMs, value });
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
