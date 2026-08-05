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
router.get('/pelado-por-talla', pelado, asyncHandler(controller.getPeladoPorTalla));
router.get('/pelado-por-talla-dia', pelado, asyncHandler(controller.getPeladoPorTallaDia));
router.get('/pelado-por-talla-mes', pelado, asyncHandler(controller.getPeladoPorTallaMes));
router.get('/pelado-tiempo-real', pelado, asyncHandler(controller.getPeladoTiempoReal));
router.get('/pelado-libras-hoy', pelado, asyncHandler(controller.getPeladoLibrasHoy));
router.get('/pelado-personal', pelado, asyncHandler(controller.getPeladoPersonal));
router.get('/pelado-personal-dia', pelado, asyncHandler(controller.getPeladoPersonalDia));
router.get('/pelado-personal-mes', pelado, asyncHandler(controller.getPeladoPersonalMes));

export default router;
