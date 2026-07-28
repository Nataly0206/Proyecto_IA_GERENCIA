import dotenv from 'dotenv';

dotenv.config();

function numberFromEnv(name: string, fallback: number, min: number, max: number): number {
  const raw = process.env[name];
  const value = raw === undefined || raw === '' ? fallback : Number(raw);
  if (!Number.isFinite(value) || !Number.isInteger(value) || value < min || value > max) {
    throw new Error(`${name} debe ser un entero entre ${min} y ${max}.`);
  }
  return value;
}

export const env = {
  NODE_ENV: process.env.NODE_ENV ?? 'development',
  PORT: numberFromEnv('PORT', 3002, 1, 65535),
  CORS_ORIGIN: process.env.CORS_ORIGIN ?? '',
  API_KEY: process.env.API_KEY ?? '',
  LOGIN_PASSWORD: process.env.LOGIN_PASSWORD ?? '',
  SESSION_SECRET: process.env.SESSION_SECRET ?? '',
  SESSION_HOURS: numberFromEnv('SESSION_HOURS', 12, 1, 168),
  COOKIE_SECURE: (process.env.COOKIE_SECURE ?? 'false') === 'true',
  DB_SERVER: process.env.DB_SERVER ?? 'localhost',
  DB_PORT: numberFromEnv('DB_PORT', 1433, 1, 65535),
  DB_DATABASE: process.env.DB_DATABASE ?? '',
  DB_USER: process.env.DB_USER ?? '',
  DB_PASSWORD: process.env.DB_PASSWORD ?? '',
  DB_ENCRYPT: (process.env.DB_ENCRYPT ?? 'false') === 'true',
  DB_TRUST_SERVER_CERTIFICATE:
    (process.env.DB_TRUST_SERVER_CERTIFICATE ?? 'true') === 'true',
  AUTH_DB_SERVER: process.env.AUTH_DB_SERVER ?? process.env.DB_SERVER ?? 'localhost',
  AUTH_DB_PORT: numberFromEnv(
    'AUTH_DB_PORT',
    numberFromEnv('DB_PORT', 1433, 1, 65535),
    1,
    65535,
  ),
  AUTH_DB_DATABASE: process.env.AUTH_DB_DATABASE ?? 'DashboardGerencialAuth',
  AUTH_DB_USER: process.env.AUTH_DB_USER ?? process.env.DB_USER ?? '',
  AUTH_DB_PASSWORD: process.env.AUTH_DB_PASSWORD ?? process.env.DB_PASSWORD ?? '',
  AUTH_DB_ENCRYPT:
    (process.env.AUTH_DB_ENCRYPT ?? process.env.DB_ENCRYPT ?? 'false') === 'true',
  AUTH_DB_TRUST_SERVER_CERTIFICATE:
    (process.env.AUTH_DB_TRUST_SERVER_CERTIFICATE
      ?? process.env.DB_TRUST_SERVER_CERTIFICATE
      ?? 'true') === 'true',
  ADMIN_USER: process.env.ADMIN_USER ?? 'admin',
  ADMIN_NAME: process.env.ADMIN_NAME ?? 'Administrador',
  ADMIN_EMAIL: process.env.ADMIN_EMAIL ?? process.env.MAIL_FROM_ADDRESS ?? 'admin@localhost',
  MAIL_MAILER: process.env.MAIL_MAILER ?? 'smtp',
  MAIL_HOST: process.env.MAIL_HOST ?? process.env.SMTP_HOST ?? '',
  MAIL_PORT: numberFromEnv('MAIL_PORT', Number(process.env.SMTP_PORT) || 587, 1, 65535),
  MAIL_ENCRYPTION: (process.env.MAIL_ENCRYPTION ?? '').toLowerCase(),
  MAIL_USERNAME: process.env.MAIL_USERNAME ?? process.env.SMTP_USER ?? '',
  MAIL_PASSWORD: process.env.MAIL_PASSWORD ?? process.env.SMTP_PASSWORD ?? '',
  MAIL_FROM_ADDRESS: process.env.MAIL_FROM_ADDRESS ?? '',
  MAIL_FROM_NAME: process.env.MAIL_FROM_NAME ?? 'Dashboard Gerencial',
  AI_API_KEY: process.env.NVIDIA_API_KEY ?? process.env.AI_API_KEY ?? '',
  AI_BASE_URL: process.env.AI_BASE_URL ?? 'https://integrate.api.nvidia.com/v1',
  AI_MODEL: process.env.AI_MODEL ?? 'nvidia/llama-3.3-nemotron-super-49b-v1.5',
  AI_CONTEXT_PATH: process.env.AI_CONTEXT_PATH ?? '',
};
