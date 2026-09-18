import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import {
  clearSession,
  getSessionUser,
  sessionAuth,
  setSessionCookie,
} from '../middleware/sessionAuth';
import {
  authenticate,
  changePassword,
  createPasswordResetCode,
  invalidatePasswordResetCode,
  resetPasswordWithCode,
} from '../services/auth.service';
import { sendPasswordResetCode } from '../services/mail.service';

const router = Router();
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos. Espera 15 minutos antes de volver a intentar.' },
});
const recoveryRequestLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas solicitudes. Espera 15 minutos antes de volver a intentar.' },
});
const recoveryAttemptLimiter = rateLimit({
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

router.post('/forgot-password', recoveryRequestLimiter, async (req, res, next) => {
  const identifier = typeof req.body?.identifier === 'string' ? req.body.identifier.trim() : '';
  if (!/^[a-zA-Z0-9._-]{3,60}$/.test(identifier)) {
    res.status(400).json({ error: 'Ingresa un nombre de usuario válido.' });
    return;
  }
  try {
    const recovery = await createPasswordResetCode(identifier);
    if (recovery) {
      try {
        await sendPasswordResetCode(recovery, recovery.code);
      } catch (error) {
        await invalidatePasswordResetCode(identifier).catch(() => undefined);
        throw error;
      }
    }
    res.json({ message: 'Si la cuenta existe, enviaremos un código al correo registrado.' });
  } catch (error) {
    next(error);
  }
});

router.post('/reset-password', recoveryAttemptLimiter, async (req, res, next) => {
  try {
    const identifier = typeof req.body?.identifier === 'string' ? req.body.identifier.trim() : '';
    const code = typeof req.body?.code === 'string' ? req.body.code.trim() : '';
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    const confirmation = typeof req.body?.confirmation === 'string' ? req.body.confirmation : '';
    if (!/^[a-zA-Z0-9._-]{3,60}$/.test(identifier) || !/^\d{6}$/.test(code)) {
      res.status(400).json({ error: 'El usuario o el código no son válidos.' });
      return;
    }
    if (password.length < 10 || password.length > 128) {
      res.status(400).json({ error: 'La contraseña debe tener entre 10 y 128 caracteres.' });
      return;
    }
    if (password !== confirmation) {
      res.status(400).json({ error: 'Las contraseñas no coinciden.' });
      return;
    }
    if (!await resetPasswordWithCode(identifier, code, password)) {
      res.status(400).json({ error: 'El código es incorrecto, expiró o alcanzó el límite de intentos.' });
      return;
    }
    res.json({ message: 'Contraseña actualizada correctamente. Ya puedes iniciar sesión.' });
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
