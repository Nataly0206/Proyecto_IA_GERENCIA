import { Request, Response, Router } from 'express';
import { ApiError, asyncHandler } from '../middleware/errorHandler';
import { AuthUser } from '../services/auth.service';
import * as service from '../services/prestamos.service';

const router = Router();
const text = (value: unknown, max: number) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const number = (value: unknown) => Number(value);
const validDate = (value: unknown): value is string =>
  typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
const usuario = (res: Response) => (res.locals.authUser as AuthUser).usuario;
const idParam = (value: string, label: string) => {
  const id = number(value);
  if (!Number.isInteger(id) || id <= 0) throw new ApiError(400, `${label} no válido.`);
  return id;
};

function parsePlan(body: Request['body']): service.PlanInput {
  const monto = number(body?.monto), tasaAnual = number(body?.tasaAnual), cantidadCuotas = number(body?.cantidadCuotas);
  const cargoCuota = number(body?.cargoCuota ?? 0);
  if (!Number.isFinite(monto) || monto <= 0 || !Number.isFinite(tasaAnual) || tasaAnual < 0 || tasaAnual > 200
    || !Number.isInteger(cantidadCuotas) || cantidadCuotas < 1 || cantidadCuotas > 1000
    || !Number.isFinite(cargoCuota) || cargoCuota < 0
    || !service.FRECUENCIAS.includes(body?.frecuencia) || !service.TIPOS_AMORTIZACION.includes(body?.tipoAmortizacion)
    || !validDate(body?.fechaPrimeraCuota)) {
    throw new ApiError(400, 'Revisa el monto, la tasa, las cuotas y las fechas del préstamo.');
  }
  return {
    monto, tasaAnual, cantidadCuotas, cargoCuota, frecuencia: body.frecuencia,
    tipoAmortizacion: body.tipoAmortizacion, fechaPrimeraCuota: body.fechaPrimeraCuota,
  };
}

function parsePago(body: Request['body']): service.PagoInput {
  const monto = number(body?.monto), metodo = text(body?.metodo, 30);
  if (!Number.isFinite(monto) || monto <= 0 || !service.METODOS_PAGO.includes(metodo) || !validDate(body?.fecha)) {
    throw new ApiError(400, 'Monto, fecha o forma de pago no válidos.');
  }
  return { monto, metodo, fecha: body.fecha, referencia: text(body?.referencia, 100), notas: text(body?.notas, 500) };
}

router.get('/resumen', asyncHandler(async (_req, res) => res.json(await service.resumen())));

router.get('/acreedores', asyncHandler(async (_req, res) => res.json(await service.listarAcreedores())));
router.post('/acreedores', asyncHandler(async (req, res) => {
  const nombre = text(req.body?.nombre, 180);
  const tipo = text(req.body?.tipo, 30) || 'banco';
  if (!nombre || !service.TIPOS_ACREEDOR.includes(tipo)) throw new ApiError(400, 'El nombre del acreedor es obligatorio.');
  const acreedor = await service.crearAcreedor({
    nombre, tipo, contacto: text(req.body?.contacto, 180), telefono: text(req.body?.telefono, 30),
    notas: text(req.body?.notas, 1000),
  }, usuario(res));
  res.status(201).json({ message: 'Acreedor registrado.', acreedor });
}));

router.get('/', asyncHandler(async (_req, res) => res.json(await service.listarPrestamos())));

router.get('/reporte', asyncHandler(async (req, res) => {
  const desde = String(req.query.desde ?? ''), hasta = String(req.query.hasta ?? '');
  if (!validDate(desde) || !validDate(hasta) || desde > hasta) throw new ApiError(400, 'El rango de fechas no es válido.');
  res.json(await service.reporte(desde, hasta));
}));

// Vista previa del calendario antes de guardar el préstamo.
router.post('/simular', asyncHandler(async (req, res) => res.json(service.calcularPlan(parsePlan(req.body)))));

router.get('/:id', asyncHandler(async (req, res) => {
  const result = await service.obtenerPrestamo(idParam(req.params.id, 'Préstamo'));
  if (!result.prestamo) throw new ApiError(404, 'Préstamo no encontrado.');
  res.json(result);
}));

router.post('/', asyncHandler(async (req, res) => {
  const plan = parsePlan(req.body);
  const acreedorId = number(req.body?.acreedorId);
  if (!Number.isInteger(acreedorId) || acreedorId <= 0 || !service.MONEDAS.includes(req.body?.moneda)
    || !validDate(req.body?.fechaDesembolso) || plan.fechaPrimeraCuota < req.body.fechaDesembolso) {
    throw new ApiError(400, 'Revisa el acreedor, la moneda y las fechas: la primera cuota no puede ser anterior al desembolso.');
  }
  const prestamo = await service.crearPrestamo({
    ...plan, acreedorId, moneda: req.body.moneda, fechaDesembolso: req.body.fechaDesembolso,
    referencia: text(req.body?.referencia, 60), notas: text(req.body?.notas, 1000),
  }, usuario(res));
  res.status(201).json({ message: 'Préstamo registrado.', prestamo });
}));

router.post('/:id/pagos', asyncHandler(async (req, res) => {
  const pago = await service.registrarPago(idParam(req.params.id, 'Préstamo'), parsePago(req.body), usuario(res));
  res.status(201).json({ message: 'Pago registrado correctamente.', pago });
}));

router.post('/:id/abonos', asyncHandler(async (req, res) => {
  const modo = req.body?.modo;
  if (modo !== 'cuota' && modo !== 'plazo') throw new ApiError(400, 'Indica si el abono reduce la cuota o el plazo.');
  const pago = await service.registrarAbono(idParam(req.params.id, 'Préstamo'), parsePago(req.body), modo, usuario(res));
  res.status(201).json({ message: 'Abono a capital registrado.', pago });
}));

router.put('/:id/cuotas/:cuotaId', asyncHandler(async (req, res) => {
  const capital = number(req.body?.capital), interes = number(req.body?.interes), cargos = number(req.body?.cargos);
  if (![capital, interes, cargos].every((value) => Number.isFinite(value) && value >= 0)
    || capital + interes + cargos <= 0 || !validDate(req.body?.fechaVencimiento)) {
    throw new ApiError(400, 'Los valores de la cuota no son válidos.');
  }
  await service.editarCuota(idParam(req.params.id, 'Préstamo'), idParam(req.params.cuotaId, 'Cuota'),
    { fechaVencimiento: req.body.fechaVencimiento, capital, interes, cargos });
  res.json({ message: 'Cuota actualizada.' });
}));

export default router;
