import { Router } from 'express';
import sql from 'mssql';
import { changedPasswordAuth, requirePermission, sessionAuth } from '../middleware/sessionAuth';
import {
  createUser,
  deleteUser,
  generateTemporaryPassword,
  getUserById,
  listUsers,
  setActivo,
  updatePermisos,
} from '../services/auth.service';
import { sendTemporaryPassword } from '../services/mail.service';
import { Permiso, esPermisoValido } from '../types/permissions';

const GUID_REGEX = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

const router = Router();
router.use(sessionAuth, changedPasswordAuth, requirePermission('usuarios'));

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
    const permisosInput = Array.isArray(req.body?.permisos) ? req.body.permisos : [];
    if (!permisosInput.every(esPermisoValido)) {
      res.status(400).json({ error: 'Uno o más permisos no son válidos.' });
      return;
    }
    const permisos = Array.from(new Set(permisosInput)) as Permiso[];
    const temporaryPassword = generateTemporaryPassword();
    const user = await createUser({ usuario, nombre, correo }, temporaryPassword, permisos);
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

router.patch('/:id/permisos', async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!GUID_REGEX.test(id)) {
      res.status(400).json({ error: 'Id de usuario inválido.' });
      return;
    }
    const permisosInput = Array.isArray(req.body?.permisos) ? req.body.permisos : [];
    if (!permisosInput.every(esPermisoValido)) {
      res.status(400).json({ error: 'Uno o más permisos no son válidos.' });
      return;
    }
    const target = await getUserById(id);
    if (!target) {
      res.status(404).json({ error: 'Usuario no encontrado.' });
      return;
    }
    if (target.esAdministrador) {
      res.status(400).json({ error: 'Los administradores tienen acceso total; sus permisos no se pueden editar.' });
      return;
    }
    const permisos = Array.from(new Set(permisosInput)) as Permiso[];
    await updatePermisos(id, permisos);
    res.json({ user: { ...target, permisos } });
  } catch (error) {
    next(error);
  }
});

router.patch('/:id/activo', async (req, res, next) => {
  try {
    const { id } = req.params;
    if (!GUID_REGEX.test(id)) {
      res.status(400).json({ error: 'Id de usuario inválido.' });
      return;
    }
    if (typeof req.body?.activo !== 'boolean') {
      res.status(400).json({ error: 'El campo activo debe ser verdadero o falso.' });
      return;
    }
    const activo = req.body.activo as boolean;
    if (!activo && id === res.locals.authUser.id) {
      res.status(400).json({ error: 'No puedes inactivar tu propio usuario.' });
      return;
    }
    const target = await getUserById(id);
    if (!target) {
      res.status(404).json({ error: 'Usuario no encontrado.' });
      return;
    }
    if (target.esAdministrador) {
      res.status(400).json({ error: 'No se puede inactivar a un administrador.' });
      return;
    }
    const updated = await setActivo(id, activo);
    if (!updated) {
      res.status(404).json({ error: 'Usuario no encontrado.' });
      return;
    }
    res.json({ user: { ...target, activo } });
  } catch (error) {
    next(error);
  }
});

export default router;
