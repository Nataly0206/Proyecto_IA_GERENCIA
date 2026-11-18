const { test } = require('node:test');
const assert = require('node:assert/strict');
const stb = require('../dist/services/stb.service');
const cache = require('../dist/utils/ttlCache');
const values = new Map();
let reads = [];
let room = 'Sala 1';
cache.withTtlCache = async (key, ttl, loader, force = false) => {
  if (!force && values.has(key)) return values.get(key);
  const value = await loader(); values.set(key, value); return value;
};
stb.runStbQuery = async (query, params) => {
  const to = params.find(p => p.name === 'Hasta').value;
  const fromParam = params.find(p => p.name === 'Desde');
  if (!fromParam) {
    reads.push({ kind: 'names', query, params });
    return [{ IdEmpleado: 1, Nombre: 'Uno' }, { IdEmpleado: 2, Nombre: 'Dos' }, { IdEmpleado: 9, Nombre: 'Otro' }];
  }
  const from = fromParam.value;
  reads.push({ kind: 'locations', from, to, query, params });
  const row = (id, day, room) => ({ IdEmpleado: id, Fuente: 'production', Dia: day, Hora: '08:00:00', Proceso: 'Pelado', Sala: room });
  return from === to ? [row(1, to, room), row(1, to, 'Sala 2'), row(1, to, 'Sala 2'), row(9, to, 'Sala 5')]
    : [row(1, to, 'Sala 3'), row(2, to, 'Sala 4'), row(9, to, 'Sala 6')];
};
const { getStaffLocations } = require('../dist/services/production-staff-location.service');
test('reutiliza histórico y nombres por día, consulta hoy, filtra IDs y conserva empates de última pesada', async () => {
  const day = '2026-11-18';
  const first = await getStaffLocations([2, 1, 1], day, day);
  assert.equal(reads.length, 3);
  assert.ok(reads.every(r => !r.params.some(p => /^Id\d+$/.test(p.name))), 'no envía lista de IDs a SQL');
  assert.equal(first.length, 3, 'filtra al empleado 9 y quita duplicados');
  assert.ok(first.every(r => r.id !== 9));
  assert.ok(first.filter(r => r.id === 1).every(r => r.day === day && r.name === 'Uno'));
  assert.equal(first.find(r => r.id === 2).day, '2026-11-17');
  assert.equal(first.find(r => r.id === 2).name, 'Dos');
  assert.ok(!reads.find(r => r.kind === 'locations' && r.to < day).query.includes('VAsistenciaActividades'));
  // Una persona nueva que marca entrada no invalida el histórico (clave por día, no por IDs).
  reads = []; room = 'Sala 4';
  const next = await getStaffLocations([1, 2, 9], day, day);
  assert.equal(reads.length, 1);
  assert.equal(reads[0].from, day);
  assert.equal(reads[0].to, day);
  assert.ok(next.some(r => r.id === 1 && r.room === 'Sala 4'));
  assert.ok(next.some(r => r.id === 9 && r.name === 'Otro'));
  reads = [];
  await getStaffLocations([1, 2], day, day, true);
  assert.equal(reads.length, 3);
  reads = [];
  assert.deepEqual(await getStaffLocations([], day, day), []);
  assert.equal(reads.length, 0);
});
