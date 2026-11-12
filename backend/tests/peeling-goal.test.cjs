const { test } = require('node:test');
const assert = require('node:assert/strict');
const authDb = require('../dist/config/authDb');
let stored;
authDb.getAuthPool = async () => ({
  request() {
    const inputs = {};
    return {
      input(name, _type, value) { inputs[name] = value; return this; },
      async query(sql) {
        if (sql.includes('MERGE')) {
          const parsed = JSON.parse(inputs.value);
          // ISJSON(valor) in SQL Server requires an object or array.
          assert.ok(parsed !== null && typeof parsed === 'object');
          stored = inputs.value;
          return { recordset: [] };
        }
        return { recordset: stored === undefined ? [] : [{ valor: stored }] };
      },
    };
  },
});
const { getPeelingDailyGoal, savePeelingDailyGoal } = require('../dist/services/shared-config.service');

test('la meta se guarda como objeto JSON y conserva las libras al leerla', async () => {
  assert.equal(await getPeelingDailyGoal(), null);
  for (const goal of [25000, 12500.75]) {
    await savePeelingDailyGoal(goal);
    assert.deepEqual(JSON.parse(stored), { goal });
    assert.equal(await getPeelingDailyGoal(), goal);
  }
  stored = '{"goal":0}';
  assert.equal(await getPeelingDailyGoal(), null);
});
