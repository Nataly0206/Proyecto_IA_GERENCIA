import { Router } from 'express';
import * as controller from '../controllers/dashboard.controller';
import * as procesos from '../controllers/procesos.controller';
import { asyncHandler } from '../middleware/errorHandler';
import { requirePermission } from '../middleware/sessionAuth';

const router = Router();

const iqf = requirePermission('iqf');
const pelado = requirePermission('pelado');
const recepcion = requirePermission('recepcion');
const descabezado = requirePermission('descabezado');
const clasificado = requirePermission('clasificado');
const exportaciones = requirePermission('exportaciones');
const compraMp = requirePermission('compra_materia_prima');

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
router.get('/pelado-libras-hoy-talla', pelado, asyncHandler(controller.getPeladoLibrasHoyTalla));
router.get('/pelado-por-sala', pelado, asyncHandler(controller.getPeladoPorSala));
router.get('/pelado-personal', pelado, asyncHandler(controller.getPeladoPersonal));
router.get('/pelado-personal-dia', pelado, asyncHandler(controller.getPeladoPersonalDia));
router.get('/pelado-personal-mes', pelado, asyncHandler(controller.getPeladoPersonalMes));

/* Recepción */
router.get('/recepcion-resumen', recepcion, asyncHandler(procesos.getRecepcionResumen));
router.get('/recepcion-remisiones', recepcion, asyncHandler(procesos.getRecepcionRemisiones));

/* Descabezado */
router.get('/descabezado-resumen', descabezado, asyncHandler(procesos.getDescabezadoResumen));
router.get('/descabezado-por-dia', descabezado, asyncHandler(procesos.getDescabezadoPorDia));
router.get('/descabezado-por-dia-mes', descabezado, asyncHandler(procesos.getDescabezadoPorDiaMes));

/* Clasificado */
router.get('/clasificado-resumen', clasificado, asyncHandler(procesos.getClasificadoResumen));
router.get('/clasificado-inventario', clasificado, asyncHandler(procesos.getClasificadoInventario));
router.get('/clasificado-inventario-detalle', clasificado, asyncHandler(procesos.getClasificadoInventarioDetalle));
router.get('/clasificado-por-maquina', clasificado, asyncHandler(procesos.getClasificadoPorMaquina));
router.get('/clasificado-por-talla-dia', clasificado, asyncHandler(procesos.getClasificadoPorTallaDia));
router.get('/clasificado-por-talla-mes', clasificado, asyncHandler(procesos.getClasificadoPorTallaMes));
router.get('/clasificado-por-talla', clasificado, asyncHandler(procesos.getClasificadoPorTalla));

/* Exportaciones */
router.get('/exportaciones-resumen', exportaciones, asyncHandler(procesos.getExportacionesResumen));
router.get('/exportaciones-por-estilo', exportaciones, asyncHandler(procesos.getExportacionesPorEstilo));
router.get('/exportaciones-contenedores', exportaciones, asyncHandler(procesos.getExportacionesContenedores));
router.get('/exportaciones-por-cliente-mes', exportaciones, asyncHandler(procesos.getExportacionesPorClienteMes));

/* Compra de materia prima */
router.get('/compra-mp-resumen', compraMp, asyncHandler(procesos.getCompraMpResumen));
router.get('/compra-mp-por-proveedor', compraMp, asyncHandler(procesos.getCompraMpPorProveedor));
router.get('/compra-mp-por-item', compraMp, asyncHandler(procesos.getCompraMpPorItem));
router.get('/compra-mp-por-talla', compraMp, asyncHandler(procesos.getCompraMpPorTalla));
router.get('/compra-mp-materia-prima', compraMp, asyncHandler(procesos.getCompraMpMateriaPrima));

export default router;
