import sql from 'mssql';
import { env } from './env';
import { ApiError } from '../middleware/errorHandler';

let pool: sql.ConnectionPool | null = null;
let connecting: Promise<sql.ConnectionPool> | null = null;

export function isPayrollConfigured(): boolean {
  return !!(env.PAYROLL_DB_SERVER.trim() && env.PAYROLL_DB_DATABASE.trim()
    && env.PAYROLL_DB_USER.trim() && env.PAYROLL_DB_PASSWORD);
}

/** Conexión opcional y bajo demanda; no abre STBPayroll hasta que se consulte. */
export async function getPayrollPool(): Promise<sql.ConnectionPool> {
  if (!isPayrollConfigured()) {
    throw new ApiError(503, 'Completa la conexión PAYROLL_DB_* de STBPayroll en el .env del backend.');
  }
  if (pool?.connected) return pool;
  if (connecting) return connecting;
  const candidate = new sql.ConnectionPool({
    server: env.PAYROLL_DB_SERVER,
    port: env.PAYROLL_DB_PORT,
    database: env.PAYROLL_DB_DATABASE,
    user: env.PAYROLL_DB_USER,
    password: env.PAYROLL_DB_PASSWORD,
    options: {
      encrypt: env.PAYROLL_DB_ENCRYPT,
      trustServerCertificate: env.PAYROLL_DB_TRUST_SERVER_CERTIFICATE,
    },
    pool: { max: 5, min: 0, idleTimeoutMillis: 30000 },
    requestTimeout: 60000,
    connectionTimeout: 15000,
  });
  candidate.on('error', () => {
    console.error('[payroll-db] Error de conexión con STBPayroll.');
    if (pool === candidate) pool = null;
  });
  connecting = candidate.connect().then(connected => {
    pool = connected;
    return connected;
  }).catch(async error => {
    await candidate.close().catch(() => undefined);
    throw error;
  }).finally(() => { connecting = null; });
  return connecting;
}

export async function closePayrollPool(): Promise<void> {
  if (connecting) await connecting.catch(() => undefined);
  const current = pool;
  pool = null;
  if (current) await current.close();
}
