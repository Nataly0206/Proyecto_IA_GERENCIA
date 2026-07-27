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
  res.setHeader('Cache-Control', 'no-store');
  res.json({ authenticated: hasValidSession(req) });
});

router.post('/login', loginLimiter, (req, res) => {
  const password = typeof req.body?.password === 'string' ? req.body.password : '';
  if (password.length > 256 || !passwordMatches(password)) {
    res.status(401).json({ error: 'Contraseña incorrecta.' });
    return;
  }
  res.setHeader('Cache-Control', 'no-store');
  setSessionCookie(res);
  res.json({ authenticated: true });
});

router.post('/logout', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  clearSessionCookie(res);
  res.json({ authenticated: false });
});

export default router;
