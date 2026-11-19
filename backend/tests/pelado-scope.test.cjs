const { test } = require('node:test');
const assert = require('node:assert/strict');
const stb = require('../dist/services/stb.service');
const { PELADO_TALLA_PERSONAL_RENDIMIENTO_QUERY } = require('../dist/services/stb.queries');
let minHours;
stb.runStbQuery = async (query, params) => {
  assert.equal(query, PELADO_TALLA_PERSONAL_RENDIMIENTO_QUERY);
  minHours = params.find(param => param.name === 'MinHours').value;
  return [
    { Fuente: 'BASE', Talla: '61-70 ALTO', IdEmpleado: 1, Libras: 10 },
    { Fuente: 'BASE', Talla: '61-70 BAJO', IdEmpleado: 1, Libras: 20 },
    { Fuente: 'PBI', Talla: '61-70 ALTO', IdEmpleado: 1, Libras: 10, HorasTrabajadas: 1 },
    { Fuente: 'PBI', Talla: '61-70 BAJO', IdEmpleado: 1, Libras: 20, HorasTrabajadas: 2 },
    // A view record from an excluded area cannot add pounds or a person.
    { Fuente: 'PBI', Talla: '41-50', IdEmpleado: 99, Libras: 999, HorasTrabajadas: 1 },
    // A mixed-room record must not assign all its hours to only the included pounds.
    { Fuente: 'BASE', Talla: '41-50', IdEmpleado: 2, Libras: 40 },
    { Fuente: 'PBI', Talla: '41-50', IdEmpleado: 2, Libras: 60, HorasTrabajadas: 3 },
  ];
};
const { getPeladoPorTalla } = require('../dist/services/dashboard.service');
test('detalle usa las libras incluidas, normaliza tallas y solo incorpora horas que concilian', async () => {
  const filters = { fechaInicial: '2026-11-01', fechaFinal: '2026-11-17' };
  const rows = await getPeladoPorTalla(filters, 2);
  assert.equal(minHours, 2);
  assert.equal(rows.reduce((sum, row) => sum + row.libras, 0), 70);
  assert.ok(rows.every(row => row.personasPlanta === 2));
  const grouped = rows.find(row => row.talla === '61/70');
  assert.equal(grouped.libras, 30);
  assert.equal(grouped.personas, 1);
  assert.equal(grouped.librasHoraPersona, 10);
  const mixed = rows.find(row => row.talla === '41/50');
  assert.equal(mixed.libras, 40);
  assert.equal(mixed.librasHoraPersona, null);
  assert.equal(mixed.rendimientosPersonas.length, 0);
});

test('todas las consultas de libras de pelado usan el mismo alcance (incluyendo anulados y SALA DESCABEZADO para conciliar con el reporte operativo)', () => {
  const queries = require('../dist/services/stb.queries');
  assert.doesNotMatch(queries.PELADO_INCLUDED_RECORDS, /SALA DESCABEZADO/);
  assert.doesNotMatch(queries.PELADO_INCLUDED_RECORDS, /ANULADO/);
  for (const name of [
    'PELADO_BY_DIMENSION_QUERY', 'PELADO_BY_DIMENSION_DAILY_QUERY', 'PELADO_LIBRAS_HOY_QUERY',
    'PELADO_LIBRAS_HOY_TALLA_QUERY', 'PELADO_RITMO_ULTIMA_HORA_QUERY', 'PELADO_MINUTOS_TRANSCURRIDOS_HOY_QUERY',
    'PELADO_POR_SALA_DIARIO_QUERY', 'PELADO_TALLA_PERSONAL_RENDIMIENTO_QUERY',
  ]) {
    assert.ok(queries[name].includes(queries.PELADO_INCLUDED_RECORDS), `${name} no aplica PELADO_INCLUDED_RECORDS`);
    assert.match(queries[name], /PES_SALAS s ON/, `${name} no une la sala`);
  }
});
