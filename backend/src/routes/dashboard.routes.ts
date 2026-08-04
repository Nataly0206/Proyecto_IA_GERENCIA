import { Router } from 'express';
import * as controller from '../controllers/dashboard.controller';
import { asyncHandler } from '../middleware/errorHandler';
import { requirePermission } from '../middleware/sessionAuth';

const router = Router();

const iqf = requirePermission('iqf');
const pelado = requirePermission('pelado');

router.get('/libras-netas-proceso', iqf, asyncHandler(controller.getLibrasNetasPorProceso));
router.get('/libras-netas-proceso-dia', iqf, asyncHandler(controller.getLibrasNetasPorProcesoDia));
router.get('/libras-netas-proceso-mes', iqf, asyncHandler(controller.getLibrasNetasPorProcesoMes));
router.get('/iqf-libras-hora-dia', iqf, asyncHandler(controller.getIqfLibrasHoraDia));
router.get('/iqf-libras-hora-mes', iqf, asyncHandler(controller.getIqfLibrasHoraMes));
router.get('/iqf-tiempo-real', iqf, asyncHandler(controller.getIqfTiempoReal));
router.get('/pelado-por-estilo', pelado, asyncHandler(controller.getPeladoPorEstilo));
router.get('/pelado-por-estilo-dia', pelado, asyncHandler(controller.getPeladoPorEstiloDia));
router.get('/pelado-por-estilo-mes', pelado, asyncHandler(controller.getPeladoPorEstiloMes));
router.get('/pelado-tiempo-real', pelado, asyncHandler(controller.getPeladoTiempoReal));

export default router;
