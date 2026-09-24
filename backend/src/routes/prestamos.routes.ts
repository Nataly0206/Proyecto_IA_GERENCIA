import { Router } from 'express';
import { asyncHandler } from '../middleware/errorHandler';
import * as service from '../services/prestamos.service';

const router = Router();
const text = (value: unknown, max: number) => typeof value === 'string' ? value.trim().slice(0, max) : '';
const number = (value: unknown) => Number(value);
const validDate = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);

router.get('/resumen', asyncHandler(async (_req, res) => res.json(await service.resumen())));
router.get('/clientes', asyncHandler(async (_req, res) => res.json(await service.listarClientes())));
router.post('/clientes', asyncHandler(async (req, res) => {
  const nombre = text(req.body?.nombre, 180);
  const telefono = text(req.body?.telefono, 30);
  if (!nombre || !telefono) { res.status(400).json({ error: 'Nombre y teléfono son obligatorios.' }); return; }
  const cliente = await service.crearCliente({
    nombre, telefono, identidad: text(req.body.identidad,30), telefonoAlterno:text(req.body.telefonoAlterno,30),
    direccion:text(req.body.direccion,500), correo:text(req.body.correo,254), referenciaNombre:text(req.body.referenciaNombre,180),
    referenciaTelefono:text(req.body.referenciaTelefono,30), notas:text(req.body.notas,1000),
  });
  res.status(201).json({ message: 'Cliente registrado.', cliente });
}));

router.get('/', asyncHandler(async (_req, res) => res.json(await service.listarPrestamos())));
router.get('/reporte', asyncHandler(async (req, res) => {
  const desde=String(req.query.desde??''),hasta=String(req.query.hasta??'');
  if(!validDate(desde)||!validDate(hasta)||desde>hasta){res.status(400).json({error:'El rango de fechas no es válido.'});return;}
  res.json(await service.reporte(desde,hasta));
}));
router.get('/:id', asyncHandler(async (req, res) => {
  const id=number(req.params.id); if(!Number.isInteger(id)||id<=0){res.status(400).json({error:'Préstamo no válido.'});return;}
  const result=await service.obtenerPrestamo(id); if(!result.prestamo){res.status(404).json({error:'Préstamo no encontrado.'});return;} res.json(result);
}));
router.post('/', asyncHandler(async (req, res) => {
  const clienteId=number(req.body?.clienteId),monto=number(req.body?.monto),tasaPeriodo=number(req.body?.tasaPeriodo),cantidadCuotas=number(req.body?.cantidadCuotas);
  const frecuencia=req.body?.frecuencia,tipoAmortizacion=req.body?.tipoAmortizacion;
  if(!Number.isInteger(clienteId)||clienteId<=0||!Number.isFinite(monto)||monto<=0||!Number.isFinite(tasaPeriodo)||tasaPeriodo<0||tasaPeriodo>100||!Number.isInteger(cantidadCuotas)||cantidadCuotas<1||cantidadCuotas>1000
    ||!['diario','semanal','quincenal','mensual'].includes(frecuencia)||!['cuota_fija','interes_fijo','solo_interes'].includes(tipoAmortizacion)
    ||!validDate(req.body?.fechaDesembolso)||!validDate(req.body?.fechaPrimeraCuota)||req.body.fechaPrimeraCuota<req.body.fechaDesembolso){res.status(400).json({error:'Revisa los datos financieros y las fechas del préstamo.'});return;}
  const recargoDiario=number(req.body?.recargoDiario??0); if(!Number.isFinite(recargoDiario)||recargoDiario<0){res.status(400).json({error:'El recargo diario no es válido.'});return;}
  const prestamo=await service.crearPrestamo({clienteId,monto,tasaPeriodo,cantidadCuotas,frecuencia,tipoAmortizacion,fechaDesembolso:req.body.fechaDesembolso,fechaPrimeraCuota:req.body.fechaPrimeraCuota,recargoDiario,notas:text(req.body.notas,1000)});
  res.status(201).json({message:'Préstamo creado y activado.',prestamo});
}));
router.post('/:id/pagos', asyncHandler(async (req,res)=>{
  const id=number(req.params.id),monto=number(req.body?.monto),metodo=text(req.body?.metodo,30);
  if(!Number.isInteger(id)||id<=0||!Number.isFinite(monto)||monto<=0||!['efectivo','transferencia','deposito','otro'].includes(metodo)){res.status(400).json({error:'Monto o forma de pago no válidos.'});return;}
  const pago=await service.registrarPago(id,monto,metodo,text(req.body?.referencia,100),text(req.body?.notas,500));res.status(201).json({message:'Pago registrado correctamente.',pago});
}));

export default router;
