import assert from 'node:assert/strict';
import { test } from 'node:test';
import { build } from 'esbuild';
const { outputFiles } = await build({ entryPoints: ['src/utils/inventoryFilters.ts'], bundle: true, write: false, format: 'esm', platform: 'node' });
const { migrateInventoryFilters: migrate } = await import(`data:text/javascript;base64,${Buffer.from(outputFiles[0].text).toString('base64')}`);

test('legacy defaults include sibling clients under the same principal', () => {
  const filters = migrate({ nombreCliente: ['FRANCIA DP 2026 FRESCO', 'LFF UK 2026 FRESCO'], estiloFinal: ['PPV-FR'] });
  assert.deepEqual(filters, { nombreClientePrincipal: ['FRANCIA DP', 'LFF UK'], estiloFinal: ['PPV-FR'] });
  const items = [
    { nombreCliente: 'FRANCIA DP 2026 FRESCO', nombreClientePrincipal: 'FRANCIA DP', estiloFinal: 'PPV-FR' },
    { nombreCliente: 'FRANCIA DP 2026', nombreClientePrincipal: 'FRANCIA DP', estiloFinal: 'PPV-FR' },
  ];
  assert.equal(items.filter(item => Object.entries(filters).every(([field, values]) => values.includes(item[field]))).length, 2);
});
test('preserves explicit principal selection, custom filters and empty preferences', () => {
  assert.deepEqual(migrate({ nombreCliente: ['FRANCIA DP', 'LFF UK'], nombreClientePrincipal: ['FRANCIA DP'] }), { nombreClientePrincipal: ['FRANCIA DP'] });
  for (const filters of [{}, { nombreCliente: ['FRANCIA DP 2026 FRESCO'] }, { nombreCliente: ['otro'] }]) {
    assert.deepEqual(migrate(filters), filters);
  }
});
test('versioned preferences permit intentional selection of the former default pair', () => {
  const filters = { nombreCliente: ['FRANCIA DP 2026 FRESCO', 'LFF UK 2026 FRESCO'] };
  assert.deepEqual(migrate(filters, 2), filters);
});
