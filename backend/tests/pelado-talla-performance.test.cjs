const { test } = require('node:test');
const assert = require('node:assert/strict');
const { peelingSizePerformance } = require('../dist/utils/peladoTallaPerformance');
const record = (id, talla, libras, horas, sinHoras = 0) => ({ id, talla, libras, horas, sinHoras });

test('L/HP divide las libras entre TRABAJADOS acumulado, sin multiplicar nuevamente por personas', () => {
  const rows = peelingSizePerformance([
    record(1, '31-35', 34.40, 1.60), record(2, '31-35', 31.64, 1.60), record(3, '31-35', 17.50, 0.95),
  ]);
  const row = rows[0];
  assert.equal(row.personas, 3);
  assert.equal(row.horasPelado, 4.15);
  assert.ok(Math.abs(row.librasHoraPersona - 83.54 / 4.15) < 1e-10);
  assert.ok(Math.abs(row.rendimientosPersonas[0].rendimiento - 21.5) < 1e-10);
  assert.ok(Math.abs(row.rendimientosPersonas[1].rendimiento - 19.775) < 1e-10);
});

test('agrupa 61/70 y deduplica personas entre variantes, fechas y tallas en el total', () => {
  const rows = peelingSizePerformance([
    record(1, '61-70 ALTO', 10, 1), record(1, '61/70 BAJO', 20, 2), record(2, '61-70 NORMAL', 30, 3),
    record(1, '41-50', 40, 4),
  ]);
  const size = rows.find(row => row.talla === '61/70');
  assert.equal(size.personas, 2);
  assert.equal(size.horasPelado, 6);
  assert.equal(size.libras, 60);
  assert.equal(size.librasHoraPersona, 10);
  assert.equal(size.rendimientosPersonas.length, 2);
  assert.ok(rows.every(row => row.personasPlanta === 2 && row.horasPeladoPlanta === 10 && row.librasHoraPersonaPlanta === 10));
});

test('datos incompletos no se muestran como cero ni convierten horas parciales en un rendimiento completo', () => {
  const row = peelingSizePerformance([record(1, '41-50', 40, 4), record(2, '41-50', 20, 0, 1)])[0];
  assert.equal(row.personas, 2);
  assert.equal(row.horasPelado, null);
  assert.equal(row.librasHoraPersona, null);
  assert.equal(row.librasHoraPersonaPlanta, null);
  assert.equal(row.rendimientosPersonas.length, 1);
});

test('tasas pequeñas conservan precisión y los registros sin producción no agregan días u horas', () => {
  const row = peelingSizePerformance([record(1, 'Mix Pedazos', .01, 3), record(2, 'Mix Pedazos', 0, 40)])[0];
  assert.equal(row.personas, 1);
  assert.equal(row.librasHoraPersona, .01 / 3);
});

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const source = fs.readFileSync(path.join(__dirname, '../../frontend/src/utils/peladoTallas.ts'), 'utf8');
const result = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 } });
const exported = {};
vm.runInNewContext(result.outputText, { exports: exported });
const { getTopPeelingPerformance } = exported;

test('el 20% selecciona las mejores personas y promedia L/HP, sin dividir la tasa general entre 0.2', () => {
  const profiles = Array.from({ length: 770 }, (_, index) => ({ rendimiento: 770 - index, libras: 770 - index, horas: 1 }));
  const selected = getTopPeelingPerformance(profiles, 20);
  assert.equal(selected.count, 154);
  assert.equal(selected.total, 770);
  assert.equal(selected.rate, (770 + 617) / 2);
  assert.equal(getTopPeelingPerformance(profiles, 100).rate, 385.5);
  assert.equal(getTopPeelingPerformance(profiles, 0), null);
  assert.equal(getTopPeelingPerformance(profiles, NaN), null);
  assert.equal(getTopPeelingPerformance([], 20), null);
  assert.equal(getTopPeelingPerformance(profiles.slice(0, 3), 20).count, 1);
});
