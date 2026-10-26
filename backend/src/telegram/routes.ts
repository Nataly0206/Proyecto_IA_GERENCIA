import { Router, Response } from 'express';
import { env } from '../config/env';
import { ApiError, asyncHandler } from '../middleware/errorHandler';
import { AuthUser } from '../services/auth.service';
import * as store from './store';

const router = Router();
const user = (res: Response) => res.locals.authUser as AuthUser;
export const uuid = (id: string) => {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new ApiError(400, 'Identificador no válido.');
  return id;
};
export function sendOriginal(res: Response, file: { archivo: Buffer; archivo_nombre: string; archivo_mime: string }) {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(file.archivo_nombre).replace(/'/g, '%27')}`);
  res.type(file.archivo_mime).send(file.archivo);
}
router.get('/estado', asyncHandler(async (_req, res) => res.json({
  configurado: Boolean(env.TELEGRAM_BOT_TOKEN), lectorConfigurado: Boolean(env.TELEGRAM_LOANS_AI_KEY), ...await store.linkStatus(user(res).id),
})));
router.post('/vinculacion', asyncHandler(async (_req, res) => {
  if (!env.TELEGRAM_BOT_TOKEN) throw new ApiError(503, 'Configura TELEGRAM_BOT_TOKEN en backend/.env para activar el bot.');
  res.json(await store.createLinkCode(user(res).id));
}));
router.delete('/vinculacion', asyncHandler(async (_req, res) => { await store.unlink(user(res).id); res.json({ message: 'Telegram desvinculado. Los préstamos y documentos se conservan.' }); }));
router.get('/borradores', asyncHandler(async (_req, res) => res.json(await store.listDrafts(user(res).id))));
router.get('/borradores/:id', asyncHandler(async (req, res) => res.json(await store.getDraft(user(res).id, uuid(req.params.id)))));
router.get('/borradores/:id/documento', asyncHandler(async (req, res) => sendOriginal(res, await store.originalDocument(user(res).id, uuid(req.params.id)))));
router.put('/borradores/:id', asyncHandler(async (req, res) => {
  if (!Number.isInteger(req.body?.revision) || req.body.revision < 1) throw new ApiError(400, 'Versión de borrador no válida.');
  res.json(await store.updateDraft(user(res).id, uuid(req.params.id), req.body.revision, req.body.plan));
}));
router.post('/borradores/:id/confirmar', asyncHandler(async (req, res) => {
  if (!Number.isInteger(req.body?.revision) || req.body.revision < 1) throw new ApiError(400, 'Versión de borrador no válida.');
  res.json(await store.confirmDraft(user(res), uuid(req.params.id), req.body.revision));
}));
router.post('/borradores/:id/reabrir', asyncHandler(async (req, res) => res.json(await store.reopenDraft(user(res).id, uuid(req.params.id)))));
router.delete('/borradores/:id', asyncHandler(async (req, res) => {
  await store.cancelDraft(user(res).id, uuid(req.params.id)); res.json({ message: 'Importación cancelada. El documento se conserva.' });
}));
export default router;
