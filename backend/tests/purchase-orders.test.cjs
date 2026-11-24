const { test } = require('node:test');
const assert = require('node:assert/strict');
const axios = require('axios').default;
const express = require('express');
const { env } = require('../dist/config/env');
const service = require('../dist/services/purchase-orders.service');
const router = require('../dist/routes/purchase-orders.routes').default;

const line = { numero_contrato: 'OC-1', cliente: 'Cliente', codigo_item: 'ITEM-1', producto: 'Producto', talla: '41/50', kg_pendiente: 10650, masters_pendiente: 1065, semanas_atraso: 0 };
const payload = { generado: '2026-11-24T14:45:08.651Z', actualizado: '2026-11-24T14:45:06.975Z', cantidad: 1, lineas: [line] };

test('normaliza campos del servicio externo conservando cantidades, cero atraso y fechas de origen', () => {
  const result = service.normalizePurchaseOrders(payload);
  assert.equal(result.lines.length, 1);
  assert.equal(result.lines[0].contractNumber, 'OC-1');
  assert.equal(result.lines[0].pendingKg, 10650);
  assert.equal(result.lines[0].pendingMasters, 1065);
  assert.equal(result.lines[0].delayWeeks, 0);
  assert.equal(result.updatedAt, payload.actualizado);
  assert.equal(result.generatedAt, payload.generado);
  assert.ok(Number.isFinite(Date.parse(result.fetchedAt)));
  assert.deepEqual(service.normalizePurchaseOrders({ lineas: [] }).lines, []);
});

test('rechaza respuestas inválidas en vez de mostrarlas como órdenes vacías o cantidades cero', () => {
  for (const value of [null, [], {}, { lineas: {} }, { lineas: [null] }, { lineas: [{ ...line, kg_pendiente: '10650' }] }, { lineas: [{ ...line, masters_pendiente: -1 }] }, { lineas: [{ ...line, semanas_atraso: 1.5 }] }, { lineas: [{ ...line, numero_contrato: '' }] }]) {
    assert.throws(() => service.normalizePurchaseOrders(value), error => error.statusCode === 502);
  }
});

test('consulta la URL configurada con clave en backend, y no expone secretos ante errores', async () => {
  const get = axios.get, previousUrl = env.PURCHASE_ORDERS_API_URL, previousKey = env.PURCHASE_ORDERS_API_KEY;
  env.PURCHASE_ORDERS_API_URL = 'http://orders.internal/api'; env.PURCHASE_ORDERS_API_KEY = 'server-only-test-key';
  try {
    axios.get = async (url, options) => {
      assert.equal(url, env.PURCHASE_ORDERS_API_URL);
      assert.equal(options.headers['x-api-key'], 'server-only-test-key');
      assert.equal(options.maxRedirects, 0); assert.equal(options.timeout, 15000);
      return { data: payload };
    };
    const result = await service.getPurchaseOrders();
    assert.equal(result.lines.length, 1);
    assert.ok(!JSON.stringify(result).includes('server-only-test-key'));
    for (const [code, status, expected] of [['ECONNABORTED', undefined, 504], ['ERR_BAD_RESPONSE', 401, 502], ['ECONNREFUSED', undefined, 502]]) {
      axios.get = async () => { throw Object.assign(new Error('server-only-test-key'), { isAxiosError: true, code, response: { status } }); };
      await assert.rejects(() => service.getPurchaseOrders(), error => error.statusCode === expected && !error.message.includes('server-only-test-key') && !error.details);
    }
    env.PURCHASE_ORDERS_API_KEY = '';
    await assert.rejects(() => service.getPurchaseOrders(), error => error.statusCode === 503);
  } finally { axios.get = get; env.PURCHASE_ORDERS_API_URL = previousUrl; env.PURCHASE_ORDERS_API_KEY = previousKey; }
});

test('la ruta exige el permiso propio y admite administrador; otros permisos no conceden acceso', async () => {
  const original = service.getPurchaseOrders;
  let calls = 0;
  service.getPurchaseOrders = async () => { calls++; return service.normalizePurchaseOrders(payload); };
  const app = express();
  app.use((req, res, next) => { if (req.headers.permissions) res.locals.authUser = { esAdministrador: req.headers.permissions === 'admin', permisos: [req.headers.permissions] }; next(); });
  app.use('/orders', router);
  const server = app.listen(0, '127.0.0.1'); await new Promise(resolve => server.once('listening', resolve));
  try {
    const url = `http://127.0.0.1:${server.address().port}/orders`;
    for (const permissions of ['', 'cargas', 'inventario', 'compra_materia_prima']) assert.equal((await fetch(url, { headers: { permissions } })).status, 403);
    assert.equal(calls, 0);
    for (const permissions of ['ordenes_compra', 'admin']) {
      const response = await fetch(url, { headers: { permissions } });
      assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store');
      assert.equal((await response.json()).lines.length, 1);
    }
  } finally { service.getPurchaseOrders = original; await new Promise(resolve => server.close(resolve)); }
});
