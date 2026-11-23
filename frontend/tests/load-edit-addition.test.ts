import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prepareLoadAddition, refreshAddedLoadGroup, type EditableLoadGroup } from '../src/utils/loadEditAddition';
import type { StockItem } from '../src/types/preload';

const group: EditableLoadGroup = { key: 'item', item: {} as StockItem, inventoryTotal: 8, requested: 0, excludedLots: [],
  lots: [{ key: 'oldest', item: {} as StockItem, current: 3, maximum: 3, assigned: 0 }, { key: 'newer', item: {} as StockItem, current: 5, maximum: 5, assigned: 0 }] };

test('propone primero las producciones antiguas y conserva faltantes sin exceder existencia', () => {
  assert.deepEqual(prepareLoadAddition(group, 6), { quantities: { oldest: '3', newer: '3' }, missing: 0 });
  assert.deepEqual(prepareLoadAddition(group, 10), { quantities: { oldest: '3', newer: '5' }, missing: 2 });
  assert.equal(group.lots[0].assigned, 0);
  for (const quantity of [0, -1, 1.5, NaN]) assert.throws(() => prepareLoadAddition(group, quantity), /entera/);
});

test('al actualizar existencias conserva los lotes retirados con máximo cero para revisar la asignación', () => {
  const latest = { ...group, inventoryTotal: 2, lots: [{ ...group.lots[1], current: 2, maximum: 2 }] };
  const refreshed = refreshAddedLoadGroup(group, latest);
  assert.equal(refreshed.inventoryTotal, 2);
  assert.equal(refreshed.lots.find(lot => lot.key === 'oldest')?.maximum, 0);
  assert.equal(refreshed.lots.find(lot => lot.key === 'newer')?.current, 2);
  const exhausted = refreshAddedLoadGroup(group);
  assert.equal(exhausted.inventoryTotal, 0);
  assert.ok(exhausted.lots.every(lot => lot.maximum === 0));
});
