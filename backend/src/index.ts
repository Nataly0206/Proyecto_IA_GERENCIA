import express from 'express';
import cors from 'cors';
import { env } from './config/env';
import { closePool } from './config/db';
import dashboardRoutes from './routes/dashboard.routes';
import { errorHandler, notFound } from './middleware/errorHandler';

const app = express();

app.use(cors({ origin: env.CORS_ORIGIN === '*' ? true : env.CORS_ORIGIN.split(',') }));
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/dashboard', dashboardRoutes);

app.use(notFound);
app.use(errorHandler);

const server = app.listen(env.PORT, () => {
  console.log(`[api] Dashboard API escuchando en http://localhost:${env.PORT}`);
});

const shutdown = async (): Promise<void> => {
  console.log('[api] Cerrando servidor...');
  server.close();
  await closePool();
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
