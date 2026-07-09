import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { env } from './config/env';
import { closePool } from './config/db';
import dashboardRoutes from './routes/dashboard.routes';
import aiRoutes from './routes/ai.routes';
import { errorHandler, notFound } from './middleware/errorHandler';
import { apiKeyAuth } from './middleware/apiKeyAuth';

// Fail-closed: en producción no se arranca sin API_KEY, para no exponer
// la API (y por tanto la BD real vía el asistente IA) sin autenticación.
if (env.NODE_ENV === 'production' && !env.API_KEY) {
  throw new Error('API_KEY es obligatoria cuando NODE_ENV=production.');
}

const app = express();

app.use(helmet());

const allowedOrigins = env.CORS_ORIGIN.split(',').map((o) => o.trim()).filter(Boolean);
app.use(
  cors({
    origin: allowedOrigins.length > 0 ? allowedOrigins : false,
  }),
);

app.use(express.json({ limit: '256kb' }));

const generalLimiter = rateLimit({
  windowMs: 60_000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
});

const aiLimiter = rateLimit({
  windowMs: 60_000,
  limit: 15,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas solicitudes al asistente IA. Intenta de nuevo en un minuto.' },
});

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api', generalLimiter);
app.use('/api/dashboard', apiKeyAuth, dashboardRoutes);
app.use('/api/ai', apiKeyAuth, aiLimiter, aiRoutes);

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
