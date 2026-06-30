import dotenv from 'dotenv';

dotenv.config();

export const env = {
  PORT: Number(process.env.PORT ?? 3002),
  CORS_ORIGIN: process.env.CORS_ORIGIN ?? '*',
  DB_SERVER: process.env.DB_SERVER ?? 'localhost',
  DB_PORT: Number(process.env.DB_PORT ?? 1433),
  DB_DATABASE: process.env.DB_DATABASE ?? '',
  DB_USER: process.env.DB_USER ?? '',
  DB_PASSWORD: process.env.DB_PASSWORD ?? '',
  DB_ENCRYPT: (process.env.DB_ENCRYPT ?? 'false') === 'true',
  DB_TRUST_SERVER_CERTIFICATE:
    (process.env.DB_TRUST_SERVER_CERTIFICATE ?? 'true') === 'true',
  AI_API_KEY: process.env.AI_API_KEY ?? '',
  AI_BASE_URL: process.env.AI_BASE_URL ?? 'https://opencode.ai/zen/go/v1',
  AI_MODEL: process.env.AI_MODEL ?? 'minimax-m3',
};
