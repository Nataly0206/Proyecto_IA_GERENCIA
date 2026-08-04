import sql from 'mssql';
import { env } from './env';

const config: sql.config = {
  server: env.STB_DB_SERVER,
  port: env.STB_DB_PORT,
  database: env.STB_DB_DATABASE,
  user: env.STB_DB_USER,
  password: env.STB_DB_PASSWORD,
  options: {
    encrypt: env.STB_DB_ENCRYPT,
    trustServerCertificate: env.STB_DB_TRUST_SERVER_CERTIFICATE,
  },
  pool: { max: 10, min: 0, idleTimeoutMillis: 30000 },
  requestTimeout: 60000,
  connectionTimeout: 15000,
};

let pool: sql.ConnectionPool | null = null;

export async function getStbPool(): Promise<sql.ConnectionPool> {
  if (pool?.connected) return pool;
  pool = await new sql.ConnectionPool(config).connect();
  pool.on('error', (error) => {
    console.error('[stb-db] pool error:', error);
    pool = null;
  });
  return pool;
}

export async function closeStbPool(): Promise<void> {
  if (pool) await pool.close();
  pool = null;
}
