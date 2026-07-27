import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import {
  clearSessionCookie,
  hasValidSession,
  passwordMatches,
  setSessionCookie,
} from '../middleware/sessionAuth';

const router = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos. Espera 15 minutos antes de volver a intentar.' },
});

router.get('/status', (req, res) => {
  res.json({ authenticated: hasValidSession(req) });
});

router.post('/login', loginLimiter, (req, res) => {
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (!passwordMatches(password)) {
    res.status(401).json({ error: 'Contraseña incorrecta.' });
    return;
  }
  setSessionCookie(res);
  res.json({ authenticated: true });
});

router.post('/logout', (_req, res) => {
  clearSessionCookie(res);
  res.json({ authenticated: false });
});

export default router;
