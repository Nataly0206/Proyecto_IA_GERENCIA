const assert = require('node:assert/strict');
const { test } = require('node:test');
const stb = require('../dist/services/stb.service');
const queries = require('../dist/services/stb.queries');
const { getPeladoLibrasHoy } = require('../dist/services/dashboard.service');

test('El ritmo reciente es independiente del promedio acumulado; cero no reutiliza el promedio', async () => {
  const original = stb.runStbQuery;
  let recent = 4000;
  stb.runStbQuery = async query => {
    if (query === queries.PELADO_LIBRAS_HOY_ESTILOS_QUERY) return [{ Estilo: 'A' }];
    if (query === queries.PELADO_LIBRAS_HOY_QUERY) return [{ Estilo: 'A', Libras: 24000 }];
    if (query === queries.PELADO_MINUTOS_TRANSCURRIDOS_HOY_QUERY) return [{ MinutosTranscurridos: 480 }];
    if (query === queries.PELADO_RITMO_ULTIMA_HORA_QUERY) return [{ Libras: recent, Desde: '2026-10-22T09:30:00', Hasta: '2026-10-22T10:30:00' }];
    throw new Error('Consulta inesperada');
  };
  try {
    const result = await getPeladoLibrasHoy();
    assert.equal(result.total, 24000);
    assert.equal(result.librasPorHoraPromedio, 3000);
    assert.equal(result.ritmoUltimaHora.libras, 4000);
    assert.equal(result.ritmoUltimaHora.desde, '2026-10-22T09:30:00');
    recent = 0;
    const stopped = await getPeladoLibrasHoy();
    assert.equal(stopped.ritmoUltimaHora.libras, 0);
    assert.equal(stopped.librasPorHoraPromedio, 3000);
  } finally { stb.runStbQuery = original; }
});
