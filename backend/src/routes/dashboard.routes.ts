import { Router } from 'express';
import * as controller from '../controllers/dashboard.controller';
import * as procesos from '../controllers/procesos.controller';
import { asyncHandler } from '../middleware/errorHandler';
import { requirePermission } from '../middleware/sessionAuth';
import { getUserPreference, saveUserPreference } from '../services/user-preferences.service';
import { getClassifiedSizeOrder, getClassifiedSizes, saveClassifiedSizeOrder } from '../services/shared-config.service';

const router = Router();

const iqf = requirePermission('iqf');
const pelado = requirePermission('pelado');
const recepcion = requirePermission('recepcion');
const descabezado = requirePermission('descabezado');
const clasificado = requirePermission('clasificado');
const exportaciones = requirePermission('exportaciones');
const compraMp = requirePermission('compra_materia_prima');
const EXPORT_CLIENTS_PREFERENCE = 'exportaciones.clientes-mensual.ocultos';
const CLASSIFIED_MACHINES_PREFERENCE = 'clasificado.maquinas.ocultas';
const PEELING_SALA_HOURS_PREFERENCE = 'pelado.salas.horas-minimas';

router.get('/libras-netas-proceso', iqf, asyncHandler(controller.getLibrasNetasPorProceso));
router.get('/libras-netas-proceso-dia', iqf, asyncHandler(controller.getLibrasNetasPorProcesoDia));
router.get('/libras-netas-proceso-mes', iqf, asyncHandler(controller.getLibrasNetasPorProcesoMes));
router.get('/iqf-libras-hora-dia', iqf, asyncHandler(controller.getIqfLibrasHoraDia));
router.get('/iqf-libras-hora-mes', iqf, asyncHandler(controller.getIqfLibrasHoraMes));
router.get('/iqf-horas-trabajadas-mes', iqf, asyncHandler(controller.getIqfHorasTrabajadasMes));
router.get('/iqf-horas-trabajadas', iqf, asyncHandler(controller.getIqfHorasTrabajadas));
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
router.get('/pelado-por-sala-diario', pelado, asyncHandler(controller.getPeladoPorSalaDiario));
router.get('/pelado-preferencia-horas-sala', pelado, asyncHandler(async (_req, res) => {
  const preference = await getUserPreference<{ minHours: number | null }>(res.locals.authUser.id, PEELING_SALA_HOURS_PREFERENCE);
  res.json({ minHours: preference?.minHours ?? null });
}));
router.put('/pelado-preferencia-horas-sala', pelado, asyncHandler(async (req, res) => {
  const minHours: unknown = req.body?.minHours;
  if (minHours !== null && (typeof minHours !== 'number' || !Number.isFinite(minHours) || minHours < 0 || minHours > 24)) {
    res.status(400).json({ error: 'El límite de horas debe estar entre 0 y 24.' });
    return;
  }
  await saveUserPreference(res.locals.authUser.id, PEELING_SALA_HOURS_PREFERENCE, { minHours });
  res.json({ minHours });
}));
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
router.get('/clasificado-preferencias-maquinas', clasificado, asyncHandler(async (_req, res) => {
  const hiddenMachines = await getUserPreference<string[]>(res.locals.authUser.id, CLASSIFIED_MACHINES_PREFERENCE);
  res.json({ hiddenMachines });
}));
router.put('/clasificado-preferencias-maquinas', clasificado, asyncHandler(async (req, res) => {
  const hiddenMachines: unknown = req.body?.hiddenMachines;
  if (!Array.isArray(hiddenMachines) || hiddenMachines.length > 500
    || !hiddenMachines.every((machine) => typeof machine === 'string' && machine.length > 0 && machine.length <= 200)) {
    res.status(400).json({ error: 'La selección de máquinas no es válida.' });
    return;
  }
  const normalized = Array.from(new Set(hiddenMachines)) as string[];
  await saveUserPreference(res.locals.authUser.id, CLASSIFIED_MACHINES_PREFERENCE, normalized);
  res.json({ hiddenMachines: normalized });
}));
router.get('/clasificado-por-talla-dia', clasificado, asyncHandler(procesos.getClasificadoPorTallaDia));
router.get('/clasificado-por-talla-mes', clasificado, asyncHandler(procesos.getClasificadoPorTallaMes));
router.get('/clasificado-por-talla', clasificado, asyncHandler(procesos.getClasificadoPorTalla));
router.get('/clasificado-orden-tallas', clasificado, asyncHandler(async (_req, res) => {
  const [order, sizes] = await Promise.all([getClassifiedSizeOrder(), getClassifiedSizes()]);
  res.json({ order, sizes });
}));
router.put('/clasificado-orden-tallas', clasificado, requirePermission('ordenar_tallas_clasificado'), asyncHandler(async (req, res) => {
  const order: unknown = req.body?.order;
  if (!Array.isArray(order) || order.length > 200
    || !order.every((size) => typeof size === 'string' && size.length > 0 && size.length <= 100 && size.trim() === size)
    || new Set(order).size !== order.length) {
    res.status(400).json({ error: 'El orden de tallas no es válido.' });
    return;
  }
  const validSizes = new Set(await getClassifiedSizes());
  if (!order.every((size) => validSizes.has(size))) {
    res.status(400).json({ error: 'El orden contiene tallas desconocidas.' });
    return;
  }
  await saveClassifiedSizeOrder(order);
  res.json({ order });
}));

/* Exportaciones */
router.get('/exportaciones-resumen', exportaciones, asyncHandler(procesos.getExportacionesResumen));
router.get('/exportaciones-por-estilo', exportaciones, asyncHandler(procesos.getExportacionesPorEstilo));
router.get('/exportaciones-contenedores', exportaciones, asyncHandler(procesos.getExportacionesContenedores));
router.get('/exportaciones-contenedor-detalle', exportaciones, asyncHandler(procesos.getExportacionesContenedorDetalle));
router.get('/exportaciones-por-cliente-mes', exportaciones, asyncHandler(procesos.getExportacionesPorClienteMes));
router.get('/exportaciones-preferencias-clientes', exportaciones, asyncHandler(async (_req, res) => {
  const hiddenClients = await getUserPreference<string[]>(res.locals.authUser.id, EXPORT_CLIENTS_PREFERENCE);
  res.json({ hiddenClients });
}));
router.put('/exportaciones-preferencias-clientes', exportaciones, asyncHandler(async (req, res) => {
  const hiddenClients = req.body?.hiddenClients;
  if (!Array.isArray(hiddenClients)
    || hiddenClients.length > 500
    || !hiddenClients.every((client) => typeof client === 'string' && client.length <= 500)) {
    res.status(400).json({ error: 'La selección de clientes no es válida.' });
    return;
  }
  const normalized = Array.from(new Set(hiddenClients)) as string[];
  await saveUserPreference(res.locals.authUser.id, EXPORT_CLIENTS_PREFERENCE, normalized);
  res.json({ message: 'Preferencia de clientes guardada.', hiddenClients: normalized });
}));

/* Compra de materia prima */
router.get('/compra-mp-resumen', compraMp, asyncHandler(procesos.getCompraMpResumen));
router.get('/compra-mp-por-proveedor', compraMp, asyncHandler(procesos.getCompraMpPorProveedor));
router.get('/compra-mp-por-item', compraMp, asyncHandler(procesos.getCompraMpPorItem));
router.get('/compra-mp-por-talla', compraMp, asyncHandler(procesos.getCompraMpPorTalla));
router.get('/compra-mp-materia-prima', compraMp, asyncHandler(procesos.getCompraMpMateriaPrima));

export default router;
