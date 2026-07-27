import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { env } from './config/env';
import { closePool } from './config/db';
import dashboardRoutes from './routes/dashboard.routes';
import aiRoutes from './routes/ai.routes';
import authRoutes from './routes/auth.routes';
import { errorHandler, notFound } from './middleware/errorHandler';
import { sessionAuth } from './middleware/sessionAuth';

// Fail-closed: en producción no se arranca sin API_KEY, para no exponer
// la API (y por tanto la BD real vía el asistente IA) sin autenticación.
if (!env.LOGIN_PASSWORD) {
  throw new Error('LOGIN_PASSWORD es obligatoria para proteger el dashboard.');
}
if (!env.SESSION_SECRET || env.SESSION_SECRET.length < 32) {
  throw new Error('SESSION_SECRET es obligatoria y debe tener al menos 32 caracteres.');
}

const app = express();

app.use(helmet());

const allowedOrigins = env.CORS_ORIGIN.split(',').map((o) => o.trim()).filter(Boolean);
app.use(
  cors({
    origin: allowedOrigins.length > 0 ? allowedOrigins : false,
    credentials: true,
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
app.use('/api/auth', authRoutes);
app.use('/api/dashboard', sessionAuth, dashboardRoutes);
app.use('/api/ai', sessionAuth, aiLimiter, aiRoutes);

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
