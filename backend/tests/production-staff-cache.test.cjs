const { test } = require('node:test');
const assert = require('node:assert/strict');
const payroll = require('../dist/services/payroll.service');
const stb = require('../dist/services/stb.service');
const { PAYROLL_STAFF_COMPLEMENT_QUERY, STB_FIRST_WEIGHING_QUERY, STB_STAFF_SHIFT_HISTORY_QUERY } = require('../dist/services/production-staff.queries');
payroll.runPayrollQuery = async (query, params) => {
  if (query !== PAYROLL_STAFF_COMPLEMENT_QUERY) return [];
  return [{ Dia: params.find(p => p.name === 'Hasta').value, IdEmpleado: 1, Nombre: 'Persona', Fuente: 'payroll', Puesto: 'DESTAJO' }];
};
const cache = require('../dist/utils/ttlCache');
const values = new Map();
let reads = [];
cache.withTtlCache = async (key, ttl, loader, force = false) => {
  if (!force && values.has(key)) return values.get(key);
  const value = await loader(); values.set(key, value); return value;
};
stb.runStbQuery = async (query, params) => {
  if (!params.some(p => p.name === 'Desde') || query === STB_STAFF_SHIFT_HISTORY_QUERY) return [];
  const from = params.find(p => p.name === 'Desde').value;
  const to = params.find(p => p.name === 'Hasta').value;
  reads.push({ from, to });
  if (query !== STB_FIRST_WEIGHING_QUERY) return [];
  return [{ Dia: to, IdEmpleado: 1, Fuente: 'weighing', Entrada: '06:00:00' }];
};
const { getProductionStaffHistory, staffToday } = require('../dist/services/production-staff.service');

test('histórico reutiliza días anteriores y renueva solo hoy; actualizar fuerza ambos bloques', async () => {
  const today = staffToday();
  const first = await getProductionStaffHistory(today);
  // Dos fuentes operativas por bloque: chequeos y pesas.
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
