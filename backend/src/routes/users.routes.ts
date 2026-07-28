import { Router } from 'express';
import sql from 'mssql';
import { adminAuth, changedPasswordAuth, sessionAuth } from '../middleware/sessionAuth';
import {
  createUser,
  deleteUser,
  generateTemporaryPassword,
  listUsers,
} from '../services/auth.service';
import { sendTemporaryPassword } from '../services/mail.service';

const router = Router();
router.use(sessionAuth, changedPasswordAuth, adminAuth);

router.get('/', async (_req, res, next) => {
  try {
    res.json({ users: await listUsers() });
  } catch (error) {
    next(error);
  }
});

router.post('/', async (req, res, next) => {
  let createdUserId = '';
  try {
    const usuario = typeof req.body?.usuario === 'string' ? req.body.usuario.trim() : '';
    const nombre = typeof req.body?.nombre === 'string' ? req.body.nombre.trim() : '';
    const correo = typeof req.body?.correo === 'string' ? req.body.correo.trim() : '';
    if (!/^[a-zA-Z0-9._-]{3,60}$/.test(usuario)) {
      res.status(400).json({ error: 'El usuario debe tener de 3 a 60 letras, números, puntos, guiones o guion bajo.' });
      return;
    }
    if (nombre.length < 2 || nombre.length > 150) {
      res.status(400).json({ error: 'El nombre debe tener entre 2 y 150 caracteres.' });
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo) || correo.length > 254) {
      res.status(400).json({ error: 'Ingresa un correo electrónico válido.' });
      return;
    }
    const temporaryPassword = generateTemporaryPassword();
    const user = await createUser({ usuario, nombre, correo }, temporaryPassword);
    createdUserId = user.id;
    await sendTemporaryPassword({ usuario: user.usuario, nombre: user.nombre, correo: user.correo }, temporaryPassword);
    res.status(201).json({ message: 'Usuario creado y correo de acceso enviado.', user });
  } catch (error) {
    if (createdUserId) await deleteUser(createdUserId).catch(() => undefined);
    if (error instanceof sql.RequestError && (error.number === 2601 || error.number === 2627)) {
      res.status(409).json({ error: 'El usuario o correo ya está registrado.' });
      return;
    }
    next(error);
  }
});

export default router;
