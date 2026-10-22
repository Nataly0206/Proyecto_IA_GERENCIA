/** Integración SQL: todos los registros de prueba se revierten en una transacción. */
import assert from 'node:assert/strict';
import sql from 'mssql';
import { getAuthPool, closeAuthPool } from '../src/config/authDb';
import * as service from '../src/services/prestamos.service';
import { PlanInput, money } from '../src/services/amortizacion';

async function main() {
  const pool = await getAuthPool();
  const Transaction = sql.Transaction;
  const transaction = new Transaction(pool);
  await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
  const original = { request: pool.request, begin: transaction.begin, commit: transaction.commit, rollback: transaction.rollback };
  let queue: Promise<unknown> = Promise.resolve();
  // Los servicios siguen ejecutando SQL real. Sus commits se contienen dentro de
  // la transacción exterior y las consultas paralelas se serializan en ella.
  pool.request = () => {
    const request = new sql.Request(transaction), query = request.query.bind(request);
    request.query = ((statement: string) => {
      const next = queue.then(() => query(statement));
      queue = next.catch(() => undefined);
      return next;
    }) as typeof request.query;
    return request;
  };
  (sql as unknown as { Transaction: unknown }).Transaction = function () { return transaction; };
  transaction.begin = (async () => transaction) as typeof transaction.begin;
  transaction.commit = (async () => undefined) as typeof transaction.commit;
  transaction.rollback = (async () => undefined) as typeof transaction.rollback;
  const actor = `qa-${Date.now()}`;
  try {
    const acreedor = await service.crearAcreedor({ nombre: actor, tipo: 'banco' }, actor);
    const base: PlanInput = { monto: 10000, tasaAnual: 12, cantidadCuotas: 12, frecuencia: 'mensual', tipoAmortizacion: 'cuota_fija', fechaPrimeraCuota: '2027-01-31', cargoCuota: 10 };
    const variants: Partial<PlanInput>[] = [
      {}, { tipoAmortizacion: 'capital_fijo' }, { tipoAmortizacion: 'solo_interes' },
      { tipoAmortizacion: 'pago_unico', opciones: { interesPagoUnico: 'simple' } },
      { tipoAmortizacion: 'pago_unico', opciones: { interesPagoUnico: 'compuesto' } },
      { tipoAmortizacion: 'balon', opciones: { balon: { valor: 30, unidad: 'porcentaje', base: 'cuota_fija' } } },
      { tipoAmortizacion: 'creciente', opciones: { crecimiento: { modo: 'fijo', porcentaje: 1, cadaPeriodos: 1 } } },
      { tipoAmortizacion: 'creciente', opciones: { crecimiento: { modo: 'variable', indice: 'IPC de prueba', variaciones: [{ periodo: 3, porcentaje: 2 }] } } },
      { tipoAmortizacion: 'extraordinarias', opciones: { baseExtraordinarias: 'capital_fijo', extraordinarias: [{ periodo: 3, monto: 1000 }] } },
      { opciones: { gracia: { tipo: 'capitalizar', periodos: 2 } } },
      { opciones: { gracia: { tipo: 'diferir', periodos: 2, cobroDiferido: 'repartido' } } },
      { opciones: { gracia: { tipo: 'parcial', periodos: 2 } } },
      { tipoAmortizacion: 'manual', cantidadCuotas: 2, opciones: { calendario: [
        { fechaVencimiento: '2027-01-31', capital: 1000, interes: 100, cargos: 10 },
        { fechaVencimiento: '2027-05-01', capital: 9000, interes: 100, cargos: 10 },
      ] } },
    ];
    for (const variant of variants) {
      const input = { ...base, ...variant, moneda: 'HNL' as const, acreedorId: acreedor.id, fechaDesembolso: '2027-01-01' };
      const created = await service.crearPrestamo(input, actor);
      let detail = await service.obtenerPrestamo(created.id);
      assert.equal(detail.diferenciaCapital, 0);
      assert.equal(detail.cuotas.length, created.cuotas.length);
      assert.equal(detail.prestamo.tipoAmortizacion, input.tipoAmortizacion);
      assert.equal(detail.prestamo.interesCapitalizado, created.interesCapitalizado);
      const first = detail.cuotas.find(q => q.monto > 0)!;
      // Una edición conserva la versión anterior y genera otra cuota vigente.
      await service.editarCuota(created.id, first.id, { fechaVencimiento: first.fechaVencimiento, capital: first.capital, interes: first.interes, cargos: first.cargos }, actor);
      detail = await service.obtenerPrestamo(created.id);
      assert.equal(detail.historialCuotas.length, 1);
      assert.equal(detail.historialCuotas[0].id, first.id);
      // Abonar no toca el calendario histórico ni elimina cuotas físicamente.
      await service.registrarAbono(created.id, { monto: 500, fecha: '2027-01-01', metodo: 'transferencia' }, 'cuota', actor);
      detail = await service.obtenerPrestamo(created.id);
      assert.equal(detail.diferenciaCapital, 0);
      assert(detail.historialCuotas.length > 1);
      if (input.tipoAmortizacion === 'manual') assert.equal(detail.cuotas.reduce((sum, q) => sum + q.interes, 0), 200);
      const beforePayment = detail.cuotas.filter(q => q.monto > 0);
      const pending = money(beforePayment.reduce((sum, q) => sum + q.monto, 0));
      const payment = await service.registrarPago(created.id, { monto: pending, fecha: '2027-01-01', metodo: 'transferencia' }, actor);
      assert(payment.liquidado);
      detail = await service.obtenerPrestamo(created.id);
      assert.equal(detail.prestamo.estado, 'pagado');
      assert.equal(detail.pagos.length, 2);
      assert.equal(detail.diferenciaCapital, 0);
      const storedBefore = await pool.request().input('id', sql.BigInt, created.id).query('SELECT COUNT(*) filas FROM dbo.prestamos_cuotas WHERE prestamo_id=@id');
      await service.eliminarPrestamo(created.id, actor);
      const storedAfter = await pool.request().input('id', sql.BigInt, created.id).query('SELECT COUNT(*) filas FROM dbo.prestamos_cuotas WHERE prestamo_id=@id');
      assert.equal(storedBefore.recordset[0].filas, storedAfter.recordset[0].filas);
      assert.equal((await service.obtenerPrestamo(created.id)).prestamo, null);
      await assert.rejects(() => service.registrarPago(created.id, { monto: 1, fecha: '2027-01-01', metodo: 'efectivo' }, actor), /no encontrado/);
    }
    // Las aplicaciones de pagos parciales conservan su cuota original al abonar.
    const partial = await service.crearPrestamo({ ...base, moneda: 'HNL', acreedorId: acreedor.id, fechaDesembolso: '2027-01-01' }, actor);
    await service.registrarPago(partial.id, { monto: 200, fecha: '2027-01-01', metodo: 'efectivo' }, actor);
    const oldPartial = (await service.obtenerPrestamo(partial.id)).cuotas[0];
    await service.registrarAbono(partial.id, { monto: 2000, fecha: '2027-01-01', metodo: 'efectivo' }, 'plazo', actor);
    const afterPartial = await service.obtenerPrestamo(partial.id);
    assert.deepEqual(afterPartial.cuotas[0], oldPartial);
    assert(afterPartial.cuotas.length < 12);
    assert.equal(afterPartial.diferenciaCapital, 0);
    await assert.rejects(() => service.editarCuota(partial.id, oldPartial.id, { fechaVencimiento: oldPartial.fechaVencimiento, capital: oldPartial.capital, interes: oldPartial.interes, cargos: oldPartial.cargos }, actor), /sin pagos/);
    const partialReport = (await service.reporte('2027-01-01', '2027-12-31')).filter(row => row.creadoPor === actor);
    assert.equal(money(partialReport.reduce((sum, row) => sum + row.monto, 0)), 2200);
    assert.equal(money(partialReport.reduce((sum, row) => sum + row.capital + row.interes + row.cargos, 0)), 2200);
    await service.eliminarPrestamo(partial.id, actor);
    const manualInput = variants[variants.length - 1];
    const manual = await service.crearPrestamo({ ...base, ...manualInput, moneda: 'HNL', acreedorId: acreedor.id, fechaDesembolso: '2027-01-01' }, actor);
    const manualAbono = await service.registrarAbono(manual.id, { monto: 10000, fecha: '2027-01-01', metodo: 'efectivo' }, 'cuota', actor);
    assert.equal(manualAbono.liquidado, false);
    const manualDetail = await service.obtenerPrestamo(manual.id);
    assert.equal(manualDetail.cuotas.reduce((sum, q) => sum + q.capital, 0), 0);
    assert.equal(manualDetail.cuotas.reduce((sum, q) => sum + q.monto, 0), 220);
    assert.equal(manualDetail.diferenciaCapital, 0);
    await service.eliminarPrestamo(manual.id, actor);
    const deferred = await service.crearPrestamo({ ...base, opciones: { gracia: { tipo: 'diferir', periodos: 2, cobroDiferido: 'repartido' } }, moneda: 'HNL', acreedorId: acreedor.id, fechaDesembolso: '2027-01-01' }, actor);
    const deferredBefore = await service.obtenerPrestamo(deferred.id);
    assert.equal(money(deferredBefore.cuotas.reduce((sum, q) => sum + q.interesDiferido, 0)), 200);
    await service.registrarAbono(deferred.id, { monto: 10000, fecha: '2027-01-01', metodo: 'efectivo' }, 'cuota', actor);
    const deferredAfter = await service.obtenerPrestamo(deferred.id);
    assert.equal(money(deferredAfter.cuotas.reduce((sum, q) => sum + q.interes, 0)), 200);
    assert.equal(money(deferredAfter.cuotas.reduce((sum, q) => sum + q.capital, 0)), 0);
    assert.equal(deferredAfter.prestamo.estado, 'activo');
    await service.eliminarPrestamo(deferred.id, actor);
    assert(!(await service.listarPrestamos()).some(row => Number(row.acreedorId) === acreedor.id));
    assert(!(await service.resumen()).porAcreedor.some(row => Number(row.acreedorId) === acreedor.id));
    assert(!(await service.reporte('2027-01-01', '2027-12-31')).some(row => row.creadoPor === actor));
    console.log(`OK: ${variants.length} variantes y pagos parciales · persistencia, edición con historial, abonos, reducción de plazo, reportes, liquidación y borrado lógico. Todo se revierte.`);
  } finally {
    await queue;
    (sql as unknown as { Transaction: unknown }).Transaction = Transaction;
    pool.request = original.request;
    transaction.begin = original.begin; transaction.commit = original.commit; transaction.rollback = original.rollback;
    await transaction.rollback();
    await closeAuthPool();
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
