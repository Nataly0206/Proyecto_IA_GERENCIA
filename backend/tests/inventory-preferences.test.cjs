const assert = require('node:assert/strict');
const { test } = require('node:test');
const express = require('express');
const preferences = require('../dist/services/inventory-preferences.service');

test('Inventario conserva la unidad de peso por usuario y acepta preferencias anteriores', async () => {
  const original = { get: preferences.getInventoryPreferences, save: preferences.saveInventoryPreferences };
  const saved = new Map();
  preferences.getInventoryPreferences = async id => saved.get(id) ?? null;
  preferences.saveInventoryPreferences = async (id, value) => { saved.set(id, value); };
  const app = express();
  app.use(express.json());
  app.use((_req, res, next) => { res.locals.authUser = { id: 'usuario-prueba' }; next(); });
  app.use('/inventory', require('../dist/routes/inventory.routes').default);
  let server;
  await new Promise(resolve => { server = app.listen(0, '127.0.0.1', resolve); });
  const url = `http://127.0.0.1:${server.address().port}/inventory/preferences`;
  const update = value => fetch(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) });
  try {
    const base = { rowFields: ['nombreCliente', 'estiloFinal'], filters: {} };
    assert.equal((await update({ ...base, weightUnit: 'lbs' })).status, 200);
    assert.equal((await (await fetch(url)).json()).preferences.weightUnit, 'lbs');
    assert.deepEqual(saved.get('usuario-prueba').rowFields, base.rowFields);
    assert.deepEqual(saved.get('usuario-prueba').filters, {});
    assert.equal((await update({ ...base, filterVersion: 2 })).status, 200);
    assert.equal((await (await fetch(url)).json()).preferences.filterVersion, 2);
    assert.equal((await update({ ...base, filterVersion: 99 })).status, 400);
    assert.equal((await update(base)).status, 200);
    assert.equal(saved.get('usuario-prueba').weightUnit, 'kg');
    assert.equal((await update({ ...base, weightUnit: 'otra' })).status, 400);
    assert.equal(saved.get('usuario-prueba').weightUnit, 'kg');
  } finally {
    preferences.getInventoryPreferences = original.get;
    preferences.saveInventoryPreferences = original.save;
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
});
