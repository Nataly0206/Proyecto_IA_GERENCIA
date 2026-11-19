const { test } = require('node:test');
const assert = require('node:assert/strict');
const stb = require('../dist/services/stb.service');
const queries = require('../dist/services/stb.queries');
let missingHours = false;
stb.runStbQuery = async query => {
  if (query === queries.PELADO_BY_DIMENSION_DAILY_QUERY) return [
    { Dia: '2026-11-16', Turno: 'TURNO A', Estilo: 'PD', Talla: '51/60', Libras: 600 },
    { Dia: '2026-11-17', Turno: 'TURNO A', Estilo: 'PUD', Talla: '41/50', Libras: 400 },
    { Dia: '2026-11-22', Turno: 'TURNO A', Estilo: 'PD', Talla: '51/60', Libras: 0 },
    { Dia: '2026-11-18', Turno: 'TURNO B', Estilo: 'PD', Talla: '51/60', Libras: 9000 },
  ];
  if (query === queries.PELADO_HORAS_TRABAJADAS_DIA_QUERY) return [
    { Dia: '2026-11-16', Horas: 3 }, { Dia: '2026-11-17', Horas: missingHours ? 0 : 4 },
    { Dia: '2026-11-22', Horas: 12 }, { Dia: '2026-11-18', Horas: 10 },
  ];
  if (query === queries.PELADO_PERSONAL_DAILY_QUERY) return [
    { Dia: '2026-11-16', Turno: 'TURNO A', IdEmpleado: 1, Libras: 300 },
    { Dia: '2026-11-16', Turno: 'TURNO A', IdEmpleado: 2, Libras: 300 },
    { Dia: '2026-11-16', Turno: 'TURNO A', IdEmpleado: 2, Libras: 1 },
    { Dia: '2026-11-17', Turno: 'TURNO A', IdEmpleado: 3, Libras: 400 },
    { Dia: '2026-11-17', Turno: 'TURNO A', IdEmpleado: 4, Libras: 0 },
    { Dia: '2026-11-22', Turno: 'TURNO A', IdEmpleado: 5, Libras: 0 },
    { Dia: '2026-11-18', Turno: 'TURNO B', IdEmpleado: 6, Libras: 9000 },
  ];
  throw new Error('Consulta no esperada');
};
const { getPeladoPorEstiloDia } = require('../dist/services/dashboard.service');
const filters = { fechaInicial: '2026-11-01', fechaFinal: '2026-11-30', turno: 'A' };
test('semana y mes ponderan personal diario y excluyen días sin producción o de otro turno', async () => {
  for (const period of ['semana', 'mes']) {
    const rows = await getPeladoPorEstiloDia(filters, period);
    assert.ok(rows.length > 0);
    assert.ok(rows.every(row => row.diasTrabajados === 2));
    assert.ok(rows.every(row => row.horasTrabajadas === 7));
    // 1.000 lbs / (3 h × 2 personas + 4 h × 1 persona) = 100.
    assert.ok(rows.every(row => row.rendimientoPorPersona === 100));
  }
});
test('si una jornada con producción no tiene horas válidas, el rendimiento queda sin dato', async () => {
  missingHours = true;
  try {
    const rows = await getPeladoPorEstiloDia(filters, 'mes');
    assert.ok(rows.every(row => row.rendimientoPorPersona === null));
  } finally { missingHours = false; }
});

