interface CacheEntry<T> {
  expiresAt: number;
  value?: T;
  promise?: Promise<T>;
}

const cache = new Map<string, CacheEntry<unknown>>();

export async function withTtlCache<T>(
  key: string,
  ttlMs: number,
  loader: () => Promise<T>,
): Promise<T> {
  const now = Date.now();
  const existing = cache.get(key) as CacheEntry<T> | undefined;

  if (existing && existing.expiresAt > now) {
    if (existing.value !== undefined) return existing.value;
    if (existing.promise) return existing.promise;
  }

  const promise = loader()
    .then((value) => {
      cache.set(key, { expiresAt: Date.now() + ttlMs, value });
      return value;
    })
    .catch((error) => {
      cache.delete(key);
      throw error;
    });

  cache.set(key, { expiresAt: now + ttlMs, promise });
  return promise;
}
