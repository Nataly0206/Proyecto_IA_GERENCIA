import { Router } from 'express';
import * as controller from '../controllers/dashboard.controller';
import { asyncHandler } from '../middleware/errorHandler';

const router = Router();

router.get('/libras-netas-proceso', asyncHandler(controller.getLibrasNetasPorProceso));
router.get('/iqf-libras-hora-dia', asyncHandler(controller.getIqfLibrasHoraDia));
router.get('/iqf-libras-hora-mes', asyncHandler(controller.getIqfLibrasHoraMes));
router.get('/iqf-tiempo-real', asyncHandler(controller.getIqfTiempoReal));

export default router;
