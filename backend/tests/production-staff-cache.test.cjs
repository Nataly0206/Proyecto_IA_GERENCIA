const { test } = require('node:test');
const assert = require('node:assert/strict');
const payroll = require('../dist/services/payroll.service');
const cache = require('../dist/utils/ttlCache');
const values = new Map();
let reads = [];
cache.withTtlCache = async (key, ttl, loader, force = false) => {
  if (!force && values.has(key)) return values.get(key);
  const value = await loader(); values.set(key, value); return value;
};
payroll.runPayrollQuery = async (query, params) => {
  const from = params.find(p => p.name === 'Desde').value;
  const to = params.find(p => p.name === 'Hasta').value;
  reads.push({ from, to });
  if (query.includes('UltimaFecha')) return [{ UltimaFecha: to }];
  return [{ Dia: to, IdEmpleado: 1, CodigoEmpleado: '1', Nombre: 'Persona', Puesto: 'OBRA', Fuente: 'report', MarcaReporte: 'A' }];
};
const { getProductionStaffHistory, staffToday } = require('../dist/services/production-staff.service');

test('histórico reutiliza días anteriores y renueva solo hoy; actualizar fuerza ambos bloques', async () => {
  const today = staffToday();
  const first = await getProductionStaffHistory(today);
  assert.equal(reads.length, 4);
  assert.equal(first.days.length, 30);
  assert.equal(new Set(first.days.map(day => day.day)).size, 30);
  assert.equal(first.lastAttendance, today);
  const original = reads.slice();
  assert.ok(original.some(read => read.from === today && read.to === today));
  assert.ok(original.some(read => read.to < today));
  await getProductionStaffHistory(today);
  assert.equal(reads.length, 4);
  for (const key of values.keys()) if (key.startsWith('personal:history-today:')) values.delete(key);
  reads = [];
  const next = await getProductionStaffHistory(today);
  assert.equal(reads.length, 2);
  assert.ok(reads.every(read => read.from === today && read.to === today));
  assert.deepEqual(next.days, first.days);
  reads = [];
  await getProductionStaffHistory(today, true);
  assert.equal(reads.length, 4);
  reads = [];
  const past = await getProductionStaffHistory('2026-01-31');
  assert.equal(reads.length, 2);
  assert.equal(past.days.length, 30);
  assert.ok(reads.every(read => read.to === '2026-01-31'));
});
