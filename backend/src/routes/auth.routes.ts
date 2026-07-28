import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import {
  clearSession,
  getSessionUser,
  sessionAuth,
  setSessionCookie,
} from '../middleware/sessionAuth';
import { authenticate, changePassword } from '../services/auth.service';

const router = Router();
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos. Espera 15 minutos antes de volver a intentar.' },
});

router.get('/status', async (req, res, next) => {
  try {
    res.setHeader('Cache-Control', 'no-store');
    const user = await getSessionUser(req);
    res.json({ authenticated: Boolean(user), user });
  } catch (error) {
    next(error);
  }
});

router.post('/login', loginLimiter, async (req, res, next) => {
  try {
    const usuario = typeof req.body?.usuario === 'string' ? req.body.usuario : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!usuario || usuario.length > 254 || !password || password.length > 256) {
      res.status(400).json({ error: 'Ingresa tu usuario y contraseña.' });
      return;
    }
    const user = await authenticate(usuario, password);
    if (!user) {
      res.status(401).json({ error: 'Usuario o contraseña incorrectos.' });
      return;
    }
    await setSessionCookie(res, user.id);
    res.setHeader('Cache-Control', 'no-store');
    res.json({ authenticated: true, user });
  } catch (error) {
    next(error);
  }
});

router.post('/change-password', sessionAuth, async (_req, res, next) => {
  try {
    const password = typeof _req.body?.password === 'string' ? _req.body.password : '';
    const confirmacion = typeof _req.body?.confirmacion === 'string' ? _req.body.confirmacion : '';
    if (password.length < 10 || password.length > 128) {
      res.status(400).json({ error: 'La contraseña debe tener entre 10 y 128 caracteres.' });
      return;
    }
    if (password !== confirmacion) {
      res.status(400).json({ error: 'Las contraseñas no coinciden.' });
      return;
    }
    await changePassword(res.locals.authUser.id, password);
    res.json({ message: 'Contraseña actualizada correctamente.' });
  } catch (error) {
    next(error);
  }
});

router.post('/logout', async (req, res, next) => {
  try {
    res.setHeader('Cache-Control', 'no-store');
    await clearSession(req, res);
    res.json({ authenticated: false });
  } catch (error) {
    next(error);
  }
});

export default router;
