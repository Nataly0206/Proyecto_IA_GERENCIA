const { test } = require('node:test');
const assert = require('node:assert/strict');
const ExcelJS = require('exceljs');
const sqlService = require('../dist/services/sql.service');
const { EXPORTACIONES_TRAZABILIDAD_QUERY } = require('../dist/services/procesos.queries');
const { getExportacionesTrazabilidad } = require('../dist/services/procesos.service');
const { buildTrazabilidadExcel } = require('../dist/services/trazabilidad.excel');

test('trazabilidad usa el origen corregido de la OP en lectura, agrupación y ordenación', () => {
  for (const expression of [
    "COALESCE(NULLIF(LTRIM(RTRIM(op.FincaMadre)), ''), lr.Finca)",
    "COALESCE(NULLIF(LTRIM(RTRIM(op.NoLagunaMadre)), ''), lr.laguna)",
  ]) {
    assert.ok(EXPORTACIONES_TRAZABILIDAD_QUERY.includes(expression));
    assert.ok(EXPORTACIONES_TRAZABILIDAD_QUERY.split('GROUP BY')[1].includes(expression));
    assert.ok(EXPORTACIONES_TRAZABILIDAD_QUERY.split('ORDER BY')[1].includes(expression));
  }
});

test('descarga conserva origen corregido, cero inicial de laguna y totales en ambos formatos', async () => {
  const original = sqlService.runQuery;
  try {
    sqlService.runQuery = async (query, params) => {
      assert.equal(query, EXPORTACIONES_TRAZABILIDAD_QUERY);
      assert.deepEqual(params.map(p => p.value), ['2026-11-05', 'MNBU 451399-9', 'EXPORT-01239']);
      return [{ CodigoEmbarque: 'STBLS26-89', Contenedor: 'MNBU 451399-9',
        PO: 'PO-1', Item: 'Producto', CodigoItem: 'ITEM', Finca: 'INMAR', Laguna: '03',
        FechaProduccion: '2026-10-01', CodigoProduccion: '3121711', Master: 5, Libras: 110.23 }];
    };
    const rows = await getExportacionesTrazabilidad('2026-11-05', 'MNBU 451399-9', 'EXPORT-01239');
    for (const uk of [false, true]) {
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(await buildTrazabilidadExcel(rows, uk));
      const sheet = workbook.worksheets[0];
      assert.equal(sheet.getCell('B4').value, 'INMAR');
      assert.equal(sheet.getCell('C4').value, '03');
      assert.equal(sheet.getCell('E4').value, '3121711');
      assert.equal(sheet.getCell('F6').value, 5);
      assert.equal(sheet.getCell('G6').value, 110.23);
    }
  } finally { sqlService.runQuery = original; }
});
