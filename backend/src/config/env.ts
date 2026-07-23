import dotenv from 'dotenv';

dotenv.config();

export const env = {
  NODE_ENV: process.env.NODE_ENV ?? 'development',
  PORT: Number(process.env.PORT ?? 3002),
  CORS_ORIGIN: process.env.CORS_ORIGIN ?? '',
  API_KEY: process.env.API_KEY ?? '',
  DB_SERVER: process.env.DB_SERVER ?? 'localhost',
  DB_PORT: Number(process.env.DB_PORT ?? 1433),
  DB_DATABASE: process.env.DB_DATABASE ?? '',
  DB_USER: process.env.DB_USER ?? '',
  DB_PASSWORD: process.env.DB_PASSWORD ?? '',
  DB_ENCRYPT: (process.env.DB_ENCRYPT ?? 'false') === 'true',
  DB_TRUST_SERVER_CERTIFICATE:
    (process.env.DB_TRUST_SERVER_CERTIFICATE ?? 'true') === 'true',
  AI_API_KEY: process.env.NVIDIA_API_KEY ?? process.env.AI_API_KEY ?? '',
  AI_BASE_URL: process.env.AI_BASE_URL ?? 'https://integrate.api.nvidia.com/v1',
  AI_MODEL: process.env.AI_MODEL ?? 'nvidia/llama-3.3-nemotron-super-49b-v1.5',
  AI_CONTEXT_PATH: process.env.AI_CONTEXT_PATH ?? '',
};
