import { createClient } from 'redis';
import { env } from './env';

type RedisClient = ReturnType<typeof createClient>;

let client: RedisClient | null = null;
let connectionPromise: Promise<RedisClient | null> | null = null;
let lastErrorLogAt = 0;

function logRedisError(error: unknown): void {
  const now = Date.now();
  if (now - lastErrorLogAt < 30_000) return;
  lastErrorLogAt = now;
  console.error('[cache] Redis no está disponible; se usará SQL/caché local:', error);
}

export async function getRedisClient(): Promise<RedisClient | null> {
  if (!env.CACHE_ENABLED || !env.REDIS_URL) return null;
  if (client?.isReady) return client;
  if (connectionPromise) {
    return Promise.race([
      connectionPromise,
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 1_200)),
    ]);
  }

  if (!client) {
    client = createClient({
      url: env.REDIS_URL,
      socket: {
        connectTimeout: 1_000,
        reconnectStrategy: (retries) => Math.min(50 * 2 ** retries, 3_000),
      },
      disableOfflineQueue: true,
    });
    client.on('error', logRedisError);
    client.on('ready', () => console.log('[cache] Redis conectado.'));
  }

  connectionPromise = client.connect()
    .then(() => client)
    .catch((error) => {
      logRedisError(error);
      return null;
    })
    .finally(() => {
      connectionPromise = null;
    });
  return Promise.race([
    connectionPromise,
    new Promise<null>((resolve) => setTimeout(() => resolve(null), 1_200)),
  ]);
}

export function redisStatus(): 'disabled' | 'ready' | 'connecting' | 'unavailable' {
  if (!env.CACHE_ENABLED || !env.REDIS_URL) return 'disabled';
  if (client?.isReady) return 'ready';
  if (client?.isOpen || connectionPromise) return 'connecting';
  return 'unavailable';
}

export async function closeRedis(): Promise<void> {
  if (!client?.isOpen) return;
  await client.close().catch(logRedisError);
}
