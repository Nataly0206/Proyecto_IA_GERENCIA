import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import { getRendimientosProduccion } from '../services/rendimientos.service';
import { getUserPreference, saveUserPreference } from '../services/user-preferences.service';
import { reportCacheTtl, withTtlCache } from '../utils/ttlCache';

const router = Router();
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const PREFERENCE_KEY = 'rendimientos-tabla';

router.get('/', asyncHandler(async (req, res) => {
  const fechaInicial = String(req.query.fechaInicial ?? '');
  const fechaFinal = String(req.query.fechaFinal ?? '');
  if (!ISO_DATE.test(fechaInicial) || !ISO_DATE.test(fechaFinal) || fechaInicial > fechaFinal) {
    res.status(400).json({ error: 'El rango de fechas no es válido.' });
    return;
  }
  const rows = await withTtlCache(
    JSON.stringify(['rendimientos-produccion:v1', { fechaInicial, fechaFinal }]),
    reportCacheTtl(fechaFinal, fechaInicial),
    () => getRendimientosProduccion(fechaInicial, fechaFinal),
    req.query.refresh === 'true',
  );
  res.json({ rows });
}));

router.get('/preferences', asyncHandler(async (_req, res) => {
  res.json({ preferences: await getUserPreference(res.locals.authUser.id, PREFERENCE_KEY) });
}));

router.put('/preferences', asyncHandler(async (req, res) => {
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) {
    res.status(400).json({ error: 'Las preferencias no son válidas.' });
    return;
  }
  await saveUserPreference(res.locals.authUser.id, PREFERENCE_KEY, req.body);
  res.json({ message: 'Preferencias guardadas.' });
}));

export default router;
