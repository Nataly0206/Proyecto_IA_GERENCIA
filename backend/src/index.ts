import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { env } from './config/env';
import { closePool } from './config/db';
import dashboardRoutes from './routes/dashboard.routes';
import aiRoutes from './routes/ai.routes';
import authRoutes from './routes/auth.routes';
import usersRoutes from './routes/users.routes';
import inventoryRoutes from './routes/inventory.routes';
import powerbiRoutes from './routes/powerbi.routes';
import rendimientosRoutes from './routes/rendimientos.routes';
import prestamosRoutes from './routes/prestamos.routes';
import { errorHandler, notFound } from './middleware/errorHandler';
import { changedPasswordAuth, requirePermission, sessionAuth } from './middleware/sessionAuth';
import { assertAuthDatabaseReady } from './services/auth.service';
import { closeAuthPool } from './config/authDb';
import { closeStbPool } from './config/stbDb';
import { closeRedis, getRedisClient, redisStatus } from './config/redis';
import { cacheMetrics } from './utils/ttlCache';

// Fail-closed: en producción no se arranca sin API_KEY, para no exponer
// la API (y por tanto la BD real vía el asistente IA) sin autenticación.
if (!env.LOGIN_PASSWORD) {
  throw new Error('LOGIN_PASSWORD es obligatoria para proteger el dashboard.');
}
if (!env.SESSION_SECRET || env.SESSION_SECRET.length < 32) {
  throw new Error('SESSION_SECRET es obligatoria y debe tener al menos 32 caracteres.');
}
if (env.NODE_ENV === 'production') {
  if (!env.COOKIE_SECURE) {
    console.warn('[security] COOKIE_SECURE=false: publique únicamente por HTTPS y actívela.');
  }
  if (!env.DB_ENCRYPT) {
    console.warn('[security] DB_ENCRYPT=false: la conexión a SQL Server no está cifrada.');
  }
  if (env.DB_TRUST_SERVER_CERTIFICATE) {
    console.warn('[security] DB_TRUST_SERVER_CERTIFICATE=true: no se valida la cadena TLS de SQL.');
  }
  if (env.DB_USER.trim().toLowerCase() === 'sa') {
    console.warn('[security] DB_USER=sa: use el usuario dedicado de solo lectura.');
  }
}

const app = express();

app.disable('x-powered-by');
app.use(helmet());

const allowedOrigins = env.CORS_ORIGIN.split(',').map((o) => o.trim()).filter(Boolean);
app.use(
  cors({
    origin: allowedOrigins.length > 0 ? allowedOrigins : false,
    credentials: true,
  }),
);

app.use(express.json({ limit: '64kb', strict: true }));

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
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    cache: { redis: redisStatus(), metrics: cacheMetrics },
  });
});

app.use('/api', generalLimiter);
app.use('/api/auth', authRoutes);
app.use('/api/users', usersRoutes);
app.use('/api/inventory', sessionAuth, changedPasswordAuth, requirePermission('inventario'), inventoryRoutes);
app.use('/api/powerbi', sessionAuth, changedPasswordAuth, requirePermission('power_bi'), powerbiRoutes);
app.use('/api/rendimientos', sessionAuth, changedPasswordAuth, requirePermission('rendimientos'), rendimientosRoutes);
app.use('/api/prestamos', sessionAuth, changedPasswordAuth, requirePermission('prestamos'), prestamosRoutes);
app.use('/api/dashboard', sessionAuth, changedPasswordAuth, dashboardRoutes);
app.use('/api/ai', sessionAuth, changedPasswordAuth, requirePermission('asistente_ia'), aiLimiter, aiRoutes);

app.use(notFound);
app.use(errorHandler);

let server: ReturnType<typeof app.listen>;

async function start(): Promise<void> {
  await assertAuthDatabaseReady();
  // Redis acelera el sistema, pero no es requisito para atender solicitudes:
  // si no conecta, cada reporte continúa consultando SQL con normalidad.
  await getRedisClient();
  server = app.listen(env.PORT, () => {
    console.log(`[api] Dashboard API escuchando en http://localhost:${env.PORT}`);
  });
  // Reduce la ventana para ataques de conexiones lentas sin limitar las
  // consultas legítimas a SQL/IA, que tienen sus propios timeouts.
  server.headersTimeout = 15_000;
  server.requestTimeout = 310_000;
  server.keepAliveTimeout = 5_000;
}

start().catch((error) => {
  console.error('[api] No se pudo iniciar:', error);
  process.exit(1);
});

const shutdown = async (): Promise<void> => {
  console.log('[api] Cerrando servidor...');
  server?.close();
  await closePool();
  await closeAuthPool();
  await closeStbPool();
  await closeRedis();
  process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
