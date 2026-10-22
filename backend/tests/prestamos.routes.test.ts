import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { Server } from 'node:http';
import express from 'express';
import router from '../src/routes/prestamos.routes';
import { errorHandler } from '../src/middleware/errorHandler';

let server: Server, url: string;
before(async () => {
  const app = express();
  app.use(express.json({ limit: '256kb' }));
  app.use('/prestamos', router);
  app.use(errorHandler);
  await new Promise<void>(resolve => { server = app.listen(0, '127.0.0.1', resolve); });
  url = `http://127.0.0.1:${(server.address() as { port: number }).port}/prestamos/simular`;
});
after(async () => { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())); });
const input = { monto: 10000, tasaAnual: 12, cantidadCuotas: 12, frecuencia: 'mensual', tipoAmortizacion: 'cuota_fija', fechaPrimeraCuota: '2027-01-31', cargoCuota: 0 };
const post = (patch: Record<string, unknown>) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...input, ...patch }) });

test('API de simulación devuelve el calendario con opciones estructuradas', async () => {
  const response = await post({ tipoAmortizacion: 'balon', opciones: { balon: { valor: 30, unidad: 'porcentaje', base: 'cuota_fija' } } });
  assert.equal(response.status, 200);
  const body = await response.json() as { cuotas: { capital: number; saldo: number }[] };
  assert.equal(body.cuotas.length, 12);
  assert.equal(body.cuotas[11].capital, 3000);
  assert.equal(body.cuotas[11].saldo, 0);
});
test('API rechaza opciones incompletas y fechas imposibles con 400', async () => {
  for (const patch of [
    { tipoAmortizacion: 'balon' },
    { tipoAmortizacion: 'manual', cantidadCuotas: 1, opciones: { calendario: [null] } },
    { tipoAmortizacion: 'pago_unico', opciones: { interesPagoUnico: 'otro' } },
    { tipoAmortizacion: 'creciente', opciones: { crecimiento: { modo: 'variable', indice: 'IPC', variaciones: [null] } } },
    { fechaPrimeraCuota: '2027-02-31' }, { opciones: [] },
  ]) {
    const response = await post(patch);
    assert.equal(response.status, 400);
    assert.equal(typeof (await response.json() as { error: string }).error, 'string');
  }
});
test('API acepta un calendario manual de 1.000 cuotas mayor que 64 kb', async () => {
  const calendario = Array.from({ length: 1000 }, (_, i) => ({ fechaVencimiento: new Date(Date.UTC(2027, 0, i + 1)).toISOString().slice(0, 10), capital: 10, interes: 1, cargos: 1 }));
  const payload = { tipoAmortizacion: 'manual', cantidadCuotas: 1000, fechaPrimeraCuota: '2027-01-01', opciones: { calendario } };
  assert(Buffer.byteLength(JSON.stringify(payload)) > 64 * 1024);
  const response = await post(payload);
  assert.equal(response.status, 200);
  const result = await response.json() as { cuotas: unknown[]; totalPagar: number };
  assert.equal(result.cuotas.length, 1000); assert.equal(result.totalPagar, 12000);
});
