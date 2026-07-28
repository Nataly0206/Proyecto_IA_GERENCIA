import sql from 'mssql';
import { env } from './env';

const config: sql.config = {
  server: env.AUTH_DB_SERVER,
  port: env.AUTH_DB_PORT,
  database: env.AUTH_DB_DATABASE,
  user: env.AUTH_DB_USER,
  password: env.AUTH_DB_PASSWORD,
  options: {
    encrypt: env.AUTH_DB_ENCRYPT,
    trustServerCertificate: env.AUTH_DB_TRUST_SERVER_CERTIFICATE,
  },
  pool: { max: 10, min: 0, idleTimeoutMillis: 30000 },
  requestTimeout: 30000,
  connectionTimeout: 15000,
};

let pool: sql.ConnectionPool | null = null;

export async function getAuthPool(): Promise<sql.ConnectionPool> {
  if (pool?.connected) return pool;
  pool = await new sql.ConnectionPool(config).connect();
  pool.on('error', (error) => {
    console.error('[auth-db] pool error:', error);
    pool = null;
  });
  return pool;
}

export async function closeAuthPool(): Promise<void> {
  if (pool) await pool.close();
  pool = null;
}
