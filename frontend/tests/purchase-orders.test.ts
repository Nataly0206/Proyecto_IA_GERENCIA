import { test } from 'node:test';
import assert from 'node:assert/strict';
import { filterPurchaseOrders, groupPurchaseOrders } from '../src/utils/purchaseOrders';
import type { PurchaseOrderLine } from '../src/types/purchaseOrders';

const line: PurchaseOrderLine = { contractNumber: 'OC-1', client: 'Cliente', itemCode: 'ITEM-1', product: 'Camarón PPV', size: '41/50', pendingKg: 100, pendingMasters: 10, delayWeeks: 0 };

test('agrupa por cliente y contrato, suma kilos y masters y conserva máximo de atraso', () => {
  const lines = [line, { ...line, itemCode: 'ITEM-2', pendingKg: 50.5, pendingMasters: 5, delayWeeks: 2 }, { ...line, client: 'Otro cliente', delayWeeks: 1 }];
  const orders = groupPurchaseOrders(lines);
  assert.equal(orders.length, 2);
  assert.equal(orders[0].client, 'Cliente');
  assert.equal(orders[0].pendingKg, 150.5);
  assert.equal(orders[0].pendingMasters, 15);
  assert.equal(orders[0].delayWeeks, 2);
  assert.equal(orders[0].lines.length, 2);
  assert.equal(lines[0].pendingKg, 100);
});

test('busca sin acentos y combina cliente, talla, atraso y términos de búsqueda', () => {
  const lines = [line, { ...line, contractNumber: 'OC-2', size: '31/40', delayWeeks: 3 }];
  const filters = { search: 'camaron ppv OC-2', client: 'Cliente', size: '31/40', delay: 'late' };
  assert.equal(filterPurchaseOrders(lines, filters).length, 1);
  assert.equal(filterPurchaseOrders(lines, { ...filters, client: 'Otro' }).length, 0);
  assert.equal(filterPurchaseOrders(lines, { search: '', client: '', size: '', delay: 'none' })[0].contractNumber, 'OC-1');
});

test('totales filtrados conservan solo las líneas coincidentes; una fuente vacía no crea órdenes', () => {
  const selected = filterPurchaseOrders([line, { ...line, itemCode: 'ITEM-2', size: '31/40', pendingKg: 50 }], { search: '', client: '', size: '41/50', delay: '' });
  assert.equal(groupPurchaseOrders(selected)[0].pendingKg, 100);
  assert.deepEqual(groupPurchaseOrders([]), []);
});
